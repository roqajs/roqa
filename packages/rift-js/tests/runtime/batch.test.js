import { describe, it, expect } from "vitest";
import { batch, set, set_with_batch } from "../../src/runtime/batch.js";
import { cell, bind } from "../../src/runtime/cell.js";

/**
 * Tests for the batched update system
 *
 * Batching allows multiple cell updates to be grouped together, triggering
 * subscribers only once after all updates complete:
 *
 *   set(cell, value)     - Update cell and immediately notify subscribers
 *   batch(() => { ... }) - Group updates, notify once at end
 *   set_with_batch(cell, value) - For use inside batch blocks
 *
 * This is useful for:
 * - Avoiding redundant DOM updates
 * - Ensuring consistent state during multi-cell updates
 * - Performance optimization for bulk operations
 */

describe("set", () => {
	it("updates cell value", () => {
		const c = cell(0);
		set(c, 10);
		expect(c.v).toBe(10);
	});

	it("notifies all effects immediately", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0; // Clear initial call

		set(c, 42);

		expect(values).toEqual([42]);
	});

	it("notifies multiple effects", () => {
		const c = cell(0);
		const calls = [];

		bind(c, () => calls.push("a"));
		bind(c, () => calls.push("b"));
		calls.length = 0;

		set(c, 1);

		expect(calls).toEqual(["a", "b"]);
	});
});

describe("set_with_batch", () => {
	it("updates cell value", () => {
		const c = cell(0);
		set_with_batch(c, 10);
		expect(c.v).toBe(10);
	});

	it("notifies effects when not batching", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0;

		set_with_batch(c, 42);

		expect(values).toEqual([42]);
	});

	it("defers notification when batching", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0;

		batch(() => {
			set_with_batch(c, 1);
			expect(values).toEqual([]); // Not notified yet

			set_with_batch(c, 2);
			expect(values).toEqual([]); // Still not notified
		});

		expect(values).toEqual([2]); // Notified once after batch
	});
});

describe("batch", () => {
	it("defers notifications until batch completes", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0;

		batch(() => {
			set_with_batch(c, 1);
			set_with_batch(c, 2);
			set_with_batch(c, 3);
		});

		// Should only be notified once with final value
		expect(values).toEqual([3]);
	});

	it("handles multiple cells in batch", () => {
		const a = cell(0);
		const b = cell(0);
		const calls = [];

		bind(a, (v) => calls.push(`a:${v}`));
		bind(b, (v) => calls.push(`b:${v}`));
		calls.length = 0;

		batch(() => {
			set_with_batch(a, 1);
			set_with_batch(b, 2);
		});

		// Both should be notified after batch
		expect(calls).toContain("a:1");
		expect(calls).toContain("b:2");
		expect(calls.length).toBe(2);
	});

	it("handles nested batches", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0;

		batch(() => {
			set_with_batch(c, 1);

			batch(() => {
				set_with_batch(c, 2);
			});

			// Inner batch shouldn't trigger notification
			expect(values).toEqual([]);

			set_with_batch(c, 3);
		});

		// Only notified after outer batch completes
		expect(values).toEqual([3]);
	});

	it("handles errors in batch function", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0;

		try {
			batch(() => {
				set_with_batch(c, 1);
				throw new Error("test error");
			});
		} catch {
			// Expected
		}

		// Should still notify pending cells even after error
		expect(values).toEqual([1]);
	});

	it("clears pending set after batch", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));

		batch(() => {
			set_with_batch(c, 1);
		});

		values.length = 0;

		// A new batch should start fresh
		batch(() => {
			set_with_batch(c, 2);
		});

		expect(values).toEqual([2]);
	});

	it("handles cell with no effects", () => {
		const c = cell(0);

		expect(() => {
			batch(() => {
				set_with_batch(c, 1);
			});
		}).not.toThrow();

		expect(c.v).toBe(1);
	});

	it("handles empty batch", () => {
		expect(() => {
			batch(() => {
				// Do nothing
			});
		}).not.toThrow();
	});
});

describe("edge cases", () => {
	it("set() works during batch (immediate notification)", () => {
		const c = cell(0);
		const values = [];

		bind(c, (v) => values.push(v));
		values.length = 0;

		batch(() => {
			set(c, 1); // Regular set, not set_with_batch
			expect(values).toEqual([1]); // Immediate notification
		});
	});

	it("handles rapid set calls", () => {
		const c = cell(0);
		let lastValue;

		bind(c, (v) => {
			lastValue = v;
		});

		for (let i = 0; i < 1000; i++) {
			set(c, i);
		}

		expect(lastValue).toBe(999);
	});

	it("batch prevents intermediate effect runs", () => {
		const a = cell(0);
		const b = cell(0);
		let derivedCalls = 0;

		// Derived value that depends on both a and b
		bind(a, () => {
			derivedCalls++;
		});
		bind(b, () => {
			derivedCalls++;
		});

		derivedCalls = 0;

		batch(() => {
			set_with_batch(a, 1);
			set_with_batch(b, 2);
		});

		// Should only be called once per cell, not for each intermediate state
		expect(derivedCalls).toBe(2);
	});
});
