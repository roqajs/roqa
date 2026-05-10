import { describe, it, expect } from "vitest";
import { convertJSXToNodes } from "../src/render.js";
import { createExprContext } from "../src/expressions.js";
import { parse } from "../src/parse.js";
import * as t from "@babel/types";

/**
 * Helper: parse JSX and get the expression node.
 */
function parseJSX(code) {
	const ast = parse(`const x = ${code};`, "test.tsx");
	const stmt = ast.program.body[0];
	return stmt.declarations[0].init;
}

function makeCtx(cells = {}, actions = []) {
	const ctx = createExprContext();
	for (const [name, kind] of Object.entries(cells)) {
		ctx.cells.set(name, kind);
	}
	for (const a of actions) ctx.actions.add(a);
	return ctx;
}

describe("convertJSXToNodes", () => {
	describe("elements", () => {
		it("converts a simple element", () => {
			const jsx = parseJSX("<div></div>");
			const ctx = createExprContext();
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes).toHaveLength(1);
			expect(nodes[0].kind).toBe("element");
			expect(nodes[0].tag).toBe("div");
		});

		it("converts element with static attributes", () => {
			const jsx = parseJSX('<input id="name" type="text" />');
			const nodes = convertJSXToNodes(jsx, createExprContext());

			expect(nodes[0].attributes).toEqual({
				id: { kind: "literal", value: "name" },
				type: { kind: "literal", value: "text" },
			});
		});

		it("converts element with reactive attributes", () => {
			const jsx = parseJSX("<input value={get(count)} />");
			const ctx = makeCtx({ count: "value" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].attributes.value).toEqual({
				kind: "state-read",
				name: "count",
			});
		});

		it("converts boolean attributes", () => {
			const jsx = parseJSX("<button disabled></button>");
			const nodes = convertJSXToNodes(jsx, createExprContext());

			expect(nodes[0].attributes.disabled).toEqual({
				kind: "literal",
				value: true,
			});
		});
	});

	describe("text content", () => {
		it("converts static text", () => {
			const jsx = parseJSX("<p>Hello World</p>");
			const nodes = convertJSXToNodes(jsx, createExprContext());

			expect(nodes[0].children).toHaveLength(1);
			expect(nodes[0].children[0]).toEqual({
				kind: "text",
				value: "Hello World",
			});
		});

		it("converts reactive text", () => {
			const jsx = parseJSX("<p>{get(count)}</p>");
			const ctx = makeCtx({ count: "value" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].children).toHaveLength(1);
			expect(nodes[0].children[0]).toEqual({
				kind: "reactive-text",
				source: { kind: "state-read", name: "count" },
			});
		});

		it("converts mixed text and reactive content", () => {
			const jsx = parseJSX("<p>Count is {get(count)}</p>");
			const ctx = makeCtx({ count: "value" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].children).toHaveLength(2);
			expect(nodes[0].children[0]).toEqual({
				kind: "text",
				value: "Count is ",
			});
			expect(nodes[0].children[1]).toEqual({
				kind: "reactive-text",
				source: { kind: "state-read", name: "count" },
			});
		});
	});

	describe("event handlers", () => {
		it("converts onclick with action reference", () => {
			const jsx = parseJSX("<button onclick={increment}></button>");
			const ctx = makeCtx({}, ["increment"]);
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].events).toEqual([
				{
					event: "click",
					handler: { kind: "action-call", name: "increment", args: [] },
				},
			]);
		});

		it("normalizes onClick to click", () => {
			const jsx = parseJSX("<button onClick={increment}></button>");
			const ctx = makeCtx({}, ["increment"]);
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].events[0].event).toBe("click");
		});

		it("normalizes onInput to input", () => {
			const jsx = parseJSX("<input onInput={update} />");
			const ctx = makeCtx({}, ["update"]);
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].events[0].event).toBe("input");
		});

		it("converts inline arrow handler to ClosureExpr", () => {
			const jsx = parseJSX("<input oninput={(e) => set(name, e.target.value)} />");
			const ctx = makeCtx({ name: "value" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].events[0].handler.kind).toBe("closure");
		});

		it("normalizes () => action() to ActionCallExpr", () => {
			const jsx = parseJSX("<button onclick={() => increment()}></button>");
			const ctx = makeCtx({}, ["increment"]);
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].events[0].handler).toEqual({
				kind: "action-call",
				name: "increment",
				args: [],
			});
		});
	});

	describe("fragments", () => {
		it("converts fragment to multiple root nodes", () => {
			const jsx = parseJSX("<><p>A</p><p>B</p></>");
			const nodes = convertJSXToNodes(jsx, createExprContext());

			expect(nodes).toHaveLength(2);
			expect(nodes[0].tag).toBe("p");
			expect(nodes[1].tag).toBe("p");
		});
	});

	describe("For component", () => {
		it("converts <For> to EachIR", () => {
			const jsx = parseJSX("<For each={items}>{(item) => <li>{item.text}</li>}</For>");
			const ctx = makeCtx({ items: "collection" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes).toHaveLength(1);
			expect(nodes[0].kind).toBe("each");
			expect(nodes[0].source).toEqual({ kind: "cell-ref", name: "items" });
			expect(nodes[0].itemAlias).toBe("item");
			expect(nodes[0].render).toHaveLength(1);
			expect(nodes[0].render[0].tag).toBe("li");
		});

		it("converts item field access to ItemFieldReadExpr", () => {
			const jsx = parseJSX("<For each={items}>{(item) => <li>{item.text}</li>}</For>");
			const ctx = makeCtx({ items: "collection" });
			const nodes = convertJSXToNodes(jsx, ctx);

			const liChildren = nodes[0].render[0].children;
			expect(liChildren).toHaveLength(1);
			expect(liChildren[0]).toEqual({
				kind: "reactive-text",
				source: {
					kind: "member",
					object: { kind: "local-read", name: "item" },
					property: "text",
				},
			});
		});
	});

	describe("Show patterns", () => {
		it("converts && pattern to ShowIR (no fallback)", () => {
			const jsx = parseJSX("<>{get(visible) && <p>Visible</p>}</>");
			const ctx = makeCtx({ visible: "value" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes).toHaveLength(1);
			expect(nodes[0].kind).toBe("show");
			expect(nodes[0].condition).toEqual({ kind: "cell-ref", name: "visible" });
			expect(nodes[0].render).toHaveLength(1);
			expect(nodes[0].fallback).toBeUndefined();
		});

		it("converts ternary pattern to ShowIR (with fallback)", () => {
			const jsx = parseJSX("<>{get(visible) ? <p>Yes</p> : <p>No</p>}</>");
			const ctx = makeCtx({ visible: "value" });
			const nodes = convertJSXToNodes(jsx, ctx);

			expect(nodes[0].kind).toBe("show");
			expect(nodes[0].render).toHaveLength(1);
			expect(nodes[0].fallback).toHaveLength(1);
		});
	});

	describe("class attribute", () => {
		it('converts class="btn" to literal attribute', () => {
			const jsx = parseJSX('<div class="btn"></div>');
			const nodes = convertJSXToNodes(jsx, createExprContext());

			expect(nodes[0].attributes.class).toEqual({
				kind: "literal",
				value: "btn",
			});
		});

		it('normalizes className to class', () => {
			const jsx = parseJSX('<div className="btn"></div>');
			const nodes = convertJSXToNodes(jsx, createExprContext());

			expect(nodes[0].attributes.class).toEqual({
				kind: "literal",
				value: "btn",
			});
		});
	});
});
