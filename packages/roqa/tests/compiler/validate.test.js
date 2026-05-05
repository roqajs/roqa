import { describe, it, expect } from "vitest";
import { validate } from "../../src/compiler/validate.js";

describe("validate", () => {
	it("accepts valid static component", () => {
		const mir = {
			version: 1,
			tagName: "hello-world",
			name: "HelloWorld",
			state: [],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [{ kind: "text", value: "Hello" }],
				},
			],
		};
		const diagnostics = validate(mir);
		expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
	});

	it("rejects invalid version", () => {
		const mir = {
			version: 2,
			tagName: "my-comp",
			name: "MyComp",
			state: [],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [],
		};
		const diagnostics = validate(mir);
		expect(diagnostics.some((d) => d.code === "invalid-version")).toBe(true);
	});

	it("rejects invalid tag name", () => {
		const mir = {
			version: 1,
			tagName: "noHyphen",
			name: "NoHyphen",
			state: [],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [],
		};
		const diagnostics = validate(mir);
		expect(diagnostics.some((d) => d.code === "invalid-tag-name")).toBe(true);
	});

	it("detects duplicate state names", () => {
		const mir = {
			version: 1,
			tagName: "my-comp",
			name: "MyComp",
			state: [
				{ kind: "value", name: "count", initial: 0 },
				{ kind: "value", name: "count", initial: 1 },
			],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [],
		};
		const diagnostics = validate(mir);
		expect(diagnostics.some((d) => d.code === "duplicate-name")).toBe(true);
	});

	it("detects dangling state ref", () => {
		const mir = {
			version: 1,
			tagName: "my-comp",
			name: "MyComp",
			state: [],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [
						{
							kind: "reactive-text",
							source: { kind: "state-read", name: "missing" },
						},
					],
				},
			],
		};
		const diagnostics = validate(mir);
		expect(diagnostics.some((d) => d.code === "dangling-cell-ref")).toBe(true);
	});

	describe("SwitchIR", () => {
		const baseMir = (switchNode) => ({
			version: 1,
			tagName: "my-comp",
			name: "MyComp",
			state: [{ kind: "value", name: "status", initial: "idle" }],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [switchNode],
				},
			],
		});

		it("accepts a valid switch", () => {
			const switchNode = {
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
			};
			const diagnostics = validate(baseMir(switchNode));
			expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
		});

		it("rejects an empty arms list", () => {
			const switchNode = { kind: "switch", arms: [] };
			const diagnostics = validate(baseMir(switchNode));
			expect(diagnostics.some((d) => d.code === "invalid-switch")).toBe(true);
		});

		it("rejects switch.deps that reference undeclared state", () => {
			const switchNode = {
				kind: "switch",
				deps: [{ kind: "cell-ref", name: "missing" }],
				arms: [
					{
						test: { kind: "literal", value: true },
						render: [
							{ kind: "element", tag: "p", attributes: {}, events: [], children: [] },
						],
					},
				],
			};
			const diagnostics = validate(baseMir(switchNode));
			expect(diagnostics.some((d) => d.code === "dangling-cell-ref")).toBe(true);
		});
	});

	describe("reserved IR shapes", () => {
		const wrapInDiv = (node) => ({
			version: 1,
			tagName: "my-comp",
			name: "MyComp",
			state: [],
			actions: [],
			props: [],
			attrs: [],
			emits: [],
			lifecycle: {},
			render: [
				{
					kind: "element",
					tag: "div",
					attributes: {},
					events: [],
					children: [node],
				},
			],
		});

		it("emits raw-html-used warning for RawHtmlIR but does not error", () => {
			const diagnostics = validate(
				wrapInDiv({ kind: "raw-html", source: { kind: "literal", value: "<b>hi</b>" } }),
			);
			expect(diagnostics.some((d) => d.code === "raw-html-used" && d.severity === "warning")).toBe(true);
			expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
		});

		it("rejects sibling children alongside RawHtmlIR", () => {
			const mir = {
				version: 1,
				tagName: "my-comp",
				name: "MyComp",
				state: [],
				actions: [],
				props: [],
				attrs: [],
				emits: [],
				lifecycle: {},
				render: [
					{
						kind: "element",
						tag: "div",
						attributes: {},
						events: [],
						children: [
							{ kind: "raw-html", source: { kind: "literal", value: "<b>hi</b>" } },
							{ kind: "text", value: "trailing" },
						],
					},
				],
			};
			const diagnostics = validate(mir);
			expect(diagnostics.some((d) => d.code === "raw-html-not-sole-child")).toBe(true);
		});

		it("rejects multiple RawHtmlIR children on a single element", () => {
			const mir = {
				version: 1,
				tagName: "my-comp",
				name: "MyComp",
				state: [],
				actions: [],
				props: [],
				attrs: [],
				emits: [],
				lifecycle: {},
				render: [
					{
						kind: "element",
						tag: "div",
						attributes: {},
						events: [],
						children: [
							{ kind: "raw-html", source: { kind: "literal", value: "<b>1</b>" } },
							{ kind: "raw-html", source: { kind: "literal", value: "<b>2</b>" } },
						],
					},
				],
			};
			const diagnostics = validate(mir);
			expect(diagnostics.some((d) => d.code === "duplicate-raw-html")).toBe(true);
		});

		it("rejects TryIR with unsupported-ir-node", () => {
			const diagnostics = validate(wrapInDiv({ kind: "try", render: [] }));
			expect(diagnostics.some((d) => d.code === "unsupported-ir-node")).toBe(true);
		});

		it("rejects DynamicElementIR with unsupported-ir-node", () => {
			const diagnostics = validate(
				wrapInDiv({
					kind: "dynamic-element",
					tag: { kind: "literal", value: "p" },
					attributes: {},
					events: [],
					children: [],
				}),
			);
			expect(diagnostics.some((d) => d.code === "unsupported-ir-node")).toBe(true);
		});

		it("rejects callback / binding ref kinds with unsupported-ir-node", () => {
			const mir = {
				version: 1,
				tagName: "my-comp",
				name: "MyComp",
				state: [],
				actions: [],
				props: [],
				attrs: [],
				emits: [],
				lifecycle: {},
				render: [
					{
						kind: "element",
						tag: "div",
						refs: [
							{ kind: "callback", handler: { kind: "literal", value: null } },
						],
						attributes: {},
						events: [],
						children: [],
					},
				],
			};
			const diagnostics = validate(mir);
			expect(diagnostics.some((d) => d.code === "unsupported-ir-node")).toBe(true);
		});
	});
});
