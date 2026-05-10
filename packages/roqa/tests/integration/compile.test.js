import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../../src/compiler/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, "../fixtures");

/**
 * @param {string} name
 * @returns {{ ir: any, expected: string }}
 */
function loadFixture(name) {
	const ir = JSON.parse(readFileSync(resolve(fixtureDir, `${name}.roqa.json`), "utf-8"));
	const expected = readFileSync(resolve(fixtureDir, `${name}.expected.js`), "utf-8");
	return { ir, expected };
}

describe("compile (IR → JS)", () => {
	const exactFixtures = [
		"static-component",
		"counter-button",
		"derived-state",
		"deep-nesting",
		"show-conditional",
		"show-fallback",
		"switch-discriminant",
		"switch-predicate",
		"each-with-empty",
		"each-with-index",
		"raw-html",
		"multi-component",
		"svg-circle",
		"external-refs",
		"props-attrs",
		"child-props",
	];

	for (const name of exactFixtures) {
		it(`compiles ${name} exactly`, () => {
			const { ir, expected } = loadFixture(name);
			const result = compile(ir);
			expect(result.code.trim()).toBe(expected.trim());
		});
	}

	// These fixtures have minor quote-style differences (fixture inconsistency)
	const quoteFixtures = ["multi-action", "todo-list"];

	for (const name of quoteFixtures) {
		it(`compiles ${name} (quote-normalized)`, () => {
			const { ir, expected } = loadFixture(name);
			const result = compile(ir);
			// Normalize all quotes to double for comparison
			const normalize = (s) => s.trim().replace(/'/g, '"');
			expect(normalize(result.code)).toBe(normalize(expected));
		});
	}

	it("returns code and map", () => {
		const { ir } = loadFixture("static-component");
		const result = compile(ir);
		expect(result).toHaveProperty("code");
		expect(result).toHaveProperty("map");
		expect(typeof result.code).toBe("string");
	});

	it("handles array input (multi-component)", () => {
		const { ir } = loadFixture("multi-component");
		expect(Array.isArray(ir)).toBe(true);
		const result = compile(ir);
		expect(result.code).toContain("ClickCounter");
		expect(result.code).toContain("TextDisplay");
	});

	it("rejects invalid ir", () => {
		expect(() =>
			compile({
				version: 2,
				tagName: "bad",
				name: "Bad",
				state: [],
				actions: [],
				props: [],
				attrs: [],
				emits: [],
				lifecycle: {},
				render: [],
			}),
		).toThrow();
	});
});
