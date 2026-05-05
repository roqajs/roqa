import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cell, set } from "../../src/runtime/cell.js";
import { switchBlock } from "../../src/runtime/switch-block.js";

/**
 * Tests for the switchBlock runtime function.
 *
 * switchBlock implements multi-branch rendering — the runtime target for
 * `if/else if/else`, `switch`, and `match`-style template constructs. It
 * tracks which arm is active and only swaps DOM when the active arm
 * changes.
 *
 * These tests run in a browser environment (via vitest browser mode).
 */

describe("switchBlock", () => {
	let container;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	/**
	 * Builds a render fn that creates a <span> with the given content and
	 * tracks calls + cleanups so tests can assert on lifecycle.
	 */
	function createRender(content) {
		const fn = vi.fn((anchor) => {
			const span = document.createElement("span");
			span.textContent = content;
			anchor.before(span);
			const cleanup = vi.fn();
			fn.cleanups.push(cleanup);
			return { start: span, end: span, cleanup };
		});
		fn.cleanups = [];
		return fn;
	}

	describe("predicate-mode arms (no discriminant)", () => {
		it("renders the first arm whose test passes", () => {
			const status = cell("loading");
			const block = switchBlock(
				container,
				[
					{ test: () => status.v === "loading", render: createRender("LOADING") },
					{ test: () => status.v === "error", render: createRender("ERROR") },
				],
				null,
				[status],
			);

			expect(container.textContent).toBe("LOADING");
			block.destroy();
		});

		it("swaps DOM when active arm changes", () => {
			const status = cell("loading");
			const block = switchBlock(
				container,
				[
					{ test: () => status.v === "loading", render: createRender("LOADING") },
					{ test: () => status.v === "error", render: createRender("ERROR") },
				],
				null,
				[status],
			);

			expect(container.textContent).toBe("LOADING");
			set(status, "error");
			expect(container.textContent).toBe("ERROR");
			block.destroy();
		});

		it("renders fallback when no arm matches", () => {
			const status = cell("idle");
			const block = switchBlock(
				container,
				[
					{ test: () => status.v === "loading", render: createRender("LOADING") },
					{ test: () => status.v === "error", render: createRender("ERROR") },
				],
				createRender("IDLE"),
				[status],
			);

			expect(container.textContent).toBe("IDLE");
			block.destroy();
		});

		it("renders nothing when no arm matches and no fallback is provided", () => {
			const status = cell("idle");
			const block = switchBlock(
				container,
				[{ test: () => status.v === "loading", render: createRender("LOADING") }],
				null,
				[status],
			);

			expect(container.textContent).toBe("");
			block.destroy();
		});

		it("swaps from arm to fallback and back", () => {
			const status = cell("loading");
			const block = switchBlock(
				container,
				[{ test: () => status.v === "loading", render: createRender("LOADING") }],
				createRender("DEFAULT"),
				[status],
			);

			expect(container.textContent).toBe("LOADING");
			set(status, "other");
			expect(container.textContent).toBe("DEFAULT");
			set(status, "loading");
			expect(container.textContent).toBe("LOADING");
			block.destroy();
		});

		it("does not re-render when active arm stays the same", () => {
			const status = cell("loading");
			const armRender = createRender("LOADING");
			const block = switchBlock(
				container,
				[
					{ test: () => status.v === "loading", render: armRender },
					{ test: () => status.v === "error", render: createRender("ERROR") },
				],
				null,
				[status],
			);

			expect(armRender).toHaveBeenCalledTimes(1);
			set(status, "loading"); // same value
			expect(armRender).toHaveBeenCalledTimes(1);
			block.destroy();
		});

		it("first matching arm wins (later matches are ignored)", () => {
			const value = cell(5);
			const firstRender = createRender("first");
			const secondRender = createRender("second");
			const block = switchBlock(
				container,
				[
					{ test: () => value.v > 0, render: firstRender },
					{ test: () => value.v > 3, render: secondRender },
				],
				null,
				[value],
			);

			expect(container.textContent).toBe("first");
			expect(secondRender).not.toHaveBeenCalled();
			block.destroy();
		});
	});

	describe("activeArm reporting", () => {
		it("reports -1 when nothing renders", () => {
			const status = cell("idle");
			const block = switchBlock(
				container,
				[{ test: () => status.v === "loading", render: createRender("LOADING") }],
				null,
				[status],
			);

			expect(block.activeArm).toBe(-1);
			block.destroy();
		});

		it("reports the matching arm index", () => {
			const status = cell("error");
			const block = switchBlock(
				container,
				[
					{ test: () => status.v === "loading", render: createRender("L") },
					{ test: () => status.v === "error", render: createRender("E") },
					{ test: () => status.v === "ok", render: createRender("O") },
				],
				null,
				[status],
			);

			expect(block.activeArm).toBe(1);
			set(status, "ok");
			expect(block.activeArm).toBe(2);
			block.destroy();
		});

		it("reports arms.length when fallback is active", () => {
			const status = cell("idle");
			const block = switchBlock(
				container,
				[{ test: () => status.v === "loading", render: createRender("L") }],
				createRender("D"),
				[status],
			);

			expect(block.activeArm).toBe(1);
			block.destroy();
		});
	});

	describe("cleanup", () => {
		it("runs the active arm's cleanup when swapping arms", () => {
			const status = cell("loading");
			const loadingRender = createRender("L");
			const errorRender = createRender("E");
			const block = switchBlock(
				container,
				[
					{ test: () => status.v === "loading", render: loadingRender },
					{ test: () => status.v === "error", render: errorRender },
				],
				null,
				[status],
			);

			expect(loadingRender.cleanups[0]).not.toHaveBeenCalled();
			set(status, "error");
			expect(loadingRender.cleanups[0]).toHaveBeenCalledOnce();
			expect(errorRender.cleanups[0]).not.toHaveBeenCalled();
			block.destroy();
			expect(errorRender.cleanups[0]).toHaveBeenCalledOnce();
		});

		it("runs cleanup on destroy", () => {
			const status = cell("loading");
			const loadingRender = createRender("L");
			const block = switchBlock(
				container,
				[{ test: () => status.v === "loading", render: loadingRender }],
				null,
				[status],
			);

			block.destroy();
			expect(loadingRender.cleanups[0]).toHaveBeenCalledOnce();
		});

		it("destroy unsubscribes from dependency cells", () => {
			const status = cell("loading");
			const armRender = createRender("L");
			const block = switchBlock(
				container,
				[{ test: () => status.v === "loading", render: armRender }],
				null,
				[status],
			);

			block.destroy();
			// After destroy, updates should not re-render
			set(status, "loading");
			expect(armRender).toHaveBeenCalledTimes(1);
		});
	});

	describe("multi-cell dependencies", () => {
		it("re-evaluates when any dependency changes", () => {
			const a = cell(false);
			const b = cell(false);
			const block = switchBlock(
				container,
				[
					{ test: () => a.v, render: createRender("A") },
					{ test: () => b.v, render: createRender("B") },
				],
				createRender("FALLBACK"),
				[a, b],
			);

			expect(container.textContent).toBe("FALLBACK");
			set(a, true);
			expect(container.textContent).toBe("A");
			set(a, false);
			set(b, true);
			expect(container.textContent).toBe("B");
			block.destroy();
		});
	});

	describe("no dependencies (static evaluation)", () => {
		it("renders matching arm based on initial test, no subscription", () => {
			let value = "loading";
			const block = switchBlock(
				container,
				[
					{ test: () => value === "loading", render: createRender("L") },
					{ test: () => value === "error", render: createRender("E") },
				],
				null,
				undefined,
			);

			expect(container.textContent).toBe("L");
			// Mutating the captured local doesn't auto-update without deps,
			// but explicitly calling update() will.
			value = "error";
			block.update();
			expect(container.textContent).toBe("E");
			block.destroy();
		});
	});
});
