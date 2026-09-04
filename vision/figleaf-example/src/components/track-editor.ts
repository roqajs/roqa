import {
	component,
	computed,
	effect,
	event,
	forBlock,
	get,
	on,
	showBlock,
	type Cell,
	type MountScope,
	type TemplateInstance,
} from "roqa";
import { template } from "roqa/authoring";
import type { DawCells, DispatchDawAction, TrackState } from "../types/daw";

interface TrackEditorProps extends Record<string, unknown> {
	model: DawCells;
	dispatch: DispatchDawAction;
}

const editorHostTemplate = template(
	`<section data-ref="host" class="editor-panel" aria-label="Selected track editor"></section>`,
	{ host: HTMLElement },
);
const emptyTemplate = template(
	`<div class="editor-empty">Select a track to open its editor.</div>`,
	{},
);
const audioTemplate = template(
	`
		<section data-ref="section" class="audio-editor">
			<header class="editor-header">
				<div><strong>Audio Editor</strong><span data-ref="clipName" class="clip-name"></span></div>
				<button data-ref="importButton" class="editor-action" type="button">Import / Replace Audio</button>
			</header>
			<canvas data-ref="canvas" class="waveform" aria-label="Selected audio waveform. Click to seek."></canvas>
		</section>
	`,
	{
		section: HTMLElement,
		clipName: HTMLSpanElement,
		importButton: HTMLButtonElement,
		canvas: HTMLCanvasElement,
	},
);
const midiTemplate = template(
	`
		<section data-ref="section" class="piano-roll-panel" aria-label="Piano roll">
			<header class="editor-header"><div class="scale-filters">
				<label>Key<select data-ref="root" class="scale-root">
					<option value="0">C</option><option value="2">D</option><option value="4">E</option>
					<option value="5">F</option><option value="7">G</option><option value="9">A</option><option value="11">B</option>
				</select></label>
				<label>Mode<select data-ref="mode" class="scale-mode">
					<option value="chromatic">Chromatic</option><option value="major">Major</option>
					<option value="minor">Natural Minor</option><option value="dorian">Dorian</option>
				</select></label><span data-ref="count" class="note-count"></span>
			</div></header>
			<div class="piano-roll-scroll"><div data-ref="keys" class="piano-keys" aria-hidden="true"></div>
				<div data-ref="grid" class="piano-grid" tabindex="0" aria-label="MIDI piano roll. Double-click to add a note.">
					<div data-ref="notesHost" class="piano-notes"></div><div data-ref="playhead" class="editor-playhead"></div>
				</div>
			</div>
			<footer class="piano-roll-footer"><span>Double-click add</span><span>Drag move</span><span>Edge resize</span>
				<label>VELOCITY <input type="range" min="1" max="127" value="100" /></label>
			</footer>
		</section>
	`,
	{
		section: HTMLElement,
		root: HTMLSelectElement,
		mode: HTMLSelectElement,
		count: HTMLSpanElement,
		keys: HTMLDivElement,
		grid: HTMLDivElement,
		notesHost: HTMLDivElement,
		playhead: HTMLDivElement,
	},
);
const pianoNoteTemplate = template(
	`<button data-ref="note" class="piano-note" type="button"></button>`,
	{ note: HTMLButtonElement },
);

export const TrackEditor = component<TrackEditorProps>(
	"track-editor",
	function TrackEditor({ model, dispatch }) {
		const selectedTrack = computed<TrackState | undefined>(() =>
			get(model.tracks).find((track) => track.id === get(model.selectedTrackId)),
		);

		this.mount((scope) => {
			const view = editorHostTemplate();
			const { host } = view.refs;
			scope.own(
				showBlock(
					host,
					() => get(selectedTrack) === undefined,
					() => emptyTemplate(),
				),
				showBlock(
					host,
					() => get(selectedTrack)?.kind === "audio",
					(blockScope) => renderAudioEditor(selectedTrack, model, dispatch, blockScope),
				),
				showBlock(
					host,
					() => get(selectedTrack)?.kind === "midi",
					(blockScope) => renderMidiEditor(selectedTrack, model, dispatch, blockScope),
				),
			);
			return view;
		});
	},
);

