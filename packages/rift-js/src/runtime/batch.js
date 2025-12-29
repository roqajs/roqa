// ============================================
// Batching primitives
// ============================================

import { notify } from "./cell.js";

let batching = false;
let pending = new Set();

/**
 * Batch multiple reactive updates together
 * Effects only run once after the batch completes
 * @param {Function} fn - Function containing multiple set() calls
 */
export const batch = (fn) => {
	if (batching) {
		// Already batching, just run the function
		fn();
		return;
	}
	batching = true;
	try {
		fn();
	} finally {
		batching = false;
		// Notify all pending cells
		for (const cell of pending) {
			notify(cell);
		}
		pending.clear();
	}
};

// Simple set cell value with notification (reactive update)
// Compiler can inline this for maximum performance
export const set = (cell, v) => {
	cell.v = v;
	for (let i = 0; i < cell.e.length; i++) cell.e[i](v);
};

// Set cell value with batching support
// When batching, defers notification until batch completes
export const set_with_batch = (cell, v) => {
	cell.v = v;
	const len = cell.e.length;
	if (len > 0) {
		if (batching) {
			pending.add(cell);
		} else {
			for (let i = 0; i < len; i++) cell.e[i](v);
		}
	}
};
