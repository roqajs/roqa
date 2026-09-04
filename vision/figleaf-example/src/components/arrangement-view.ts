import {
	cell,
	component,
	effect,
	event,
	forBlock,
	get,
	on,
	type MountScope,
	type TemplateInstance,
} from "roqa";
import { template } from "roqa/authoring";
import type { DawCells, DispatchDawAction, MidiNoteState, TrackState } from "../types/daw";

interface ArrangementProps extends Record<string, unknown> {
	model: DawCells;
	dispatch: DispatchDawAction;
}

const arrangementTemplate = template(
	`
		<section data-ref="section" class="arrangement" aria-label="Arrangement">
			<div class="arrangement-header">
				<div class="project-title"><strong data-ref="projectName"></strong></div>
				<div data-ref="ruler" class="ruler" aria-hidden="true"></div>
			</div>
			<div data-ref="playhead" class="arrangement-playhead" aria-hidden="true"></div>
			<div class="arrangement-content">
				<div data-ref="list" class="track-list"></div>
				<div class="add-track-control">
					<button data-ref="addAudio" class="add-audio" type="button">+ Audio track</button>
					<button data-ref="addMidi" class="add-midi" type="button">+ MIDI / 4OSC</button>
				</div>
			</div>
		</section>
	`,
	{
		section: HTMLElement,
		projectName: HTMLElement,
		ruler: HTMLDivElement,
		playhead: HTMLDivElement,
		list: HTMLDivElement,
		addAudio: HTMLButtonElement,
		addMidi: HTMLButtonElement,
	},
);

const trackTemplate = template(
	`
		<div data-ref="row" class="track-row">
			<aside class="track-header">
				<div class="track-topline">
					<button data-ref="select" class="track-select" type="button">
						<span data-ref="index" class="track-index"></span><span data-ref="name" class="track-name"></span>
					</button>
					<button data-ref="mute" class="track-toggle mute" type="button">M</button>
					<button data-ref="solo" class="track-toggle solo" type="button">S</button>
					<button data-ref="remove" class="track-toggle delete" type="button">×</button>
				</div>
				<label class="gain-row"><span>GAIN</span>
					<input data-ref="gain" type="range" min="-60" max="12" step="0.1" />
					<output data-ref="gainOutput"></output>
				</label>
			</aside>
			<section data-ref="lane" class="lane"><div data-ref="timeline" class="timeline-surface"></div></section>
		</div>
	`,
	{
		row: HTMLDivElement,
		select: HTMLButtonElement,
		index: HTMLSpanElement,
		name: HTMLSpanElement,
		mute: HTMLButtonElement,
		solo: HTMLButtonElement,
		remove: HTMLButtonElement,
		gain: HTMLInputElement,
		gainOutput: HTMLOutputElement,
		lane: HTMLElement,
		timeline: HTMLDivElement,
	},
);

const clipTemplate = template(
	`
		<article data-ref="clip" class="clip">
			<header class="clip-header"><span class="clip-grip"></span>
				<span data-ref="name" class="clip-name"></span><span data-ref="format" class="clip-format"></span>
			</header>
			<div data-ref="body" class="clip-body"></div>
		</article>
	`,
	{ clip: HTMLElement, name: HTMLSpanElement, format: HTMLSpanElement, body: HTMLDivElement },
);

const noteTemplate = template(`<span data-ref="note"></span>`, { note: HTMLSpanElement });
const emptyClipTemplate = template(
	`<button data-ref="button" class="import-empty" type="button">Click to import audio</button>`,
	{ button: HTMLButtonElement },
);

export const ArrangementView = component<ArrangementProps>(
	"arrangement-view",
	function ArrangementView({ model, dispatch }) {
		const selectTrack = (track: TrackState) => void dispatch("selectTrack", track.id);
		const toggleMute = (track: TrackState) => void dispatch("toggleTrackMute", track.id);
		const toggleSolo = (track: TrackState) => void dispatch("toggleTrackSolo", track.id);
		const deleteTrack = (track: TrackState) => void dispatch("deleteTrack", track.id);
		const importAudio = (track: TrackState) => {
			void dispatch("selectTrack", track.id).then(() => dispatch("importAudio"));
		};

		this.mount((scope) => {
			const view = arrangementTemplate();
			const { section, projectName, ruler, playhead, list, addAudio, addMidi } = view.refs;

			on(event.click, addAudio, () => void dispatch("addTrack", "audio"));
			on(event.click, addMidi, () => void dispatch("addTrack", "midi"));

			scope.own(
				forBlock(list, model.tracks, {
					key: (track) => track.id,
					render: (track, itemScope) =>
						renderTrack(track, model, dispatch, itemScope, {
							selectTrack,
							toggleMute,
							toggleSolo,
							deleteTrack,
							importAudio,
						}),
				}),
				effect(() => {
					projectName.textContent = get(model.projectName) || "Untitled";
				}),
				effect(() => renderRuler(ruler, get(model.songLengthBars))),
				effect(() => {
					const duration = get(model.duration);
					const ratio = duration > 0 ? get(model.position) / duration : 0;
					playhead.style.left = `${196 + Math.max(0, Math.min(1, ratio)) * 640}px`;
				}),
				effect(() => {
					section.style.setProperty(
						"--timeline-width",
						`${640 * (get(model.timelineZoom) / 100)}px`,
					);
				}),
			);
			return view;
		});
	},
);

