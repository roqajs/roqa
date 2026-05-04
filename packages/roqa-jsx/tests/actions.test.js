import { describe, it, expect } from "vitest";
import { extractActions } from "../src/actions.js";
import { createExprContext } from "../src/expressions.js";
import { parse } from "../src/parse.js";

/**
 * Helper: parse code and extract statements from a function body.
 */
function getBody(code) {
	const ast = parse(`function test() { ${code} }`, "test.tsx");
	const fn = ast.program.body[0];
	return fn.body.body;
}

function makeCtx(cells = {}, actions = []) {
	const ctx = createExprContext();
	for (const [name, kind] of Object.entries(cells)) {
		ctx.cells.set(name, kind);
	}
	for (const a of actions) ctx.actions.add(a);
	return ctx;
}

describe("extractActions", () => {
	it("extracts arrow function actions", () => {
		const body = getBody(`
			const increment = () => set(count, get(count) + 1);
		`);
		const ctx = makeCtx({ count: "value" }, ["increment"]);
		const actions = extractActions(body, ctx, new Set(["count"]));

		expect(actions).toHaveLength(1);
		expect(actions[0].kind).toBe("action");
		expect(actions[0].name).toBe("increment");
		expect(actions[0].params).toEqual([]);
	});

	it("extracts function declaration actions", () => {
		const body = getBody(`
			function addTodo(event) {
				set(todos, get(todos));
			}
		`);
		const ctx = makeCtx({ todos: "value" }, ["addTodo"]);
		const actions = extractActions(body, ctx, new Set(["todos"]));

		expect(actions).toHaveLength(1);
		expect(actions[0].name).toBe("addTodo");
		expect(actions[0].params).toEqual(["event"]);
	});

	it("extracts action with parameter", () => {
		const body = getBody(`
			const updateName = (e) => set(name, e.target.value);
		`);
		const ctx = makeCtx({ name: "value" }, ["updateName"]);
		const actions = extractActions(body, ctx, new Set(["name"]));

		expect(actions[0].params).toEqual(["e"]);
		expect(actions[0].body.kind).toBe("state-write");
	});

	it("extracts multi-statement action body as BlockExpr", () => {
		const body = getBody(`
			const addTodo = () => {
				set(todos, get(todos));
				set(draft, "");
			};
		`);
		const ctx = makeCtx({ todos: "value", draft: "value" }, ["addTodo"]);
		const actions = extractActions(body, ctx, new Set(["todos", "draft"]));

		expect(actions[0].body.kind).toBe("block");
		expect(actions[0].body.body).toHaveLength(2);
	});

	it("skips cell declarations", () => {
		const body = getBody(`
			const count = cell(0);
			const increment = () => set(count, get(count) + 1);
		`);
		const ctx = makeCtx({ count: "value" }, ["increment"]);
		const cellNames = new Set(["count"]);
		const actions = extractActions(body, ctx, cellNames);

		expect(actions).toHaveLength(1);
		expect(actions[0].name).toBe("increment");
	});

	it("converts action body expressions correctly", () => {
		const body = getBody(`
			const increment = () => set(count, get(count) + 1);
		`);
		const ctx = makeCtx({ count: "value" }, ["increment"]);
		const actions = extractActions(body, ctx, new Set(["count"]));

		const actionBody = actions[0].body;
		expect(actionBody.kind).toBe("state-write");
		expect(actionBody.name).toBe("count");
		expect(actionBody.value.kind).toBe("binary");
		expect(actionBody.value.op).toBe("+");
		expect(actionBody.value.left).toEqual({ kind: "state-read", name: "count" });
		expect(actionBody.value.right).toEqual({ kind: "literal", value: 1 });
	});
});
