import { component, effect, event, get, on, set } from "roqa";
import { template } from "roqa/authoring";
import type { DawCells } from "../types/daw";

interface StatusBarProps extends Record<string, unknown> {
	model: DawCells;
}

const statusTemplate = template(
	`
		<footer class="statusbar">
			<span><b>VISION</b> Proposed agent-first Roqa primitives</span>
			<div class="zoom-controls" role="group" aria-label="Timeline zoom">
				<button data-ref="zoomOut" class="zoom-out" type="button" aria-label="Zoom timeline out">−</button>
				<output data-ref="zoomValue" class="zoom-value">100%</output>
				<button data-ref="zoomIn" class="zoom-in" type="button" aria-label="Zoom timeline in">+</button>
			</div>
			<span data-ref="status" class="status-message"></span>
			<span data-ref="cpu" class="cpu"></span>
		</footer>
	`,
	{
		zoomOut: HTMLButtonElement,
		zoomValue: HTMLOutputElement,
		zoomIn: HTMLButtonElement,
		status: HTMLSpanElement,
		cpu: HTMLSpanElement,
	},
);

const zoomLevels = [75, 100, 150, 200, 300, 400, 600, 800, 1200];

export const StatusBar = component<StatusBarProps>("status-bar", function StatusBar({ model }) {
	this.mount((scope) => {
		const view = statusTemplate();
		const { zoomOut, zoomValue, zoomIn, status, cpu } = view.refs;

		const stepZoom = (direction: number) => {
			const currentIndex = zoomLevels.indexOf(get(model.timelineZoom));
			const nextIndex = Math.max(0, Math.min(zoomLevels.length - 1, currentIndex + direction));
			set(model.timelineZoom, zoomLevels[nextIndex] ?? 100);
		};
		on(event.click, zoomOut, () => stepZoom(-1));
		on(event.click, zoomIn, () => stepZoom(1));

		scope.own(
			effect(() => {
				const zoom = get(model.timelineZoom);
				zoomValue.textContent = `${zoom}%`;
				zoomOut.disabled = zoom === zoomLevels[0];
				zoomIn.disabled = zoom === zoomLevels.at(-1);
			}),
			effect(() => {
				status.textContent = get(model.statusMessage);
			}),
			effect(() => {
				cpu.textContent = `CPU ${(get(model.cpuUsage) * 100).toFixed(1)}%`;
			}),
		);
		return view;
	});
});
