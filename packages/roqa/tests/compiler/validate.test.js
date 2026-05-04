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
});
