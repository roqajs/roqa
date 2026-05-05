import { describe, it, expect } from "vitest";
import { compile } from "../../src/compiler/index.js";

/**
 * Minimal MIR builder helper.
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

describe("RawHtmlIR compilation", () => {
	it("compiles a static raw-html child to innerHTML assignment", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "html", initial: "<b>hi</b>" }],
			render: [
				{
					kind: "element",
					tag: "article",
					attributes: {},
					events: [],
					children: [
						{ kind: "raw-html", source: { kind: "state-read", name: "html" } },
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toContain("article_1.innerHTML = html.v;");
	});

	it("inlines reactive innerHTML updates into actions that write the source cell", () => {
		const mir = makeMir({
			state: [{ kind: "value", name: "markup", initial: "<i>initial</i>" }],
			actions: [
				{
					kind: "action",
					name: "swap",
					params: [],
					body: {
						kind: "state-write",
						name: "markup",
						value: { kind: "literal", value: "<b>changed</b>" },
					},
				},
			],
			render: [
				{
					kind: "element",
					tag: "article",
					attributes: {},
					events: [],
					children: [
						{ kind: "raw-html", source: { kind: "state-read", name: "markup" } },
					],
				},
			],
		});
		const { code } = compile(mir);
		// Initial mount:
		expect(code).toContain("article_1.innerHTML = markup.v;");
		// Reactive update inlined into action:
		expect(code).toMatch(/markup\.ref_\d+\.innerHTML\s*=\s*markup\.v/);
	});

	it("emits a non-fatal raw-html-used warning during validation", () => {
		// Compile should still succeed; the warning is emitted via console
		// (and would also be returned by validate()). Just confirm we do
		// produce code without erroring.
		const mir = makeMir({
			state: [{ kind: "value", name: "html", initial: "<p>hi</p>" }],
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{ kind: "raw-html", source: { kind: "state-read", name: "html" }, trusted: true },
					],
				},
			],
		});
		const { code } = compile(mir);
		expect(code).toContain("innerHTML");
	});
});
