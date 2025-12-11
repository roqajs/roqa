// ============================================
// for_block and reconciliation primitives
// ============================================

import { bind } from './cell.js';

const array_from = Array.from;
const is_array = Array.isArray;

// LIS algorithm state (reused across calls for performance)
let lis_result;
let lis_p;
let lis_max_len = 0;

function lis_algorithm(arr) {
	let arrI = 0,
		i = 0,
		j = 0,
		k = 0,
		u = 0,
		v = 0,
		c = 0;
	const len = arr.length;
	if (len > lis_max_len) {
		lis_max_len = len;
		lis_result = new Int32Array(len);
		lis_p = new Int32Array(len);
	}
	while (i < len) {
		arrI = arr[i];
		if (arrI !== 0) {
			j = lis_result[k];
			if (arr[j] < arrI) {
				lis_p[i] = j;
				lis_result[++k] = i;
				i++;
				continue;
			}
			u = 0;
			v = k;
			while (u < v) {
				c = (u + v) >> 1;
				if (arr[lis_result[c]] < arrI) {
					u = c + 1;
				} else {
					v = c;
				}
			}
			if (arrI < arr[lis_result[u]]) {
				if (u > 0) lis_p[i] = lis_result[u - 1];
				lis_result[u] = i;
			}
		}
		i++;
	}
	u = k + 1;
	const seq = new Int32Array(u);
	v = lis_result[u - 1];
	while (u-- > 0) {
		seq[u] = v;
		v = lis_p[v];
		lis_result[u] = 0;
	}
	return seq;
}

function get_next_sibling(node) {
	return node.nextSibling;
}

/**
 * Create an item block (lightweight object representing a rendered item)
 * @param {Node} anchor - Where to insert
 * @param {*} value - The data item
 * @param {number} index - Array index
 * @param {Function} render_fn - (anchor, value, index) => { start, end } or just appends nodes
 */
function create_item(anchor, value, index, render_fn) {
	// render_fn should return { start, end } nodes for the item
	const item = render_fn(anchor, value, index);
	return {
		s: item, // state: { start, end } - the DOM range for this item
		v: value,
	};
}

/**
 * Move a block's DOM nodes before an anchor
 */
function move_item(item, anchor) {
	const state = item.s;
	let node = state.start;
	const end = state.end;

	if (node !== end) {
		while (node !== null) {
			const next_node = get_next_sibling(node);
			anchor.before(node);
			if (next_node === end) {
				anchor.before(end);
				break;
			}
			node = next_node;
		}
	} else {
		anchor.before(node);
	}
}

/**
 * Destroy an item's DOM nodes and run cleanup if present
 */
function destroy_item(item) {
	const state = item.s;
	let node = state.start;
	const end = state.end;

	// Run cleanup function if the render provided one
	if (state.cleanup) state.cleanup();

	while (node !== null) {
		const next = get_next_sibling(node);
		node.remove();
		if (node === end) break;
		node = next;
	}
}

/**
 * Fast path: clear all items when going from non-empty to empty
 */
function reconcile_fast_clear(anchor, for_state, array) {
	const parent_node = anchor.parentNode;
	parent_node.textContent = '';
	parent_node.append(anchor);
	for_state.array = array;
	for_state.items = [];
}

/**
 * Reconcile arrays by reference equality
 */
