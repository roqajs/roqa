import { bind } from "./cell.js";

/**
 * Create a show_block for conditional rendering
 * @param {Element} container - The container element
 * @param {Object|Function} condition - A cell containing the condition, or a getter function returning boolean
 * @param {Function} render_fn - (anchor) => { start, end, cleanup? }
 * @param {Array} [deps] - Optional array of cells to subscribe to for reactive updates (for complex expressions)
 * @returns {{ update: Function, destroy: Function }}
 */
export function show_block(container, condition, render_fn, deps) {
	// Create anchor node at end of container
	const anchor = document.createTextNode("");
	container.appendChild(anchor);

	// Track current rendered state: { start, end, cleanup? } or null
	let currentState = null;

	// Determine if condition is a cell, a getter function, or a static value
	const isCell = condition && typeof condition === "object" && "v" in condition;
	const isGetter = typeof condition === "function";

	const create = () => {
		if (currentState) return; // Already showing
		currentState = render_fn(anchor);
	};

	const destroy_current = () => {
		if (!currentState) return; // Nothing to destroy

		// Run cleanup function if provided
		if (currentState.cleanup) {
			currentState.cleanup();
		}

		// Remove DOM nodes
		let node = currentState.start;
		const end = currentState.end;
		do {
			const next = node.nextSibling;
			node.remove();
			if (node === end) break;
			node = next;
		} while (node);

		currentState = null;
	};

	// Optimized update functions based on condition type
	const do_update = isCell
		? () => {
				if (condition.v) {
					if (!currentState) create();
				} else if (currentState) {
					destroy_current();
				}
			}
		: isGetter
			? () => {
					if (condition()) {
						if (!currentState) create();
					} else if (currentState) {
						destroy_current();
					}
				}
			: () => {
					// Static value - only runs once
					if (condition && !currentState) create();
				};

	// Subscribe to cell changes
	// Optimize for common case: single subscription doesn't need array
	let unsubscribe = null;
	let unsubscribes = null;

	const depsLen = deps ? deps.length : 0;

	if (isCell) {
		// Simple cell condition
		unsubscribe = bind(condition, do_update);
	} else if (depsLen === 1) {
		// Single dependency - no array needed
		unsubscribe = bind(deps[0], do_update);
	} else if (depsLen > 1) {
		// Multiple dependencies - use array
		unsubscribes = [];
		for (let i = 0; i < depsLen; i++) {
			unsubscribes.push(bind(deps[i], do_update));
		}
	}

	// Initial render
	do_update();

	// Destroy function for cleanup
	const destroy = () => {
		if (unsubscribe) {
			unsubscribe();
		} else if (unsubscribes) {
			for (let i = 0; i < unsubscribes.length; i++) {
				unsubscribes[i]();
			}
		}
		destroy_current();
		anchor.remove();
	};

	return {
		update: do_update,
		destroy,
		get isShowing() {
			return currentState !== null;
		},
	};
}
