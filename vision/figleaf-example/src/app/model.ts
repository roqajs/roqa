import { batch, cell, get, set, type Cell } from "roqa";
import type { DawCells, DawState, MidiNoteState, TrackState } from "../types/daw";

const starterPitches = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];

const starterNotes: MidiNoteState[] = starterPitches.map((pitch, index) => ({
	id: `note-${index}`,
	pitch,
	startBeat: index < 13 ? index * 0.5 : index === 13 ? 6.75 : 7,
	lengthBeats: index === 12 ? 0.75 : index === 13 ? 0.25 : index === 14 ? 1 : 0.45,
	velocity: 96,
}));

const initialTracks: TrackState[] = [
	{
		id: "audio-1",
		index: 0,
		name: "Audio",
		kind: "audio",
		muted: false,
		soloed: false,
		gainDb: -3,
		clipName: "glass-percussion-01",
		hasClip: true,
		clipStartBeat: 4,
		clipLengthBeats: 24,
		midiNotes: [],
	},
	{
		id: "midi-1",
		index: 1,
		name: "Synth",
		kind: "midi",
		muted: false,
		soloed: false,
		gainDb: -3,
		clipName: "Ode to Joy",
		hasClip: true,
		clipStartBeat: 0,
		clipLengthBeats: 8,
		midiNotes: starterNotes,
	},
];

export function createInitialState(): DawState {
	return {
		playing: false,
		looping: false,
		position: 9.42,
		duration: 32,
		bpm: 120,
		songLengthBars: 16,
		songLengthBeats: 64,
		songKeyRoot: 0,
		songKeyMode: "major",
		projectName: "Night Sketch",
		tracks: initialTracks.map(cloneTrack),
		selectedTrackId: "midi-1",
		deviceName: "Built-in Output",
		sampleRate: 48_000,
		bufferSize: 256,
		cpuUsage: 0.074,
		statusMessage: "Ready",
	};
}

export function createDawCells(state: DawState): DawCells {
	return {
		playing: cell(state.playing),
		looping: cell(state.looping),
		position: cell(state.position),
		duration: cell(state.duration),
		bpm: cell(state.bpm),
		songLengthBars: cell(state.songLengthBars),
		songLengthBeats: cell(state.songLengthBeats),
		songKeyRoot: cell(state.songKeyRoot),
		songKeyMode: cell(state.songKeyMode),
		projectName: cell(state.projectName),
		tracks: cell(state.tracks),
		selectedTrackId: cell(state.selectedTrackId),
		deviceName: cell(state.deviceName),
		sampleRate: cell(state.sampleRate),
		bufferSize: cell(state.bufferSize),
		cpuUsage: cell(state.cpuUsage),
		statusMessage: cell(state.statusMessage),
		timelineZoom: cell(100),
	};
}

export function applySnapshot(model: DawCells, state: DawState): void {
	batch(() => {
		setIfChanged(model.playing, state.playing);
		setIfChanged(model.looping, state.looping);
		setIfChanged(model.position, state.position);
		setIfChanged(model.duration, state.duration);
		setIfChanged(model.bpm, state.bpm);
		setIfChanged(model.songLengthBars, state.songLengthBars);
		setIfChanged(model.songLengthBeats, state.songLengthBeats);
		setIfChanged(model.songKeyRoot, state.songKeyRoot);
		setIfChanged(model.songKeyMode, state.songKeyMode);
		setIfChanged(model.projectName, state.projectName);
		setIfChanged(model.selectedTrackId, state.selectedTrackId);
		setIfChanged(model.deviceName, state.deviceName);
		setIfChanged(model.sampleRate, state.sampleRate);
		setIfChanged(model.bufferSize, state.bufferSize);
		setIfChanged(model.cpuUsage, state.cpuUsage);
		setIfChanged(model.statusMessage, state.statusMessage);

		if (JSON.stringify(get(model.tracks)) !== JSON.stringify(state.tracks)) {
			set(model.tracks, state.tracks);
		}
	});
}

export function cloneTrack(track: TrackState): TrackState {
	return {
		...track,
		midiNotes: track.midiNotes.map((note) => ({ ...note })),
	};
}

function setIfChanged<T>(target: Cell<T>, value: T): void {
	if (!Object.is(get(target), value)) set(target, value);
}
