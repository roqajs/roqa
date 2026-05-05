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

describe("SwitchIR compilation", () => {
	it("imports switchBlock from runtime", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "status", initial: "loading" }],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							discriminant: { kind: "state-read", name: "status" },
							arms: [
								{
									test: { kind: "literal", value: "loading" },
									render: [
										{
											kind: "element",
											tag: "p",
											attributes: {},
											events: [],
											children: [{ kind: "text", value: "Loading" }],
										},
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toMatch(/import \{[^}]*switchBlock[^}]*\} from "roqa"/);
		expect(code).toMatch(/switchBlock\(/);
	});

	it("folds discriminant into arm tests with === comparison", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "status", initial: "loading" }],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							discriminant: { kind: "state-read", name: "status" },
							arms: [
								{
									test: { kind: "literal", value: "loading" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
								{
									test: { kind: "literal", value: "error" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toContain('test: () => status.v === "loading"');
		expect(code).toContain('test: () => status.v === "error"');
	});

	it("emits predicate arms verbatim without discriminant", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "score", initial: 0 }],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							arms: [
								{
									test: {
										kind: "binary",
										op: ">=",
										left: { kind: "state-read", name: "score" },
										right: { kind: "literal", value: 90 },
									},
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toContain("test: () => score.v >= 90");
		expect(code).not.toContain("===");
	});

	it("emits null fallback when no fallback declared", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "x", initial: 0 }],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							arms: [
								{
									test: { kind: "state-read", name: "x" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toMatch(/null,\s*\[x\]/);
	});

	it("subscribes to all dependency cells from arm tests", () => {
		const mir = makeMir({
			state: [
				{ kind: "value", name: "a", initial: false },
				{ kind: "value", name: "b", initial: false },
			],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							arms: [
								{
									test: { kind: "state-read", name: "a" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
								{
									test: { kind: "state-read", name: "b" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		// The deps array in switchBlock(...) call should mention both cells.
		const depsMatch = code.match(/null,\s*\[([^\]]+)\]/) || code.match(/\},\s*\[([^\]]+)\]\)/);
		expect(depsMatch).not.toBeNull();
		expect(depsMatch[1]).toContain("a");
		expect(depsMatch[1]).toContain("b");
	});

	it("inlines block.update() into actions that write a discriminant cell", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "status", initial: "loading" }],
			actions: [
				{
					kind: "action",
					name: "showError",
					params: [],
					body: {
						kind: "state-write",
						name: "status",
						value: { kind: "literal", value: "error" },
					},
				},
			],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							discriminant: { kind: "state-read", name: "status" },
							arms: [
								{
									test: { kind: "literal", value: "loading" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		// The `showError` action should call `status_switchBlock.update()`
		// after the cell write so the runtime picks the new arm.
		expect(code).toContain("status_switchBlock.update()");
	});

	it("emits fallback render fn when fallback is provided", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "x", initial: 0 }],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "switch",
							arms: [
								{
									test: { kind: "state-read", name: "x" },
									render: [
										{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
									],
								},
							],
							fallback: [
								{ kind: "element", tag: "span", attributes: {}, events: [], children: [] },
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		// There should be a span template for the fallback and a fallback
		// render fn arg following the arms array.
		expect(code).toContain("<span></span>");
	});
});

describe("EachIR.indexAlias", () => {
	it("binds the index parameter to the declared alias name", () => {
		const mir = makeMir({
			state: [
				{ kind: "collection", name: "items", key: "id", initial: [] },
			],
			render: [
				{
					kind: "element",
					tag: "ol",
					attributes: {},
					events: [],
					children: [
						{
							kind: "each",
							source: { kind: "cell-ref", name: "items" },
							itemAlias: "item",
							indexAlias: "i",
							render: [
								{
									kind: "element",
									tag: "li",
									attributes: {},
									events: [],
									children: [
										{
											kind: "reactive-text",
											source: { kind: "local-read", name: "i" },
										},
									],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toContain("(anchor, item, i)");
		expect(code).toContain("li_1_text.nodeValue = i");
	});

	it("uses _index placeholder when no indexAlias is set", () => {
		const mir = makeMir({
			state: [{ kind: "collection", name: "items", key: "id", initial: [] }],
			render: [
				{
					kind: "element",
					tag: "ul",
					attributes: {},
					events: [],
					children: [
						{
							kind: "each",
							source: { kind: "cell-ref", name: "items" },
							itemAlias: "item",
							render: [
								{ kind: "element", tag: "li", attributes: {}, events: [], children: [] },
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toContain("(anchor, item, _index)");
	});
});

describe("EachIR.empty", () => {
	it("emits a sibling showBlock controller toggling on length === 0", () => {
		const mir = makeMir({
			state: [{ kind: "collection", name: "items", key: "id", initial: [] }],
			render: [
				{
					kind: "element",
					tag: "ul",
					attributes: {},
					events: [],
					children: [
						{
							kind: "each",
							source: { kind: "cell-ref", name: "items" },
							itemAlias: "item",
							render: [
								{ kind: "element", tag: "li", attributes: {}, events: [], children: [] },
							],
							empty: [
								{
									kind: "element",
									tag: "li",
									attributes: {},
									events: [],
									children: [{ kind: "text", value: "Empty" }],
								},
							],
						},
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toMatch(/import \{[^}]*showBlock[^}]*\} from "roqa"/);
		expect(code).toContain("items_emptyBlock");
		expect(code).toContain("items.v.length === 0");
	});
});
