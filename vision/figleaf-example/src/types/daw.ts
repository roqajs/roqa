import type { Cell } from "roqa";

export interface MidiNoteState {
	id: string;
	pitch: number;
	startBeat: number;
	lengthBeats: number;
	velocity: number;
}

export type TrackKind = "audio" | "midi";

export interface TrackState {
	id: string;
	index: number;
	name: string;
	kind: TrackKind;
	muted: boolean;
	soloed: boolean;
	gainDb: number;
	clipName: string;
	hasClip: boolean;
	clipStartBeat: number;
	clipLengthBeats: number;
	midiNotes: MidiNoteState[];
}

export interface DawState {
	playing: boolean;
	looping: boolean;
	position: number;
	duration: number;
	bpm: number;
	songLengthBars: number;
	songLengthBeats: number;
	songKeyRoot: number;
	songKeyMode: string;
	projectName: string;
	tracks: TrackState[];
	selectedTrackId: string;
	deviceName: string;
	sampleRate: number;
	bufferSize: number;
	cpuUsage: number;
	statusMessage: string;
}

export interface DawActions {
	togglePlay: void;
	toggleLoop: void;
	stop: void;
	seek: number;
	setBpm: number;
	setSongLengthBars: number;
	setSongKey: { root: number; mode: string };
	moveClip: { trackId: string; startBeat: number };
	deleteClip: string;
	selectTrack: string;
	addTrack: TrackKind;
	deleteTrack: string;
	setTrackGain: { trackId: string; gainDb: number };
	toggleTrackMute: string;
	toggleTrackSolo: string;
	addMidiNote: { trackId: string; startBeat: number; pitch: number };
	importAudio: void;
	openProject: void;
	saveProject: void;
	saveProjectAs: void;
	audioSettings: void;
}

export type DawAction = keyof DawActions;
export type ActionArgs<T> = [T] extends [void] ? [] : [value: T];
export type DispatchDawAction = <K extends DawAction>(
	action: K,
	...args: ActionArgs<DawActions[K]>
) => Promise<void>;
export type DawStateListener = (state: DawState) => void;

export interface DawCells {
	playing: Cell<boolean>;
	looping: Cell<boolean>;
	position: Cell<number>;
	duration: Cell<number>;
	bpm: Cell<number>;
	songLengthBars: Cell<number>;
	songLengthBeats: Cell<number>;
	songKeyRoot: Cell<number>;
	songKeyMode: Cell<string>;
	projectName: Cell<string>;
	tracks: Cell<TrackState[]>;
	selectedTrackId: Cell<string>;
	deviceName: Cell<string>;
	sampleRate: Cell<number>;
	bufferSize: Cell<number>;
	cpuUsage: Cell<number>;
	statusMessage: Cell<string>;
	timelineZoom: Cell<number>;
}

export interface DawBridge {
	getState(): Promise<DawState>;
	dispatch<K extends DawAction>(action: K, ...args: ActionArgs<DawActions[K]>): Promise<DawState>;
	subscribe(listener: DawStateListener): () => void;
	destroy(): void;
}