function reconcile_by_ref(anchor, for_state, b, render_fn) {
	let a_start = 0,
		b_start = 0,
		a_left = 0,
		b_left = 0,
		sources = new Int32Array(0),
		moved = false,
		pos = 0,
		patched = 0,
		i = 0,
		j = 0;

	const a = for_state.array;
	const a_length = a.length;
	const b_length = b.length;

	if (b_length !== 0) {
		const b_items = Array(b_length);

		// Empty -> non-empty: create all
		if (a_length === 0) {
			for (; j < b_length; j++) {
				b_items[j] = create_item(anchor, b[j], j, render_fn);
			}
			for_state.array = b;
			for_state.items = b_items;
			return;
		}

		const a_items = for_state.items;
		let a_val = a[j];
		let b_val = b[j];
		let a_end = a_length - 1;
		let b_end = b_length - 1;

		// Skip common prefix
		outer: {
			while (a_val === b_val) {
				a[j] = b_val;
				b_items[j] = a_items[j];
				if (++j > a_end || j > b_end) break outer;
				a_val = a[j];
				b_val = b[j];
			}
			// Skip common suffix
			a_val = a[a_end];
			b_val = b[b_end];
			while (a_val === b_val) {
				a[a_end] = b_val;
				b_items[b_end] = a_items[a_end];
				b_end--;
				if (j > --a_end || j > b_end) break outer;
				a_val = a[a_end];
				b_val = b[b_end];
			}
		}

		let fast_path_removal = false;
		let target;

		if (j > a_end) {
			// Only additions
			if (j <= b_end) {
				while (j <= b_end) {
					b_val = b[j];
					target = j >= a_length ? anchor : a_items[j].s.start;
					b_items[j] = create_item(target, b_val, j, render_fn);
					j++;
				}
			}
		} else if (j > b_end) {
			// Only removals
			while (j <= a_end) {
				destroy_item(a_items[j++]);
			}
		} else {
			// General case: need full reconciliation
			a_start = j;
			b_start = j;
			a_left = a_end - j + 1;
			b_left = b_end - j + 1;
			sources = new Int32Array(b_left + 1);
			moved = false;
			pos = 0;
			patched = 0;
			i = 0;
			fast_path_removal = a_left === a_length;

			if (b_length < 4 || (a_left | b_left) < 32) {
				// Small arrays: use O(n*m) search
				for (i = a_start; i <= a_end; ++i) {
					a_val = a[i];
					if (patched < b_left) {
						for (j = b_start; j <= b_end; j++) {
							if (a_val === (b_val = b[j])) {
								sources[j - b_start] = i + 1;
								if (fast_path_removal) {
									fast_path_removal = false;
									while (a_start < i) destroy_item(a_items[a_start++]);
								}
								if (pos > j) moved = true;
								else pos = j;
								b_items[j] = a_items[i];
								++patched;
								break;
							}
						}
						if (!fast_path_removal && j > b_end) destroy_item(a_items[i]);
					} else if (!fast_path_removal) {
						destroy_item(a_items[i]);
					}
				}
			} else {
				// Larger arrays: use Map for O(n+m) lookup
				const map = new Map();
				for (i = b_start; i <= b_end; ++i) map.set(b[i], i);
				for (i = a_start; i <= a_end; ++i) {
					a_val = a[i];
					if (patched < b_left) {
						j = map.get(a_val);
						if (j !== undefined) {
							if (fast_path_removal) {
								fast_path_removal = false;
								while (i > a_start) destroy_item(a_items[a_start++]);
							}
							sources[j - b_start] = i + 1;
							if (pos > j) moved = true;
							else pos = j;
							b_items[j] = a_items[i];
							++patched;
						} else if (!fast_path_removal) {
							destroy_item(a_items[i]);
						}
					} else if (!fast_path_removal) {
						destroy_item(a_items[i]);
					}
				}
			}

			if (fast_path_removal) {
				reconcile_fast_clear(anchor, for_state, []);
				reconcile_by_ref(anchor, for_state, b, render_fn);
				return;
			}

			if (moved) {
				let next_pos = 0;
				const seq = lis_algorithm(sources);
				j = seq.length - 1;
				for (i = b_left - 1; i >= 0; i--) {
					pos = i + b_start;
					next_pos = pos + 1;
					target = next_pos < b_length ? b_items[next_pos].s.start : anchor;

					if (sources[i] === 0) {
						b_val = b[pos];
						b_items[pos] = create_item(target, b_val, pos, render_fn);
					} else if (j < 0 || i !== seq[j]) {
						move_item(b_items[pos], target);
					} else {
						j--;
					}
				}
			} else if (patched !== b_left) {
				for (i = b_left - 1; i >= 0; i--) {
					if (sources[i] === 0) {
						pos = i + b_start;
						b_val = b[pos];
						const next_pos = pos + 1;
						target = next_pos < b_length ? b_items[next_pos].s.start : anchor;
						b_items[pos] = create_item(target, b_val, pos, render_fn);
					}
				}
			}
		}

		for_state.array = b;
		for_state.items = b_items;
	} else if (a_length > 0) {
		// Non-empty -> empty: clear all
		reconcile_fast_clear(anchor, for_state, b);
	}
}

/**
 * Create a for_block for efficient list rendering
 * @param {Element} container - The container element (e.g., tbody)
 * @param {Object} source_cell - A cell containing the array to render
 * @param {Function} render_fn - (anchor, item, index) => { start, end, cleanup? }
 * @returns {{ update: Function, state: Object, destroy: Function }}
 */
export function for_block(container, source_cell, render_fn) {
	// Create anchor node at end of container
	const anchor = document.createTextNode('');
	container.appendChild(anchor);

	// Initialize state
	const for_state = {
		array: [],
		items: [],
	};

	const do_update = () => {
		const collection = source_cell.v;
		const array = is_array(collection)
			? collection
			: collection == null
			? []
			: array_from(collection);
		reconcile_by_ref(anchor, for_state, array, render_fn);
	};

	// Subscribe to cell changes
	const unsubscribe = bind(source_cell, do_update);

	// Destroy function for cleanup
	const destroy = () => {
		unsubscribe();
		// Destroy all current items
		const items = for_state.items;
		for (let i = 0; i < items.length; i++) {
			destroy_item(items[i]);
		}
		for_state.array = [];
		for_state.items = [];
		anchor.remove();
	};

	// Return controller object
	return {
		update: do_update,
		destroy,
		get state() {
			return for_state;
		},
	};
}
