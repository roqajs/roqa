import { bind } from "./cell.js";

/**
 * Create a switchBlock for multi-branch rendering (`if/else if/else`,
 * `switch`, `match`-style dispatch).
 *
 * The block tracks which arm is currently rendered and swaps DOM only when
 * the active arm changes. Each arm's render function follows the same shape
 * as `showBlock`/`forBlock` callbacks: `(anchor) => ({ start, end, cleanup? })`.
 *
 * Arms are tested in declaration order — first match wins. If no arm matches,
 * the fallback (when provided) is rendered. With no fallback, the block is
 * empty.
 *
 * @param {Element} container - The container element to render into.
 * @param {Array<{ test: () => boolean, render: (anchor: Node) => { start: Node, end: Node, cleanup?: () => void } }>} arms
 *        Ordered arm list. `test` is evaluated on each update; first truthy
 *        match wins.
 * @param {((anchor: Node) => { start: Node, end: Node, cleanup?: () => void }) | null} fallbackRender
 *        Optional fallback render function used when no arm matches.
 * @param {Array<Object>} [deps] - Cells the block subscribes to for reactive updates.
 * @returns {{ update: Function, destroy: Function, get activeArm(): number }}
 *          `activeArm` is the 0-based index of the currently rendered arm,
 *          `arms.length` for the fallback, or `-1` when nothing is rendered.
 */
export function switchBlock(container, arms, fallbackRender, deps) {
	const anchor = document.createTextNode("");
	container.appendChild(anchor);

	const armCount = arms.length;
	const fallbackIndex = armCount;

	// Currently rendered arm index (-1 if none), and its DOM range.
	let activeIndex = -1;
	/** @type {{ start: Node, end: Node, cleanup?: () => void } | null} */
	let activeState = null;

	const destroyActive = () => {
		if (!activeState) return;
		if (activeState.cleanup) activeState.cleanup();
		let node = activeState.start;
		const end = activeState.end;
		do {
			const next = node.nextSibling;
			node.remove();
			if (node === end) break;
			node = next;
		} while (node);
		activeState = null;
		activeIndex = -1;
	};

	// Pick the arm index that should be rendered. Returns `fallbackIndex`
	// when the fallback should render, or `-1` when nothing should render.
	const pickIndex = () => {
		for (let i = 0; i < armCount; i++) {
			if (arms[i].test()) return i;
		}
		return fallbackRender ? fallbackIndex : -1;
	};

	const doUpdate = () => {
		const next = pickIndex();
		if (next === activeIndex) return;
		destroyActive();
		if (next === -1) return;
		const renderFn = next === fallbackIndex ? fallbackRender : arms[next].render;
		activeState = renderFn(anchor);
		activeIndex = next;
	};

	// Subscribe to dependency cells.
	let unsubscribes = null;
	const depsLen = deps ? deps.length : 0;
	if (depsLen === 1) {
		unsubscribes = [bind(deps[0], doUpdate)];
	} else if (depsLen > 1) {
		unsubscribes = [];
		for (let i = 0; i < depsLen; i++) {
			unsubscribes.push(bind(deps[i], doUpdate));
		}
	}

	// Initial render.
	doUpdate();

	const destroy = () => {
		if (unsubscribes) {
			for (let i = 0; i < unsubscribes.length; i++) unsubscribes[i]();
		}
		destroyActive();
		anchor.remove();
	};

	return {
		update: doUpdate,
		destroy,
		get activeArm() {
			return activeIndex;
		},
	};
}
