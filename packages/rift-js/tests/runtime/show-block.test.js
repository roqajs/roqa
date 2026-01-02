import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cell } from "../../src/runtime/cell.js";
import { showBlock } from "../../src/runtime/show-block.js";

/**
 * Tests for the showBlock runtime function
 *
 * showBlock implements conditional rendering for the <Show when={...}> component.
 * It efficiently toggles DOM content based on a reactive condition:
 *
 * - Creates/removes DOM nodes when condition changes
 * - Maintains anchor markers for proper insertion points
 * - Handles nested reactive content within the shown block
 * - Cleans up properly when content is hidden
 *
 * These tests run in a browser environment (via vitest browser mode) to verify
 * actual DOM manipulation behavior.
 */

describe("showBlock", () => {
	let container;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	function createSimpleRenderFn(content = "Hello") {
		return (anchor) => {
			const span = document.createElement("span");
			span.textContent = content;
			anchor.before(span);
			return { start: span, end: span };
		};
	}

	describe("with cell condition", () => {
		it("shows content when cell is truthy", () => {
			const visible = cell(true);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(container.querySelector("span")).not.toBeNull();
			expect(container.querySelector("span").textContent).toBe("Hello");

			block.destroy();
		});

		it("hides content when cell is falsy", () => {
			const visible = cell(false);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(container.querySelector("span")).toBeNull();

			block.destroy();
		});

		it("updates when cell changes from false to true", () => {
			const visible = cell(false);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(container.querySelector("span")).toBeNull();

			visible.v = true;
			block.update();

			expect(container.querySelector("span")).not.toBeNull();

			block.destroy();
		});

		it("updates when cell changes from true to false", () => {
			const visible = cell(true);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(container.querySelector("span")).not.toBeNull();

			visible.v = false;
			block.update();

			expect(container.querySelector("span")).toBeNull();

			block.destroy();
		});

		it("treats truthy values as true", () => {
			const visible = cell(1);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(block.isShowing).toBe(true);

			visible.v = "string";
			block.update();
			expect(block.isShowing).toBe(true);

			visible.v = {};
			block.update();
			expect(block.isShowing).toBe(true);

			block.destroy();
		});

		it("treats falsy values as false", () => {
			const visible = cell(0);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(block.isShowing).toBe(false);

			visible.v = "";
			block.update();
			expect(block.isShowing).toBe(false);

			visible.v = null;
			block.update();
			expect(block.isShowing).toBe(false);

			visible.v = undefined;
			block.update();
			expect(block.isShowing).toBe(false);

			block.destroy();
		});
	});

	describe("with function condition", () => {
		it("evaluates function for initial state", () => {
			let value = true;
			const block = showBlock(container, () => value, createSimpleRenderFn());

			expect(block.isShowing).toBe(true);

			block.destroy();
		});

		it("re-evaluates function on update", () => {
			let value = false;
			const block = showBlock(container, () => value, createSimpleRenderFn());

			expect(block.isShowing).toBe(false);

			value = true;
			block.update();

			expect(block.isShowing).toBe(true);

			block.destroy();
		});
	});

	describe("with static condition", () => {
		it("handles static true", () => {
			const block = showBlock(container, true, createSimpleRenderFn());

			expect(block.isShowing).toBe(true);
			expect(container.querySelector("span")).not.toBeNull();

			block.destroy();
		});

		it("handles static false", () => {
			const block = showBlock(container, false, createSimpleRenderFn());

			expect(block.isShowing).toBe(false);
			expect(container.querySelector("span")).toBeNull();

			block.destroy();
		});
	});

	describe("with dependencies array", () => {
		it("subscribes to multiple dependencies", () => {
			const dep1 = cell(true);
			const dep2 = cell(true);

			const block = showBlock(container, () => dep1.v && dep2.v, createSimpleRenderFn(), [
				dep1,
				dep2,
			]);

			expect(block.isShowing).toBe(true);

			dep1.v = false;
			block.update();

			expect(block.isShowing).toBe(false);

			dep1.v = true;
			dep2.v = false;
			block.update();

			expect(block.isShowing).toBe(false);

			block.destroy();
		});
	});

	describe("cleanup", () => {
		it("calls cleanup function when hiding", () => {
			const cleanupFn = vi.fn();
			const visible = cell(true);

			const block = showBlock(container, visible, (anchor) => {
				const span = document.createElement("span");
				anchor.before(span);
				return { start: span, end: span, cleanup: cleanupFn };
			});

			expect(cleanupFn).not.toHaveBeenCalled();

			visible.v = false;
			block.update();

			expect(cleanupFn).toHaveBeenCalled();

			block.destroy();
		});

		it("calls cleanup function on destroy", () => {
			const cleanupFn = vi.fn();
			const visible = cell(true);

			const block = showBlock(container, visible, (anchor) => {
				const span = document.createElement("span");
				anchor.before(span);
				return { start: span, end: span, cleanup: cleanupFn };
			});

			block.destroy();

			expect(cleanupFn).toHaveBeenCalled();
		});

		it("removes DOM nodes when hiding", () => {
			const visible = cell(true);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(container.querySelector("span")).not.toBeNull();

			visible.v = false;
			block.update();

			expect(container.querySelector("span")).toBeNull();

			block.destroy();
		});

		it("removes DOM nodes on destroy", () => {
			const visible = cell(true);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(container.querySelector("span")).not.toBeNull();

			block.destroy();

			expect(container.querySelector("span")).toBeNull();
		});
	});

	describe("multi-node rendering", () => {
		it("handles render function returning multi-node items", () => {
			const visible = cell(true);

			const block = showBlock(container, visible, (anchor) => {
				const span1 = document.createElement("span");
				span1.textContent = "1";
				const span2 = document.createElement("span");
				span2.textContent = "2";
				anchor.before(span1);
				anchor.before(span2);
				return { start: span1, end: span2 };
			});

			const spans = container.querySelectorAll("span");
			expect(spans.length).toBe(2);
			expect(spans[0].textContent).toBe("1");
			expect(spans[1].textContent).toBe("2");

			visible.v = false;
			block.update();

			expect(container.querySelectorAll("span").length).toBe(0);

			block.destroy();
		});
	});

	describe("isShowing property", () => {
		it("reflects current visibility state", () => {
			const visible = cell(false);
			const block = showBlock(container, visible, createSimpleRenderFn());

			expect(block.isShowing).toBe(false);

			visible.v = true;
			block.update();

			expect(block.isShowing).toBe(true);

			visible.v = false;
			block.update();

			expect(block.isShowing).toBe(false);

			block.destroy();
		});
	});

	describe("edge cases", () => {
		it("does not recreate DOM when already showing", () => {
			const visible = cell(true);
			let renderCount = 0;

			const block = showBlock(container, visible, (anchor) => {
				renderCount++;
				const span = document.createElement("span");
				anchor.before(span);
				return { start: span, end: span };
			});

			expect(renderCount).toBe(1);

			// Update with still true
			visible.v = 1; // Still truthy
			block.update();

			expect(renderCount).toBe(1); // Should not re-render

			block.destroy();
		});

		it("does not destroy DOM when already hidden", () => {
			const cleanupFn = vi.fn();
			const visible = cell(false);

			const block = showBlock(container, visible, (anchor) => {
				const span = document.createElement("span");
				anchor.before(span);
				return { start: span, end: span, cleanup: cleanupFn };
			});

			// Update with still false
			visible.v = 0; // Still falsy
			block.update();

			expect(cleanupFn).not.toHaveBeenCalled();

			block.destroy();
		});

		it("handles rapid show/hide toggles", () => {
			const visible = cell(false);
			const block = showBlock(container, visible, createSimpleRenderFn());

			for (let i = 0; i < 10; i++) {
				visible.v = !visible.v;
				block.update();
			}

			// 10 toggles from false: F->T->F->T->F->T->F->T->F->T->F = still false
			// (toggle 1: T, toggle 2: F, ... toggle 10: F)
			expect(block.isShowing).toBe(false);
			expect(container.querySelector("span")).toBeNull();

			block.destroy();
		});
	});
});
