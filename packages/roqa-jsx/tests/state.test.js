import { describe, it, expect } from "vitest";
import { extractState } from "../src/state.js";
import { createExprContext } from "../src/expressions.js";
import { parse } from "../src/parse.js";

/**
 * Helper: parse code and extract statements from a function body.
 * @param {string} code - Code with a function containing cell() declarations
 * @returns {import('@babel/types').Statement[]}
 */
function getBody(code) {
	const ast = parse(`function test() { ${code} }`, "test.tsx");
	const fn = ast.program.body[0];
	return fn.body.body;
}

describe("extractState", () => {
	it("extracts simple value state: cell(0)", () => {
		const body = getBody("const count = cell(0);");
		const ctx = createExprContext();
		const { states, cellMap } = extractState(body, ctx, new Set());

		expect(states).toHaveLength(1);
		expect(states[0]).toEqual({ kind: "value", name: "count", initial: 0 });
		expect(cellMap.get("count")).toBe("value");
	});

	it("extracts string state: cell('World')", () => {
		const body = getBody(`const name = cell("World");`);
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		expect(states).toHaveLength(1);
		expect(states[0]).toEqual({ kind: "value", name: "name", initial: "World" });
	});

	it("extracts boolean state: cell(false)", () => {
		const body = getBody("const isRunning = cell(false);");
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		expect(states[0]).toEqual({ kind: "value", name: "isRunning", initial: false });
	});

	it("extracts array state: cell([])", () => {
		const body = getBody("const items = cell([]);");
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		expect(states[0]).toEqual({ kind: "value", name: "items", initial: [] });
	});

	it("extracts array state as collection when used with <For>", () => {
		const body = getBody("const items = cell([]);");
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set(["items"]));

		expect(states[0]).toEqual({ kind: "collection", name: "items", key: null, initial: [] });
	});

	it("extracts computed state: cell(() => expr)", () => {
		const body = getBody(`
			const count = cell(0);
			const doubled = cell(() => get(count) * 2);
		`);
		const ctx = createExprContext();
		const { states, cellMap } = extractState(body, ctx, new Set());

		expect(states).toHaveLength(2);
		expect(states[1].kind).toBe("computed");
		expect(states[1].name).toBe("doubled");
		expect(states[1].body.kind).toBe("binary");
		expect(cellMap.get("doubled")).toBe("computed");
	});

	it("resolves computed bodies with correct cell references", () => {
		const body = getBody(`
			const count = cell(0);
			const doubled = cell(() => get(count) * 2);
		`);
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		const computedBody = states[1].body;
		expect(computedBody.kind).toBe("binary");
		expect(computedBody.left.kind).toBe("state-read");
		expect(computedBody.left.name).toBe("count");
	});

	it("extracts multiple states", () => {
		const body = getBody(`
			const a = cell(1);
			const b = cell(2);
			const c = cell("hello");
		`);
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		expect(states).toHaveLength(3);
		expect(states.map((s) => s.name)).toEqual(["a", "b", "c"]);
	});

	it("ignores non-cell variable declarations", () => {
		const body = getBody(`
			const count = cell(0);
			const x = 42;
			const fn = () => {};
		`);
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		expect(states).toHaveLength(1);
		expect(states[0].name).toBe("count");
	});

	it("extracts array state with initial values", () => {
		const body = getBody(`
			const todos = cell([
				{ text: "Buy milk", completed: false },
				{ text: "Walk dog", completed: true },
			]);
		`);
		const ctx = createExprContext();
		const { states } = extractState(body, ctx, new Set());

		expect(states[0].initial).toEqual([
			{ text: "Buy milk", completed: false },
			{ text: "Walk dog", completed: true },
		]);
	});
});
