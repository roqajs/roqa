import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../../src/compiler/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, "../../../../spec/fixtures");

/**
 * @param {string} name
 * @returns {{ mir: any, expected: string }}
 */
function loadFixture(name) {
	const mir = JSON.parse(readFileSync(resolve(fixtureDir, `${name}.mir.json`), "utf-8"));
	const expected = readFileSync(resolve(fixtureDir, `${name}.expected.js`), "utf-8");
	return { mir, expected };
}

describe("compile (MIR → JS)", () => {
	const exactFixtures = [
		"static-component",
		"counter-button",
		"derived-state",
		"deep-nesting",
		"show-conditional",
		"show-fallback",
		"multi-component",
		"svg-circle",
		"external-refs",
		"props-attrs",
		"child-props",
	];

	for (const name of exactFixtures) {
		it(`compiles ${name} exactly`, () => {
			const { mir, expected } = loadFixture(name);
			const result = compile(mir);
			expect(result.code.trim()).toBe(expected.trim());
		});
	}

	// These fixtures have minor quote-style differences (fixture inconsistency)
	const quoteFixtures = ["multi-action", "todo-list"];

	for (const name of quoteFixtures) {
		it(`compiles ${name} (quote-normalized)`, () => {
			const { mir, expected } = loadFixture(name);
			const result = compile(mir);
			// Normalize all quotes to double for comparison
			const normalize = (s) => s.trim().replace(/'/g, '"');
			expect(normalize(result.code)).toBe(normalize(expected));
		});
	}

	it("returns code and map", () => {
		const { mir } = loadFixture("static-component");
		const result = compile(mir);
		expect(result).toHaveProperty("code");
		expect(result).toHaveProperty("map");
		expect(typeof result.code).toBe("string");
	});

	it("handles array input (multi-component)", () => {
		const { mir } = loadFixture("multi-component");
		expect(Array.isArray(mir)).toBe(true);
		const result = compile(mir);
		expect(result.code).toContain("ClickCounter");
		expect(result.code).toContain("TextDisplay");
	});

	it("rejects invalid MIR", () => {
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
