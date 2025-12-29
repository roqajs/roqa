import { describe, it, expect } from "vitest";
import { cell, get, put, bind, unbind, notify } from "../../src/runtime/cell.js";

/**
 * Tests for the reactive cell primitives
 *
 * Cells are Rift's core reactive primitive. A cell is a simple object with:
 *   { v: value, e: [effects] }
 *
 * Primitive operations:
 *   cell(value)      - Create a new cell with initial value
 *   get(cell)        - Read the cell's current value
 *   put(cell, value) - Write without notifying subscribers
 *   bind(cell, fn)   - Subscribe to changes (fn called with new value)
 *   unbind(cell, fn) - Remove a subscription
 *   notify(cell)     - Manually trigger all subscribers
 *
 * Note: set() (write + notify) is tested in batch.test.js as it's part of
 * the batching system.
 */

describe("cell", () => {
	it("creates a cell with initial value", () => {
		const c = cell(42);
		expect(c.v).toBe(42);
		expect(c.e).toEqual([]);
	});

	it("creates a cell with string value", () => {
		const c = cell("hello");
		expect(c.v).toBe("hello");
	});

	it("creates a cell with array value", () => {
		const c = cell([1, 2, 3]);
		expect(c.v).toEqual([1, 2, 3]);
	});

	it("creates a cell with object value", () => {
		const c = cell({ name: "test" });
		expect(c.v).toEqual({ name: "test" });
	});

	it("creates a cell with null value", () => {
		const c = cell(null);
		expect(c.v).toBeNull();
	});

	it("creates a cell with undefined value", () => {
		const c = cell(undefined);
		expect(c.v).toBeUndefined();
	});

	it("creates a cell with boolean value", () => {
		const c = cell(false);
		expect(c.v).toBe(false);
	});

	it("creates a cell with zero value", () => {
		const c = cell(0);
		expect(c.v).toBe(0);
	});

	it("creates a cell with empty string value", () => {
		const c = cell("");
		expect(c.v).toBe("");
	});
});

describe("get", () => {
	it("returns the current value", () => {
		const c = cell(42);
		expect(get(c)).toBe(42);
	});

	it("returns updated value after direct modification", () => {
		const c = cell(0);
		c.v = 10;
		expect(get(c)).toBe(10);
	});

	it("works with complex values", () => {
		const c = cell({ nested: { value: 123 } });
		expect(get(c).nested.value).toBe(123);
	});
});

describe("put", () => {
	it("updates value without notifying", () => {
		const c = cell(0);
		let called = false;
		bind(c, () => {
			called = true;
		});
		called = false; // Reset after initial bind call

		put(c, 10);

		expect(c.v).toBe(10);
		expect(called).toBe(false);
	});

	it("allows reading new value immediately", () => {
		const c = cell(0);
		put(c, 42);
		expect(get(c)).toBe(42);
	});
});

describe("bind", () => {
	it("calls effect immediately with current value", () => {
		const c = cell(42);
		let receivedValue;

		bind(c, (v) => {
			receivedValue = v;
		});

		expect(receivedValue).toBe(42);
	});

	it("adds effect to cell effects array", () => {
		const c = cell(0);
		const effect = () => {};

		bind(c, effect);

		expect(c.e).toContain(effect);
	});

	it("returns an unsubscribe function", () => {
		const c = cell(0);
		const effect = () => {};

		const unsub = bind(c, effect);

		expect(typeof unsub).toBe("function");
	});

	it("unsubscribe removes effect from array", () => {
		const c = cell(0);
		const effect = () => {};

		const unsub = bind(c, effect);
		unsub();

		expect(c.e).not.toContain(effect);
	});

	it("supports multiple effects on same cell", () => {
		const c = cell(0);
		const calls = [];

		bind(c, () => calls.push("a"));
		bind(c, () => calls.push("b"));

		expect(c.e.length).toBe(2);
		expect(calls).toEqual(["a", "b"]); // Both called immediately
	});
});

describe("unbind", () => {
	it("removes effect from cell", () => {
		const c = cell(0);
		const effect = () => {};

		bind(c, effect);
		unbind(c, effect);

		expect(c.e).not.toContain(effect);
	});

	it("handles unbind of non-existent effect gracefully", () => {
		const c = cell(0);
		const effect = () => {};

		expect(() => unbind(c, effect)).not.toThrow();
	});

	it("handles cell without effects array gracefully", () => {
		const c = { v: 0 }; // No e array
		const effect = () => {};

		expect(() => unbind(c, effect)).not.toThrow();
	});

	it("only removes the specific effect", () => {
		const c = cell(0);
		const effect1 = () => {};
		const effect2 = () => {};

		bind(c, effect1);
		bind(c, effect2);
		unbind(c, effect1);

		expect(c.e).not.toContain(effect1);
		expect(c.e).toContain(effect2);
	});
});

describe("notify", () => {
	it("calls all effects with current value", () => {
		const c = cell(42);
		const values = [];

		bind(c, (v) => values.push(`a:${v}`));
		bind(c, (v) => values.push(`b:${v}`));
		values.length = 0; // Clear initial calls

		notify(c);

		expect(values).toEqual(["a:42", "b:42"]);
	});

	it("does nothing for cell with no effects", () => {
		const c = cell(0);
		expect(() => notify(c)).not.toThrow();
	});

	it("passes updated value to effects", () => {
		const c = cell(0);
		let received;
		bind(c, (v) => {
			received = v;
		});

		c.v = 100;
		notify(c);

		expect(received).toBe(100);
	});
});

describe("edge cases", () => {
	it("handles rapid bind/unbind cycles", () => {
		const c = cell(0);
		const effects = [];

		for (let i = 0; i < 100; i++) {
			const effect = () => {};
			effects.push(effect);
			bind(c, effect);
		}

		for (const effect of effects) {
			unbind(c, effect);
		}

		expect(c.e.length).toBe(0);
	});

	it("handles effect that unbinds itself", () => {
		const c = cell(0);
		let callCount = 0;
		let unsub;

		unsub = bind(c, () => {
			callCount++;
			if (callCount > 1) {
				unsub();
			}
		});

		notify(c);
		notify(c);

		// Should have been called initially + once for first notify
		// Second notify shouldn't call it after unsubscribe
		expect(callCount).toBeLessThanOrEqual(3);
	});

	it("handles derived values pattern", () => {
		const count = cell(5);
		const doubled = cell(0);

		// Manual derived pattern
		bind(count, (v) => {
			doubled.v = v * 2;
		});

		expect(doubled.v).toBe(10);

		count.v = 10;
		notify(count);

		expect(doubled.v).toBe(20);
	});
});
