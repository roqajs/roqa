import { bind } from "./cell.js";

// Reconcile arrays using Longest Increasing Subsequence (LIS) algorithm
// Heavily based on Ripple's reconciliation algorithms: https://github.com/Ripple-TS/ripple/blob/main/packages/ripple/src/runtime/internal/client/for.js

// LIS algorithm state (reused across calls for performance)
let lisResult;
let lisP;
let lisMaxLen = 0;

function lisAlgorithm(arr) {
	let arrI = 0,
		i = 0,
		j = 0,
		k = 0,
		u = 0,
		v = 0,
		c = 0;
	const len = arr.length;
	if (len > lisMaxLen) {
		lisMaxLen = len;
		lisResult = new Int32Array(len);
		lisP = new Int32Array(len);
	}
	while (i < len) {
		arrI = arr[i];
		if (arrI !== 0) {
			j = lisResult[k];
			if (arr[j] < arrI) {
				lisP[i] = j;
				lisResult[++k] = i;
				i++;
				continue;
			}
			u = 0;
			v = k;
			while (u < v) {
				c = (u + v) >> 1;
				if (arr[lisResult[c]] < arrI) {
					u = c + 1;
				} else {
					v = c;
				}
			}
			if (arrI < arr[lisResult[u]]) {
				if (u > 0) lisP[i] = lisResult[u - 1];
				lisResult[u] = i;
			}
		}
		i++;
	}
	u = k + 1;
	const seq = new Int32Array(u);
	v = lisResult[u - 1];
	while (u-- > 0) {
		seq[u] = v;
		v = lisP[v];
		lisResult[u] = 0;
	}
	return seq;
}

/**
 * Create an item block (lightweight object representing a rendered item)
 * @param {Node} anchor - Where to insert
 * @param {*} value - The data item
 * @param {number} index - Array index
 * @param {Function} renderFn - (anchor, value, index) => { start, end } or just appends nodes
 */
function createItem(anchor, value, index, renderFn) {
	// renderFn should return { start, end } nodes for the item
	const item = renderFn(anchor, value, index);
	return {
		s: item, // state: { start, end } - the DOM range for this item
		v: value,
	};
}

/**
 * Move a block's DOM nodes before an anchor
 */
