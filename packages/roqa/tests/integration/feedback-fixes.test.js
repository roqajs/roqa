import { describe, it, expect } from "vitest";
import { compile } from "../../src/compiler/index.js";

/**
 * Minimal MIR builder helper.
 * @param {object} overrides
 */
function makeMir(overrides) {
	return {
		version: 1,
		tagName: "test-comp",
		name: "TestComp",
		state: [],
		actions: [],
		props: [],
		attrs: [],
		emits: [],
		lifecycle: {},
		render: [],
		...overrides,
	};
}

describe("IR feedback fixes", () => {
	describe("B1: StateCollectionIR.key is honored by collection-op", () => {
		it("uses declared key field for `remove`", () => {
			const mir = makeMir({
				state: [
					{ kind: "collection", name: "tasks", key: "slug", initial: [] },
				],
				actions: [
					{
						kind: "action",
						name: "removeTask",
						params: ["slug"],
						body: {
							kind: "collection-op",
							op: "remove",
							name: "tasks",
							args: [{ kind: "param-read", name: "slug" }],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain("t.slug !== slug");
			expect(out).not.toContain("t.id !==");
		});

		it("uses declared key field for `update`", () => {
			const mir = makeMir({
				state: [
					{ kind: "collection", name: "users", key: "uuid", initial: [] },
				],
				actions: [
					{
						kind: "action",
						name: "renameUser",
						params: ["uuid", "name"],
						body: {
							kind: "collection-op",
							op: "update",
							name: "users",
							args: [
								{ kind: "param-read", name: "uuid" },
								{
									kind: "closure",
									params: ["u"],
									body: {
										kind: "object",
										properties: [
											{ kind: "spread", argument: { kind: "param-read", name: "u" } },
											{ kind: "property", key: "name", value: { kind: "param-read", name: "name" } },
										],
									},
								},
							],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain("u.uuid === uuid");
			expect(out).not.toContain("u.id ===");
		});

		it("falls back to `id` when no key is declared", () => {
			const mir = makeMir({
				state: [
					{ kind: "collection", name: "items", key: null, initial: [] },
				],
				actions: [
					{
						kind: "action",
						name: "removeItem",
						params: ["id"],
						body: {
							kind: "collection-op",
							op: "remove",
							name: "items",
							args: [{ kind: "param-read", name: "id" }],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain("t.id !== id");
		});
	});

	describe("B2: StyleMapIR is lowered", () => {
		it("folds literal style properties into the template attribute", () => {
			const mir = makeMir({
				render: [
					{
						kind: "element",
						tag: "div",
						attributes: {},
						events: [],
						children: [],
						styles: {
							kind: "style-map",
							properties: [
								{ property: "color", value: { kind: "literal", value: "red" } },
								{ property: "font-size", value: { kind: "literal", value: "14px" } },
							],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain('style="color: red; font-size: 14px"');
		});

		it("emits setProperty bindings for reactive style properties", () => {
			const mir = makeMir({
				state: [{ kind: "value", name: "color", initial: "blue" }],
				render: [
					{
						kind: "element",
						tag: "div",
						attributes: {},
						events: [],
						children: [],
						styles: {
							kind: "style-map",
							properties: [
								{ property: "color", value: { kind: "state-read", name: "color" } },
							],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain('.style.setProperty("color"');
		});

		it("supports CSS custom properties (--foo)", () => {
			const mir = makeMir({
				state: [{ kind: "value", name: "hue", initial: "200deg" }],
				render: [
					{
						kind: "element",
						tag: "div",
						attributes: {},
						events: [],
						children: [],
						styles: {
							kind: "style-map",
							properties: [
								{ property: "--accent", value: { kind: "state-read", name: "hue" } },
							],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain('.style.setProperty("--accent"');
		});
	});

	describe("A1: ReturnExpr", () => {
		it("emits `return <value>` inside a closure body", () => {
			const mir = makeMir({
				state: [{ kind: "value", name: "x", initial: 0 }],
				actions: [
					{
						kind: "action",
						name: "build",
						params: [],
						body: {
							kind: "call",
							callee: {
								kind: "closure",
								params: [],
								body: {
									kind: "return",
									value: {
										kind: "object",
										properties: [
											{ kind: "property", key: "x", value: { kind: "state-read", name: "x" } },
										],
									},
								},
							},
							args: [],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toMatch(/return\s+\{\s*x:\s*x\.v\s*\}/);
		});

		it("supports bare `return`", () => {
			const mir = makeMir({
				actions: [
					{
						kind: "action",
						name: "guard",
						params: [],
						body: {
							kind: "block",
							body: [
								{ kind: "return" },
							],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toMatch(/\breturn\b/);
		});
	});

	describe("D7-partial: NewExpr", () => {
		it("emits `new Constructor(args)`", () => {
			const mir = makeMir({
				actions: [
					{
						kind: "action",
						name: "now",
						params: [],
						body: {
							kind: "new",
							callee: { kind: "external-ref", name: "Date" },
							args: [],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain("new Date()");
		});

		it("compiles arguments structurally", () => {
			const mir = makeMir({
				state: [{ kind: "value", name: "raw", initial: "a/b" }],
				actions: [
					{
						kind: "action",
						name: "parse",
						params: [],
						body: {
							kind: "new",
							callee: { kind: "external-ref", name: "URL" },
							args: [{ kind: "state-read", name: "raw" }],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain("new URL(raw.v)");
		});
	});

	describe("D2: ClassItemIR dynamic kind", () => {
		it("compiles a dynamic class item into the className expression", () => {
			const mir = makeMir({
				state: [{ kind: "value", name: "size", initial: "md" }],
				render: [
					{
						kind: "element",
						tag: "div",
						attributes: {},
						events: [],
						children: [],
						classes: {
							kind: "class-list",
							items: [
								"box",
								{ kind: "dynamic", value: { kind: "state-read", name: "size" } },
							],
						},
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toContain("size.v");
			// The expression should compose with the static class via " + "
			expect(out).toMatch(/"box"\s*\+/);
		});
	});

	describe("D1: EachIR.source widened to ExprIR", () => {
		it("auto-lifts a constant array literal source", () => {
			const mir = makeMir({
				render: [
					{
						kind: "element",
						tag: "ul",
						attributes: {},
						events: [],
						children: [
							{
								kind: "each",
								source: {
									kind: "array",
									elements: [
										{ kind: "literal", value: "a" },
										{ kind: "literal", value: "b" },
									],
								},
								itemAlias: "label",
								render: [
									{
										kind: "element",
										tag: "li",
										attributes: {},
										events: [],
										children: [
											{ kind: "reactive-text", source: { kind: "param-read", name: "label" } },
										],
									},
								],
							},
						],
					},
				],
			});
			const out = compile(mir).code;
			// A synthesized cell name $each_<n> is used as the forBlock source.
			expect(out).toMatch(/\$each_1/);
			expect(out).toContain("forBlock(");
		});

		it("auto-lifts a prop-read source", () => {
			const mir = makeMir({
				props: [{ kind: "prop", name: "items", required: true }],
				render: [
					{
						kind: "element",
						tag: "ul",
						attributes: {},
						events: [],
						children: [
							{
								kind: "each",
								source: { kind: "prop-read", name: "items" },
								itemAlias: "x",
								render: [
									{
										kind: "element",
										tag: "li",
										attributes: {},
										events: [],
										children: [
											{ kind: "reactive-text", source: { kind: "param-read", name: "x" } },
										],
									},
								],
							},
						],
					},
				],
			});
			const out = compile(mir).code;
			expect(out).toMatch(/\$each_1/);
			expect(out).toContain("forBlock(");
		});
	});
});

describe("Reverie #1: nested block warning", () => {
it("warns when an `each` is nested inside a `show`", () => {
const mir = {
version: 1,
tagName: "nested-test",
name: "X",
state: [
{ kind: "value", name: "ready", initial: false },
{ kind: "collection", name: "todos", key: "id", initial: [] },
],
actions: [],
props: [],
attrs: [],
emits: [],
lifecycle: {},
render: [
{
kind: "show",
condition: { kind: "cell-ref", name: "ready" },
render: [
{
kind: "element",
tag: "ul",
attributes: {},
events: [],
children: [
{
kind: "each",
source: { kind: "cell-ref", name: "todos" },
itemAlias: "todo",
render: [
{
kind: "element",
tag: "li",
attributes: {},
events: [],
children: [
{ kind: "reactive-text", source: { kind: "item-field-read", field: "text" } },
],
},
],
},
],
},
],
},
],
};
const calls = [];
const origWarn = console.warn;
console.warn = (...args) => calls.push(args.join(" "));
try {
compile(mir);
} finally {
console.warn = origWarn;
}
expect(calls.some((c) => /unsupported-nested-block/.test(c))).toBe(true);
});
});
