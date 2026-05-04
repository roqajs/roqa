import { describe, it, expect } from "vitest";
import { parse } from "../src/parse.js";

describe("parse", () => {
	it("parses JSX source code", () => {
		const code = `const x = <div>Hello</div>;`;
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
		expect(ast.program.body.length).toBeGreaterThan(0);
	});

	it("parses TSX source code with TypeScript annotations", () => {
		const code = `
			const x: number = 42;
			const el = <div>{x}</div>;
		`;
		const ast = parse(code, "test.tsx");
		expect(ast.type).toBe("File");
	});

	it("strips TypeScript type assertions", () => {
		const code = `const x = (e.target as HTMLInputElement).value;`;
		const ast = parse(code, "test.tsx");
		expect(ast.type).toBe("File");
	});

	it("handles JSX fragments", () => {
		const code = `const x = <><p>A</p><p>B</p></>;`;
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("identifies .tsx files as TypeScript", () => {
		// Should not throw with TS syntax
		const code = `const fn = (x: string): number => parseInt(x);`;
		expect(() => parse(code, "test.tsx")).not.toThrow();
	});

	it("identifies .jsx files as non-TypeScript", () => {
		// Type annotations should fail in .jsx
		const code = `const fn = (x: string) => x;`;
		expect(() => parse(code, "test.jsx")).toThrow();
	});
});