function moveItem(item, anchor) {
	const state = item.s;
	let node = state.start;
	const end = state.end;

	if (node !== end) {
		while (node !== null) {
			const next_node = node.nextSibling;
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
function destroyItem(item) {
	const state = item.s;
	let node = state.start;
	const end = state.end;

	// Run cleanup function if the render provided one
	if (state.cleanup) state.cleanup();

	while (node !== null) {
		const next = node.nextSibling;
		node.remove();
		if (node === end) break;
		node = next;
	}
}

/**
 * Fast path: clear all items when going from non-empty to empty
 */
function reconcileFastClear(anchor, forState, array) {
	// Run cleanup for all items before clearing DOM
	const items = forState.items;
	for (let i = 0; i < items.length; i++) {
		const state = items[i].s;
		if (state.cleanup) state.cleanup();
	}

	const parent_node = anchor.parentNode;
	parent_node.textContent = "";
	parent_node.append(anchor);
	forState.array = array;
	forState.items = [];
}

/**
 * Reconcile arrays by reference equality
 */
function reconcileByRef(anchor, forState, b, renderFn) {
	let aStart = 0,
		bStart = 0,
		aLeft = 0,
		bLeft = 0,
		sources = new Int32Array(0),
		moved = false,
		pos = 0,
		patched = 0,
		i = 0,
		j = 0;

	const a = forState.array;
	const aLen = a.length;
	const bLen = b.length;

	if (bLen !== 0) {
		const bItems = Array(bLen);

		// Empty -> non-empty: create all
		if (aLen === 0) {
			for (; j < bLen; j++) {
				bItems[j] = createItem(anchor, b[j], j, renderFn);
			}
			forState.array = b;
			forState.items = bItems;
			return;
		}

		const aItems = forState.items;
		let aVal = a[j];
		let bVal = b[j];
		let aEnd = aLen - 1;
		let bEnd = bLen - 1;

		// Skip common prefix
		outer: {
			while (aVal === bVal) {
				a[j] = bVal;
				bItems[j] = aItems[j];
				if (++j > aEnd || j > bEnd) break outer;
				aVal = a[j];
				bVal = b[j];
			}
			// Skip common suffix
			aVal = a[aEnd];
			bVal = b[bEnd];
			while (aVal === bVal) {
				a[aEnd] = bVal;
				bItems[bEnd] = aItems[aEnd];
				bEnd--;
				if (j > --aEnd || j > bEnd) break outer;
				aVal = a[aEnd];
				bVal = b[bEnd];
			}
		}

		let fastPathRemoval = false;
		let target;

		if (j > aEnd) {
			// Only additions
			if (j <= bEnd) {
				while (j <= bEnd) {
					bVal = b[j];
					target = j >= aLen ? anchor : aItems[j].s.start;
					bItems[j] = createItem(target, bVal, j, renderFn);
					j++;
				}
			}
		} else if (j > bEnd) {
			// Only removals
			while (j <= aEnd) {
				destroyItem(aItems[j++]);
			}
		} else {
			// General case: need full reconciliation
			aStart = j;
			bStart = j;
			aLeft = aEnd - j + 1;
			bLeft = bEnd - j + 1;
			sources = new Int32Array(bLeft);
			moved = false;
			pos = 0;
			patched = 0;
			i = 0;
			fastPathRemoval = aLeft === aLen;

			if (bLen < 4 || (aLeft | bLeft) < 32) {
				// Small arrays: use O(n*m) search
				for (i = aStart; i <= aEnd; ++i) {
					aVal = a[i];
					if (patched < bLeft) {
						for (j = bStart; j <= bEnd; j++) {
							if (aVal === (bVal = b[j])) {
								sources[j - bStart] = i + 1;
								if (fastPathRemoval) {
									fastPathRemoval = false;
									while (aStart < i) destroyItem(aItems[aStart++]);
								}
								if (pos > j) moved = true;
								else pos = j;
								bItems[j] = aItems[i];
								++patched;
								break;
							}
						}
						if (!fastPathRemoval && j > bEnd) destroyItem(aItems[i]);
					} else if (!fastPathRemoval) {
						destroyItem(aItems[i]);
					}
				}
			} else {
				// Larger arrays: use Map for O(n+m) lookup
				const map = new Map();
				for (i = bStart; i <= bEnd; ++i) map.set(b[i], i);
				for (i = aStart; i <= aEnd; ++i) {
					aVal = a[i];
					if (patched < bLeft) {
						j = map.get(aVal);
						if (j !== undefined) {
							if (fastPathRemoval) {
								fastPathRemoval = false;
								while (i > aStart) destroyItem(aItems[aStart++]);
							}
							sources[j - bStart] = i + 1;
							if (pos > j) moved = true;
							else pos = j;
							bItems[j] = aItems[i];
							++patched;
						} else if (!fastPathRemoval) {
							destroyItem(aItems[i]);
						}
					} else if (!fastPathRemoval) {
						destroyItem(aItems[i]);
					}
				}
			}

			if (fastPathRemoval) {
				reconcileFastClear(anchor, forState, []);
				reconcileByRef(anchor, forState, b, renderFn);
				return;
			}

			if (moved) {
				let nextPos = 0;
				const seq = lisAlgorithm(sources);
				j = seq.length - 1;
				for (i = bLeft - 1; i >= 0; i--) {
					pos = i + bStart;
					nextPos = pos + 1;
					target = nextPos < bLen ? bItems[nextPos].s.start : anchor;

					if (sources[i] === 0) {
						bVal = b[pos];
						bItems[pos] = createItem(target, bVal, pos, renderFn);
					} else if (j < 0 || i !== seq[j]) {
						moveItem(bItems[pos], target);
					} else {
						j--;
					}
				}
			} else if (patched !== bLeft) {
				for (i = bLeft - 1; i >= 0; i--) {
					if (sources[i] === 0) {
						pos = i + bStart;
						bVal = b[pos];
						const nextPos = pos + 1;
						target = nextPos < bLen ? bItems[nextPos].s.start : anchor;
						bItems[pos] = createItem(target, bVal, pos, renderFn);
					}
				}
			}
		}

		forState.array = b;
		forState.items = bItems;
	} else if (aLen > 0) {
		// Non-empty -> empty: clear all
		reconcileFastClear(anchor, forState, b);
	}
}

/**
 * Create a forBlock for efficient list rendering
 * @param {Element} container - The container element (e.g., tbody)
 * @param {Object} sourceCell - A cell containing the array to render
 * @param {Function} renderFn - (anchor, item, index) => { start, end, cleanup? }
 * @returns {{ update: Function, state: Object, destroy: Function }}
 */
export function forBlock(container, sourceCell, renderFn) {
	// Create anchor node at end of container
	const anchor = document.createTextNode("");
	container.appendChild(anchor);

	// Initialize state
	const forState = {
		array: [],
		items: [],
	};

	const doUpdate = () => {
		const collection = sourceCell.v;
		const array = Array.isArray(collection)
			? collection
			: collection == null
				? []
				: Array.from(collection);
		reconcileByRef(anchor, forState, array, renderFn);
	};

	// Subscribe to cell changes
	const unsubscribe = bind(sourceCell, doUpdate);

	// Initial render
	doUpdate();

	// Destroy function for cleanup
	const destroy = () => {
		unsubscribe();
		// Destroy all current items
		const items = forState.items;
		for (let i = 0; i < items.length; i++) {
			destroyItem(items[i]);
		}
		forState.array = [];
		forState.items = [];
		anchor.remove();
	};

	// Return controller object
	return {
		update: doUpdate,
		destroy,
		get state() {
			return forState;
		},
	};
}
