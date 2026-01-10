import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cell } from "../../src/runtime/cell.js";
import { forBlock } from "../../src/runtime/for-block.js";

/**
 * Tests for the forBlock runtime function
 *
 * forBlock implements list rendering for the <For each={items}> component.
 * It uses a Longest Increasing Subsequence (LIS) algorithm for efficient
 * reconciliation when the list changes:
 *
 * - Keyed by item identity for correct element reuse
 * - Minimizes DOM operations during updates
 * - Handles additions, removals, and reordering
 * - Passes (anchor, item, index) to the render callback
 *
 * These tests run in a browser environment to verify actual DOM behavior.
 */

describe("forBlock", () => {
	let container;

	beforeEach(() => {
		container = document.createElement("ul");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	function createSimpleRenderFn() {
		return (anchor, item, _index) => {
			const li = document.createElement("li");
			li.textContent = String(item);
			anchor.before(li);
			return { start: li, end: li };
		};
	}

	it("renders initial empty array", () => {
		const items = cell([]);
		const block = forBlock(container, items, createSimpleRenderFn());

		expect(container.querySelectorAll("li").length).toBe(0);

		block.destroy();
	});

	it("renders initial non-empty array", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(3);
		expect(lis[0].textContent).toBe("a");
		expect(lis[1].textContent).toBe("b");
		expect(lis[2].textContent).toBe("c");

		block.destroy();
	});

	it("updates when array changes - add items", () => {
		const items = cell(["a", "b"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		items.v = ["a", "b", "c"];
		block.update();

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(3);
		expect(lis[2].textContent).toBe("c");

		block.destroy();
	});

	it("updates when array changes - remove items", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		items.v = ["a", "c"];
		block.update();

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(2);
		expect(lis[0].textContent).toBe("a");
		expect(lis[1].textContent).toBe("c");

		block.destroy();
	});

	it("updates when array changes - reorder items", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		const originalFirst = container.querySelector("li");

		items.v = ["c", "b", "a"];
		block.update();

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(3);
		expect(lis[0].textContent).toBe("c");
		expect(lis[1].textContent).toBe("b");
		expect(lis[2].textContent).toBe("a");

		// Should reuse existing DOM nodes (reference equality)
		expect(lis[2]).toBe(originalFirst);

		block.destroy();
	});

	it("clears all items when array becomes empty", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		items.v = [];
		block.update();

		expect(container.querySelectorAll("li").length).toBe(0);

		block.destroy();
	});

	it("returns destroy function that cleans up", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		block.destroy();

		expect(container.querySelectorAll("li").length).toBe(0);
	});

	it("handles null/undefined values", () => {
		const items = cell(null);
		const block = forBlock(container, items, createSimpleRenderFn());

		expect(container.querySelectorAll("li").length).toBe(0);

		items.v = undefined;
		block.update();

		expect(container.querySelectorAll("li").length).toBe(0);

		block.destroy();
	});

	it("handles array-like objects", () => {
		const items = cell(new Set(["a", "b", "c"]));
		const block = forBlock(container, items, createSimpleRenderFn());

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(3);

		block.destroy();
	});

	it("provides index to render function", () => {
		const indices = [];
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, (anchor, item, index) => {
			indices.push(index);
			const li = document.createElement("li");
			anchor.before(li);
			return { start: li, end: li };
		});

		expect(indices).toEqual([0, 1, 2]);

		block.destroy();
	});

	it("handles render function returning multi-node items", () => {
		const items = cell(["a", "b"]);
		const block = forBlock(container, items, (anchor, item) => {
			const span1 = document.createElement("span");
			span1.textContent = item + "-1";
			const span2 = document.createElement("span");
			span2.textContent = item + "-2";
			anchor.before(span1);
			anchor.before(span2);
			return { start: span1, end: span2 };
		});

		const spans = container.querySelectorAll("span");
		expect(spans.length).toBe(4);
		expect(spans[0].textContent).toBe("a-1");
		expect(spans[1].textContent).toBe("a-2");
		expect(spans[2].textContent).toBe("b-1");
		expect(spans[3].textContent).toBe("b-2");

		block.destroy();
	});

	it("calls cleanup function when items are removed", () => {
		const cleanups = [];
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, (anchor, item) => {
			const li = document.createElement("li");
			li.textContent = item;
			anchor.before(li);
			return {
				start: li,
				end: li,
				cleanup: () => cleanups.push(item),
			};
		});

		items.v = ["b"];
		block.update();

		expect(cleanups).toContain("a");
		expect(cleanups).toContain("c");

		block.destroy();
	});

	it("handles large arrays efficiently", () => {
		const largeArray = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
		const items = cell(largeArray);

		const start = performance.now();
		const block = forBlock(container, items, createSimpleRenderFn());
		const duration = performance.now() - start;

		expect(container.querySelectorAll("li").length).toBe(1000);
		expect(duration).toBeLessThan(500); // Should be fast

		block.destroy();
	});

	it("handles duplicate values in array", () => {
		const items = cell(["a", "a", "b", "b"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(4);

		block.destroy();
	});

	it("state property returns current forState", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		expect(block.state.array).toEqual(["a", "b", "c"]);
		expect(block.state.items.length).toBe(3);

		block.destroy();
	});

	it("update() can be called manually after direct cell mutation", () => {
		const items = cell(["a", "b"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		// Direct mutation (not using set())
		items.v = ["a", "b", "c", "d"];
		block.update();

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(4);

		block.destroy();
	});

	it("handles swap operation efficiently", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		const originalNodes = Array.from(container.querySelectorAll("li"));

		// Swap first and last
		items.v = ["c", "b", "a"];
		block.update();

		const newNodes = Array.from(container.querySelectorAll("li"));
		// Middle element should be unmoved
		expect(newNodes[1]).toBe(originalNodes[1]);
		// Order should be correct
		expect(newNodes[0].textContent).toBe("c");
		expect(newNodes[2].textContent).toBe("a");

		block.destroy();
	});

	it("handles complete replacement of array contents", () => {
		const items = cell(["x", "y", "z"]);
		const block = forBlock(container, items, createSimpleRenderFn());

		// Completely different items
		items.v = ["1", "2", "3", "4"];
		block.update();

		const lis = container.querySelectorAll("li");
		expect(lis.length).toBe(4);
		expect(lis[0].textContent).toBe("1");
		expect(lis[3].textContent).toBe("4");

		block.destroy();
	});
});

