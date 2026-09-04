import { component, effect, event, get, on } from "roqa";
import { template } from "roqa/authoring";
import type { DawCells, DispatchDawAction } from "../types/daw";

interface TransportBarProps extends Record<string, unknown> {
	model: DawCells;
	dispatch: DispatchDawAction;
}

const transportTemplate = template(
	`
		<header class="topbar">
			<div class="file-tools">
				<button data-ref="open" class="text-button open" type="button">Open</button>
				<button data-ref="save" class="text-button save" type="button">Save</button>
				<button data-ref="saveAs" class="text-button save-as" type="button">Save As</button>
			</div>
			<div class="transport" role="toolbar" aria-label="Transport controls">
				<button data-ref="stop" class="icon-button stop" type="button" aria-label="Stop and return to start">|&lt;</button>
				<button data-ref="play" class="icon-button primary play" type="button" aria-label="Play">▶</button>
				<button data-ref="loop" class="icon-button loop" type="button" aria-label="Loop arrangement">↻</button>
				<output data-ref="timecode" class="timecode">00:00.00</output>
				<label class="transport-config">BPM<input data-ref="bpm" class="bpm" type="number" min="30" max="300" /></label>
				<label class="transport-config">BARS<input data-ref="bars" class="bars" type="number" min="1" max="512" /></label>
				<label class="transport-config">KEY<select data-ref="keyRoot" class="key-root">
					<option value="0">C</option><option value="1">C#</option><option value="2">D</option>
					<option value="3">D#</option><option value="4">E</option><option value="5">F</option>
					<option value="6">F#</option><option value="7">G</option><option value="8">G#</option>
					<option value="9">A</option><option value="10">A#</option><option value="11">B</option>
				</select></label>
				<select data-ref="keyMode" class="key-mode" aria-label="Song key mode">
					<option value="major">Major</option><option value="minor">Minor</option>
					<option value="dorian">Dorian</option><option value="mixolydian">Mixolydian</option>
					<option value="chromatic">Chromatic</option>
				</select>
			</div>
			<button data-ref="device" class="device" type="button">
				<span class="status-dot"></span><span data-ref="deviceName" class="device-name"></span>
				<span data-ref="deviceMeta" class="device-meta"></span>
			</button>
		</header>
	`,
	{
		open: HTMLButtonElement,
		save: HTMLButtonElement,
		saveAs: HTMLButtonElement,
		stop: HTMLButtonElement,
		play: HTMLButtonElement,
		loop: HTMLButtonElement,
		timecode: HTMLOutputElement,
		bpm: HTMLInputElement,
		bars: HTMLInputElement,
		keyRoot: HTMLSelectElement,
		keyMode: HTMLSelectElement,
		device: HTMLButtonElement,
		deviceName: HTMLSpanElement,
		deviceMeta: HTMLSpanElement,
	},
);

export const TransportBar = component<TransportBarProps>(
	"transport-bar",
	function TransportBar({ model, dispatch }) {
		this.mount((scope) => {
			const view = transportTemplate();
			const {
				open,
				save,
				saveAs,
				stop,
				play,
				loop,
				timecode,
				bpm,
				bars,
				keyRoot,
				keyMode,
				device,
				deviceName,
				deviceMeta,
			} = view.refs;

			on(event.click, open, () => void dispatch("openProject"));
			on(event.click, save, () => void dispatch("saveProject"));
			on(event.click, saveAs, () => void dispatch("saveProjectAs"));
			on(event.click, stop, () => void dispatch("stop"));
			on(event.click, play, () => void dispatch("togglePlay"));
			on(event.click, loop, () => void dispatch("toggleLoop"));
			on(event.click, device, () => void dispatch("audioSettings"));
			on(event.change, bpm, () => void dispatch("setBpm", Number(bpm.value)));
			on(event.change, bars, () => void dispatch("setSongLengthBars", Number(bars.value)));

			const updateKey = () =>
				void dispatch("setSongKey", {
					root: Number(keyRoot.value),
					mode: keyMode.value,
				});
			on(event.change, keyRoot, updateKey);
			on(event.change, keyMode, updateKey);

			scope.own(
				effect(() => {
					const playing = get(model.playing);
					play.classList.toggle("playing", playing);
					play.textContent = playing ? "Ⅱ" : "▶";
					play.setAttribute("aria-label", playing ? "Pause" : "Play");
					play.setAttribute("aria-pressed", String(playing));
				}),
				effect(() => {
					const looping = get(model.looping);
					loop.classList.toggle("looping", looping);
					loop.setAttribute("aria-pressed", String(looping));
				}),
				effect(() => {
					timecode.textContent = formatTime(get(model.position));
				}),
				effect(() => {
					if (document.activeElement !== bpm) bpm.value = String(Math.round(get(model.bpm)));
				}),
				effect(() => {
					if (document.activeElement !== bars) bars.value = String(get(model.songLengthBars));
				}),
				effect(() => {
					keyRoot.value = String(get(model.songKeyRoot));
					keyMode.value = get(model.songKeyMode);
				}),
				effect(() => {
					deviceName.textContent = get(model.deviceName);
					deviceMeta.textContent = `${Math.round(get(model.sampleRate) / 100) / 10}k / ${get(model.bufferSize)}`;
				}),
			);
			return view;
		});
	},
);

function formatTime(totalSeconds: number): string {
	const safeSeconds = Math.max(0, totalSeconds);
	const minutes = Math.floor(safeSeconds / 60);
	const seconds = Math.floor(safeSeconds % 60);
	const hundredths = Math.floor((safeSeconds % 1) * 100);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}
