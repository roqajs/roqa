import type {
	ActionArgs,
	DawAction,
	DawActions,
	DawBridge,
	DawState,
	MidiNoteState,
	TrackKind,
	TrackState,
} from "../types/daw";
import { cloneTrack, createInitialState } from "../app/model";

export function createBridge(): DawBridge {
	return new MockBridge();
}

class MockBridge implements DawBridge {
	private state = createInitialState();
	private readonly listeners = new Set<(state: DawState) => void>();
	private readonly interval = window.setInterval(() => this.tick(), 50);
	private nextTrackId = 3;
	private nextNoteId = 20;

	async getState(): Promise<DawState> {
		return this.snapshot();
	}

	async dispatch<K extends DawAction>(
		action: K,
		...args: ActionArgs<DawActions[K]>
	): Promise<DawState> {
		const value: unknown = args[0];
		this.state.statusMessage = "Ready";

		switch (action) {
			case "togglePlay":
				this.state.playing = !this.state.playing;
				break;
			case "toggleLoop":
				this.state.looping = !this.state.looping;
				break;
			case "stop":
				this.state.playing = false;
				this.state.position = 0;
				break;
			case "seek":
				this.state.position = clamp(Number(value), 0, this.state.duration);
				break;
			case "setBpm":
				this.state.bpm = clamp(Number(value), 30, 300);
				this.updateDuration();
				break;
			case "setSongLengthBars":
				this.state.songLengthBars = clamp(Math.round(Number(value)), 1, 512);
				this.updateDuration();
				break;
			case "setSongKey": {
				const data = readObject(value);
				this.state.songKeyRoot = clamp(Math.round(Number(data?.root)), 0, 11);
				this.state.songKeyMode = String(data?.mode ?? "major");
				break;
			}
			case "selectTrack":
				if (this.findTrack(String(value))) this.state.selectedTrackId = String(value);
				break;
			case "addTrack":
				this.addTrack(value === "midi" ? "midi" : "audio");
				break;
			case "deleteTrack":
				this.deleteTrack(String(value));
				break;
			case "setTrackGain": {
				const data = readObject(value);
				const track = this.findTrack(String(data?.trackId));
				if (track) track.gainDb = clamp(Number(data?.gainDb), -60, 12);
				break;
			}
			case "toggleTrackMute": {
				const track = this.findTrack(String(value));
				if (track) track.muted = !track.muted;
				break;
			}
			case "toggleTrackSolo": {
				const track = this.findTrack(String(value));
				if (track) track.soloed = !track.soloed;
				break;
			}
			case "moveClip": {
				const data = readObject(value);
				const track = this.findTrack(String(data?.trackId));
				if (track?.hasClip) {
					track.clipStartBeat = clamp(
						Number(data?.startBeat),
						0,
						this.state.songLengthBeats - track.clipLengthBeats,
					);
				}
				break;
			}
			case "deleteClip": {
				const track = this.findTrack(String(value));
				if (track) {
					track.hasClip = false;
					track.clipName = "";
					track.midiNotes = [];
				}
				break;
			}
			case "addMidiNote":
				this.addMidiNote(value);
				break;
			case "importAudio": {
				const track = this.findTrack(this.state.selectedTrackId);
				if (track?.kind === "audio") {
					track.hasClip = true;
					track.clipName = "imported-audio";
					track.clipStartBeat = 0;
					track.clipLengthBeats = 16;
				}
				break;
			}
			case "openProject":
				this.state.projectName = "Opened Project";
				break;
			case "saveProject":
				this.state.statusMessage = "Project saved";
				break;
			case "saveProjectAs":
				this.state.projectName = "Saved Project";
				break;
			case "audioSettings":
				this.state.statusMessage = "Audio settings would open in JUCE";
				break;
		}

		this.emit();
		return this.snapshot();
	}

	subscribe(listener: (state: DawState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	destroy(): void {
		window.clearInterval(this.interval);
		this.listeners.clear();
	}

	private addTrack(kind: TrackKind): void {
		const track: TrackState = {
			id: `track-${this.nextTrackId++}`,
			index: this.state.tracks.length,
			name: kind === "midi" ? "Synth" : "Audio",
			kind,
			muted: false,
			soloed: false,
			gainDb: -3,
			clipName: kind === "midi" ? "Pattern" : "",
			hasClip: kind === "midi",
			clipStartBeat: 0,
			clipLengthBeats: kind === "midi" ? 8 : 0,
			midiNotes: [],
		};
		this.state.tracks = [...this.state.tracks, track];
		this.state.selectedTrackId = track.id;
	}

	private deleteTrack(trackId: string): void {
		if (this.state.tracks.length === 1) {
			this.state.statusMessage = "A project must contain at least one track";
			return;
		}
		const removedIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (removedIndex < 0) return;
		this.state.tracks = this.state.tracks
			.filter((track) => track.id !== trackId)
			.map((track, index) => ({ ...track, index }));
		if (this.state.selectedTrackId === trackId) {
			this.state.selectedTrackId =
				this.state.tracks[Math.min(removedIndex, this.state.tracks.length - 1)]?.id ?? "";
		}
	}

	private addMidiNote(value: unknown): void {
		const data = readObject(value);
		const track = this.findTrack(String(data?.trackId));
		if (track?.kind !== "midi") return;
		const note: MidiNoteState = {
			id: `note-${this.nextNoteId++}`,
			pitch: clamp(Math.round(Number(data?.pitch ?? 60)), 0, 127),
			startBeat: clamp(Number(data?.startBeat ?? 0), 0, 7.75),
			lengthBeats: 0.5,
			velocity: 100,
		};
		track.hasClip = true;
		track.clipName = track.clipName || "Pattern";
		track.clipLengthBeats = Math.max(track.clipLengthBeats, 8);
		track.midiNotes = [...track.midiNotes, note].sort(
			(left, right) => left.startBeat - right.startBeat || left.pitch - right.pitch,
		);
	}

	private updateDuration(): void {
		this.state.songLengthBeats = this.state.songLengthBars * 4;
		this.state.duration = this.state.songLengthBeats * (60 / this.state.bpm);
		this.state.position = clamp(this.state.position, 0, this.state.duration);
	}

	private tick(): void {
		if (!this.state.playing) return;
		this.state.position += 0.05;
		if (this.state.position >= this.state.duration) {
			this.state.position = 0;
			this.state.playing = this.state.looping;
		}
		this.state.cpuUsage = 0.055 + Math.sin(Date.now() / 900) * 0.018;
		this.emit();
	}

	private findTrack(trackId: string): TrackState | undefined {
		return this.state.tracks.find((track) => track.id === trackId);
	}

	private emit(): void {
		const snapshot = this.snapshot();
		this.listeners.forEach((listener) => listener(snapshot));
	}

	private snapshot(): DawState {
		return {
			...this.state,
			tracks: this.state.tracks.map(cloneTrack),
		};
	}
}

function readObject(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
