// ============================================
// show_block - conditional rendering primitive
// ============================================

import { bind } from './cell.js';

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
	const anchor = document.createTextNode('');
	container.appendChild(anchor);

	// Track current state
	let currentState = null; // { start, end, cleanup? }
	let isShowing = false;

	// Determine if condition is a cell, a getter function, or a static value
	const isCell = condition && typeof condition === 'object' && 'v' in condition;
	const isGetter = typeof condition === 'function';

	const getConditionValue = () => {
		if (isCell) return !!condition.v;
		if (isGetter) return !!condition();
		return !!condition;
	};

	const create = () => {
		if (currentState) return; // Already showing
		currentState = render_fn(anchor);
		isShowing = true;
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

		while (node !== null) {
			const next = node.nextSibling;
			node.remove();
			if (node === end) break;
			node = next;
		}

		currentState = null;
		isShowing = false;
	};

	const do_update = () => {
		const shouldShow = getConditionValue();

		if (shouldShow && !isShowing) {
			create();
		} else if (!shouldShow && isShowing) {
			destroy_current();
		}
	};

	// Subscribe to cell changes
	const unsubscribes = [];

	if (isCell) {
		// Simple cell condition
		unsubscribes.push(bind(condition, do_update));
	} else if (deps && deps.length > 0) {
		// Complex expression with dependencies
		for (const dep of deps) {
			unsubscribes.push(bind(dep, do_update));
		}
	}

	// Initial render
	do_update();

	// Destroy function for cleanup
	const destroy = () => {
		for (const unsub of unsubscribes) {
			unsub();
		}
		destroy_current();
		anchor.remove();
	};

	return {
		update: do_update,
		destroy,
		get isShowing() {
			return isShowing;
		},
	};
}