function renderAudioEditor(
	selectedTrack: Cell<TrackState | undefined>,
	model: DawCells,
	dispatch: DispatchDawAction,
	scope: MountScope,
): TemplateInstance<object> {
	const view = audioTemplate();
	const { clipName, importButton, canvas } = view.refs;

	on(event.click, importButton, () => void dispatch("importAudio"));
	on(event.pointerdown, canvas, (pointer) => {
		const bounds = canvas.getBoundingClientRect();
		const ratio = (pointer.clientX - bounds.left) / Math.max(1, bounds.width);
		void dispatch("seek", Math.max(0, Math.min(1, ratio)) * get(model.duration));
	});

	scope.own(
		effect(() => {
			const track = get(selectedTrack);
			clipName.textContent = track?.clipName || `${track?.name ?? "Audio"} / No clip`;
			drawWaveform(canvas, get(model.position), get(model.duration));
		}),
	);
	return view;
}

function renderMidiEditor(
	selectedTrack: Cell<TrackState | undefined>,
	model: DawCells,
	dispatch: DispatchDawAction,
	scope: MountScope,
): TemplateInstance<object> {
	const view = midiTemplate();
	const { root, mode, count, keys, grid, notesHost, playhead } = view.refs;
	const notes = computed(() => get(selectedTrack)?.midiNotes ?? []);

	keys.append(
		...Array.from({ length: 25 }, (_, index) => {
			const key = document.createElement("span");
			key.textContent = index % 12 === 0 ? `C${5 - Math.floor(index / 12)}` : "";
			return key;
		}),
	);

	scope.own(
		forBlock(notesHost, notes, {
			key: (note) => note.id,
			render: (note) => {
				const noteView = pianoNoteTemplate();
				const element = noteView.refs.note;
				element.style.left = `${(note.startBeat / 8) * 100}%`;
				element.style.width = `${(note.lengthBeats / 8) * 100}%`;
				element.style.top = `${((84 - note.pitch) / 48) * 100}%`;
				element.style.opacity = String(0.55 + (note.velocity / 127) * 0.45);
				element.title = `MIDI ${note.pitch}, velocity ${note.velocity}`;
				return noteView;
			},
		}),
		effect(() => {
			const currentNotes = get(notes);
			count.textContent = `${currentNotes.length} ${currentNotes.length === 1 ? "note" : "notes"}`;
		}),
		effect(() => {
			root.value = String(get(model.songKeyRoot));
			mode.value = get(model.songKeyMode);
		}),
		effect(() => {
			const beat = get(model.position) * (get(model.bpm) / 60);
			playhead.style.left = `${((beat % 8) / 8) * 100}%`;
		}),
	);

	const updateKey = () =>
		void dispatch("setSongKey", { root: Number(root.value), mode: mode.value });
		on(event.change, root, updateKey);
		on(event.change, mode, updateKey);
		on(event.dblclick, grid, (pointer) => {
		const track = get(selectedTrack);
		if (!track) return;
		const bounds = grid.getBoundingClientRect();
		const startBeat = Math.round(((pointer.clientX - bounds.left) / bounds.width) * 32) / 4;
		const pitch = Math.round(84 - ((pointer.clientY - bounds.top) / bounds.height) * 48);
		void dispatch("addMidiNote", { trackId: track.id, startBeat, pitch });
	});
	return view;
}

function drawWaveform(canvas: HTMLCanvasElement, position: number, duration: number): void {
	const bounds = canvas.getBoundingClientRect();
	const scale = window.devicePixelRatio || 1;
	canvas.width = Math.max(1, Math.floor(bounds.width * scale));
	canvas.height = Math.max(1, Math.floor(bounds.height * scale));
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas 2D context is unavailable");
	context.setTransform(scale, 0, 0, scale, 0, 0);
	context.clearRect(0, 0, bounds.width, bounds.height);
	context.strokeStyle = "#7c9cff";
	context.beginPath();
	const center = bounds.height / 2;
	for (let x = 0; x < bounds.width; x += 2) {
		event;
		const amplitude = (0.25 + Math.sin(x * 0.07) ** 2 * 0.65) * center;
		context.moveTo(x, center - amplitude);
		context.lineTo(x, center + amplitude);
	}
	context.stroke();
	context.strokeStyle = "#ffcc66";
	const playhead = duration > 0 ? (position / duration) * bounds.width : 0;
	context.beginPath();
	context.moveTo(playhead, 0);
	context.lineTo(playhead, bounds.height);
	context.stroke();
}
