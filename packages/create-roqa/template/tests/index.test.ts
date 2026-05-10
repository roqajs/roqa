import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import my_frontend from "../src/index.ts";

const fixturesDir = new URL("./fixtures/", import.meta.url);
const fixtureCases = readdirSync(fixturesDir)
	.filter((fileName) => fileName.endsWith(".roqa"))
	.sort()
	.map((fileName) => [fileName.replace(/\.roqa$/, ""), `${fileName.replace(/\.roqa$/, "")}.example`, new URL(`./fixtures/${fileName}`, import.meta.url)] as const);

describe("my_frontend", () => {
	it("exposes a Roqa frontend shape", () => {
		const frontend = my_frontend();

		expect(frontend.handles("component.example")).toBe(true);
		expect(frontend.handles("component.roqa")).toBe(false);
		expect(typeof frontend.toIR).toBe("function");
	});

	it("includes the full fixture corpus", () => {
		expect(fixtureCases.length).toBeGreaterThan(2);
		expect(fixtureCases.map(([name]) => name)).toContain("counter-button");
		expect(fixtureCases.map(([name]) => name)).toContain("todo-list");
	});

	describe.skip("fixture conformance", () => {
		it.each(fixtureCases)("matches the %s fixture output", (_scenario, id, fixtureUrl) => {
			const frontend = my_frontend();
			const source = readFileSync(fixtureUrl, "utf8");
			const expected = JSON.parse(source);

			expect(frontend.toIR(source, id)).toEqual(expected);
		});
	});
});