interface TrackHandlers {
	selectTrack(track: TrackState): void;
	toggleMute(track: TrackState): void;
	toggleSolo(track: TrackState): void;
	deleteTrack(track: TrackState): void;
	importAudio(track: TrackState): void;
}

function renderTrack(
	track: TrackState,
	model: DawCells,
	dispatch: DispatchDawAction,
	scope: MountScope,
	handlers: TrackHandlers,
): TemplateInstance<object> {
	const view = trackTemplate();
	const { row, select, index, name, mute, solo, remove, gain, gainOutput, lane, timeline } =
		view.refs;

	row.dataset.trackId = track.id;
	index.textContent = String(track.index + 1).padStart(2, "0");
	name.textContent = track.name;
	mute.classList.toggle("active", track.muted);
	solo.classList.toggle("active", track.soloed);
	gain.value = String(track.gainDb);
	gainOutput.textContent = formatGain(track.gainDb);

	on(event.click, select, handlers.selectTrack, track);
	on(event.click, lane, handlers.selectTrack, track);
	on(event.click, mute, handlers.toggleMute, track);
	on(event.click, solo, handlers.toggleSolo, track);
	on(event.click, remove, handlers.deleteTrack, track);
	on(event.input, gain, () => {
		gainOutput.textContent = formatGain(Number(gain.value));
	});
	on(event.change, gain, () => {
		void dispatch("setTrackGain", { trackId: track.id, gainDb: Number(gain.value) });
	});

	if (track.hasClip) {
		const clip = createClip(track, model.songLengthBeats, scope);
		timeline.append(clip.fragment);
	} else {
		const empty = emptyClipTemplate();
		on(event.click, empty.refs.button, handlers.importAudio, track);
		timeline.append(empty.fragment);
	}

	scope.own(
		effect(() => {
			const selected = get(model.selectedTrackId) === track.id;
			row.classList.toggle("selected", selected);
			select.setAttribute("aria-pressed", String(selected));
		}),
	);
	return view;
}

function createClip(
	track: TrackState,
	songLengthBeats: { v: number },
	scope: MountScope,
): TemplateInstance<object> {
	const view = clipTemplate();
	const { clip, name, format, body } = view.refs;
	const duration = Math.max(1, songLengthBeats.v);

	name.textContent = track.clipName || "Clip";
	format.textContent = track.kind === "midi" ? "MIDI / 4OSC" : "AUDIO";
	clip.classList.toggle("midi-clip", track.kind === "midi");
	clip.style.left = `${(track.clipStartBeat / duration) * 100}%`;
	clip.style.width = `${(track.clipLengthBeats / duration) * 100}%`;

	if (track.kind === "midi") {
		body.classList.add("midi-overview");
		const notes = cell(track.midiNotes);
		scope.own(
			forBlock(body, notes, {
				key: (note) => note.id,
				render: (note) => {
					const noteView = noteTemplate();
					positionNote(noteView.refs.note, note, Math.max(track.clipLengthBeats, 1));
					return noteView;
				},
			}),
		);
	} else {
		body.classList.add("waveform-preview");
		for (let index = 0; index < 48; index += 1) {
			const bar = document.createElement("i");
			bar.style.height = `${20 + ((index * 17) % 75)}%`;
			body.append(bar);
		}
	}
	return view;
}

function positionNote(element: HTMLElement, note: MidiNoteState, clipLength: number): void {
	element.style.left = `${(note.startBeat / clipLength) * 100}%`;
	element.style.width = `${(note.lengthBeats / clipLength) * 100}%`;
	element.style.bottom = `${Math.max(0, Math.min(100, ((note.pitch - 36) / 49) * 100))}%`;
	element.style.opacity = String(0.45 + (note.velocity / 127) * 0.55);
}

function renderRuler(ruler: HTMLElement, bars: number): void {
	const marks = Array.from({ length: bars + 1 }, (_, index) => {
		const mark = document.createElement("span");
		mark.textContent = String(index + 1);
		mark.style.left = `${(index / bars) * 100}%`;
		return mark;
	});
	ruler.replaceChildren(...marks);
}

function formatGain(value: number): string {
	return value <= -59.9 ? "-inf" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
