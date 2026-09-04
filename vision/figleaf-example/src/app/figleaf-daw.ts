import { component, get, set } from "roqa";
import { template } from "roqa/authoring";
import type { DispatchDawAction } from "../types/daw";
import { ArrangementView } from "../components/arrangement-view";
import { StatusBar } from "../components/status-bar";
import { TrackEditor } from "../components/track-editor";
import { TransportBar } from "../components/transport-bar";
import { createBridge } from "../engine/bridge";
import { applySnapshot, createDawCells, createInitialState } from "./model";

const appTemplate = template(
	`
		<main class="shell">
			<transport-bar data-ref="transport"></transport-bar>
			<section class="workspace">
				<div class="work-area">
					<arrangement-view data-ref="arrangement"></arrangement-view>
					<track-editor data-ref="editor"></track-editor>
				</div>
			</section>
			<status-bar data-ref="status"></status-bar>
		</main>
	`,
	{
		transport: HTMLElement,
		arrangement: HTMLElement,
		editor: HTMLElement,
		status: HTMLElement,
	},
);

export const FigleafDaw = component("figleaf-daw", function FigleafDaw() {
	const bridge = createBridge();
	const model = createDawCells(createInitialState());

	const dispatch: DispatchDawAction = async (action, ...args) => {
		try {
			applySnapshot(model, await bridge.dispatch(action, ...args));
		} catch (error) {
			set(model.statusMessage, error instanceof Error ? error.message : `Could not run ${action}`);
		}
	};

	this.mount((scope) => {
		const view = appTemplate();
		TransportBar.setProps(view.refs.transport, { model, dispatch });
		ArrangementView.setProps(view.refs.arrangement, { model, dispatch });
		TrackEditor.setProps(view.refs.editor, { model, dispatch });
		StatusBar.setProps(view.refs.status, { model });

		scope.own(
			bridge,
			bridge.subscribe((state) => applySnapshot(model, state)),
		);
		scope.listen(window, "keydown", (event) => handleShortcut(event, dispatch));
		void bridge.getState().then((state) => applySnapshot(model, state));
		return view;
	});

	function handleShortcut(event: KeyboardEvent, run: DispatchDawAction): void {
		const target = event.target;
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLButtonElement
		) {
			return;
		}
		const command = event.metaKey || event.ctrlKey;
		if (event.code === "Space") {
			event.preventDefault();
			void run("togglePlay");
		} else if (event.key === "Enter") {
			event.preventDefault();
			void run("stop");
		} else if (!command && event.key.toLowerCase() === "l") {
			void run("toggleLoop");
		} else if (command && event.key.toLowerCase() === "s") {
			event.preventDefault();
			void run(event.shiftKey ? "saveProjectAs" : "saveProject");
		} else if (command && event.key.toLowerCase() === "t") {
			event.preventDefault();
			void run("addTrack", "audio");
		} else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			const selected = get(model.tracks).find((track) => track.id === get(model.selectedTrackId));
			if (!selected?.hasClip) return;
			const direction = event.key === "ArrowLeft" ? -1 : 1;
			const amount = event.shiftKey ? 4 : 0.25;
			void run("moveClip", {
				trackId: selected.id,
				startBeat: selected.clipStartBeat + direction * amount,
			});
		}
	}
});