describe("forBlock reconciliation", () => {
	let container;

	beforeEach(() => {
		container = document.createElement("ul");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	// Using objects to test reference equality reconciliation
	it("reconciles by reference equality - keeps same objects", () => {
		const objA = { id: "a" };
		const objB = { id: "b" };
		const objC = { id: "c" };

		const items = cell([objA, objB, objC]);
		const block = forBlock(container, items, (anchor, item) => {
			const li = document.createElement("li");
			li.textContent = item.id;
			anchor.before(li);
			return { start: li, end: li };
		});

		const originalNodes = Array.from(container.querySelectorAll("li"));

		// Reorder but keep same references
		items.v = [objC, objA, objB];
		block.update();

		const newNodes = Array.from(container.querySelectorAll("li"));

		// Nodes should be reused
		expect(newNodes).toContain(originalNodes[0]);
		expect(newNodes).toContain(originalNodes[1]);
		expect(newNodes).toContain(originalNodes[2]);

		block.destroy();
	});

	it("creates new nodes for new references", () => {
		const objA = { id: "a" };
		const objB = { id: "b" };

		const items = cell([objA, objB]);
		const block = forBlock(container, items, (anchor, item) => {
			const li = document.createElement("li");
			li.textContent = item.id;
			anchor.before(li);
			return { start: li, end: li };
		});

		const originalNodes = Array.from(container.querySelectorAll("li"));

		// Replace with new objects (different references)
		items.v = [{ id: "a" }, { id: "b" }];
		block.update();

		const newNodes = Array.from(container.querySelectorAll("li"));

		// Nodes should NOT be reused (different references)
		expect(newNodes[0]).not.toBe(originalNodes[0]);
		expect(newNodes[1]).not.toBe(originalNodes[1]);

		block.destroy();
	});

	it("handles common prefix optimization", () => {
		const items = cell(["a", "b", "c"]);
		const renderCount = { count: 0 };
		const block = forBlock(container, items, (anchor, item) => {
			renderCount.count++;
			const li = document.createElement("li");
			li.textContent = item;
			anchor.before(li);
			return { start: li, end: li };
		});

		expect(renderCount.count).toBe(3);

		// Add to end - prefix stays same
		items.v = ["a", "b", "c", "d"];
		block.update();

		// Should only render new item
		expect(renderCount.count).toBe(4);

		block.destroy();
	});

	it("handles common suffix optimization", () => {
		const items = cell(["a", "b", "c"]);
		const block = forBlock(container, items, (anchor, item) => {
			const li = document.createElement("li");
			li.textContent = item;
			anchor.before(li);
			return { start: li, end: li };
		});

		const originalLastNode = container.querySelectorAll("li")[2];

		// Change beginning, keep end
		items.v = ["x", "b", "c"];
		block.update();

		const newNodes = Array.from(container.querySelectorAll("li"));
		expect(newNodes[2]).toBe(originalLastNode);

		block.destroy();
	});
});
