import type { Cell } from "roqa";

export {};

declare module "roqa" {
	interface ShowBlockController {
		update: () => void;
		destroy: () => void;
		readonly isShowing: boolean;
	}

	export function showBlock<T>(
		container: Element,
		condition: Cell<T> | (() => unknown) | boolean,
		render: (anchor: Node) => { start: Node; end: Node; cleanup?: () => void },
		dependencies?: Cell<T>[],
	): ShowBlockController;
}

declare global {
	interface HTMLElement {
		__change?: unknown;
		__click?: unknown;
		__submit?: unknown;
	}
}
