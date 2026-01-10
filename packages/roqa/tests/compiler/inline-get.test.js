import { describe, it, expect } from "vitest";
import { inlineGetCalls } from "../../src/compiler/transforms/inline-get.js";

/**
 * Tests for the inline-get optimization phase (Phase 4)
 *
 * This is the final optimization pass that eliminates runtime overhead by inlining
 * Roqa's reactive primitives directly into the generated code:
 *
 *   get(cell)       -> cell.v
 *   cell(value)     -> cell object with value and effects array
 *   put(cell, v)    -> cell.v = v
 *   set(cell, v)    -> cell.v = v + inlined DOM updates
 *   bind(cell, fn)  -> cell.ref_N = element (callbacks inlined at set sites)
 *
 * This optimization is critical for Roqa's zero-overhead reactive model.
 */

describe("inlineGetCalls", () => {
	describe("get() inlining", () => {
		it("transforms get(cell) to cell.v", () => {
			const code = "const x = get(count);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const x = count.v;");
		});

		it("transforms multiple get() calls", () => {
			const code = "const sum = get(a) + get(b);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const sum = a.v + b.v;");
		});

		it("transforms get() with member expression", () => {
			const code = "const label = get(row.label);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const label = row.label.v;");
		});

		it("transforms get() in ternary expression", () => {
			const code = 'const cls = get(active) ? "on" : "off";';
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe('const cls = active.v ? "on" : "off";');
		});
	});

	describe("cell() inlining", () => {
		it("transforms cell(value) to object literal", () => {
			const code = "const count = cell(0);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const count = { v: 0, e: [] };");
		});

		it("transforms cell with string value", () => {
			const code = 'const name = cell("World");';
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe('const name = { v: "World", e: [] };');
		});

		it("transforms cell with array value", () => {
			const code = "const items = cell([]);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const items = { v: [], e: [] };");
		});

		it("transforms cell with object value", () => {
			const code = "const state = cell({ count: 0 });";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const state = { v: { count: 0 }, e: [] };");
		});

		it("transforms cell with null value", () => {
			const code = "const value = cell(null);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const value = { v: null, e: [] };");
		});

		it("transforms cell with undefined (no argument)", () => {
			const code = "const value = cell();";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const value = { v: undefined, e: [] };");
		});
	});

	describe("put() inlining", () => {
		it("transforms put(cell, value) to assignment", () => {
			const code = "put(count, 10);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("(count.v = 10);");
		});

		it("transforms put() with expression value", () => {
			const code = "put(count, count.v + 1);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("(count.v = count.v + 1);");
		});
	});

	describe("set() inlining", () => {
		it("transforms set() without effect loop when no bind() calls", () => {
			const code = "set(count, 10);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toContain("count.v = 10");
			// No effect loop since there are no bind() calls
			expect(result.code).not.toContain("count.e.length");
			expect(result.code).not.toContain("count.e[i]");
		});

		it("transforms set() with expression value", () => {
			const code = "set(count, count.v + 1);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toContain("count.v = count.v + 1");
		});

		it("transforms set() with ref updates when refs exist", () => {
			const code = `count.ref_1 = el;
set(count, 42);`;
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toContain("count.v = 42");
			// Should have ref update - the exact format depends on implementation
			expect(result.code).toContain("count.ref_1");
		});

		it("handles multiple refs on same cell", () => {
			const code = `count.ref_1 = el1;
count.ref_2 = el2;
set(count, 99);`;
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toContain("count.v = 99");
			// Both refs should be present in output
			expect(result.code).toContain("count.ref_1");
			expect(result.code).toContain("count.ref_2");
		});
	});

	describe("derived cells", () => {
		it("handles derived cell (cell with function)", () => {
			const code = `
const count = cell(0);
const doubled = cell(() => get(count) * 2);
const x = get(doubled);
`;
			const result = inlineGetCalls(code, "test.js");
			// Derived cell should be expanded
			expect(result.code).toContain("count.v * 2");
		});

		it("handles chained derived cells", () => {
			const code = `
const count = cell(0);
const doubled = cell(() => get(count) * 2);
const quadrupled = cell(() => get(doubled) * 2);
const x = get(quadrupled);
`;
			const result = inlineGetCalls(code, "test.js");
			// Should recursively expand
			expect(result.code).toContain("count.v");
		});
	});

	describe("import cleanup", () => {
		it("removes inlined imports from roqa", () => {
			const code = `import { cell, get, set } from "roqa";
const count = cell(0);
const x = get(count);
set(count, 1);`;
			const result = inlineGetCalls(code, "test.js");
			// Imports should be cleaned up (cell, get, set removed)
			expect(result.code).not.toMatch(/import.*\bcell\b.*from "roqa"/);
			expect(result.code).not.toMatch(/import.*\bget\b.*from "roqa"/);
			expect(result.code).not.toMatch(/import.*\bset\b.*from "roqa"/);
		});

		it("preserves non-inlined imports", () => {
			const code = `import { cell, get, defineComponent, template } from "roqa";
const count = cell(0);
const x = get(count);`;
			const result = inlineGetCalls(code, "test.js");
			// defineComponent and template should remain
			expect(result.code).toContain("defineComponent");
			expect(result.code).toContain("template");
		});

		it("removes put import when inlined", () => {
			const code = `import { cell, put } from "roqa";
const count = cell(0);
put(count, 5);`;
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).not.toMatch(/import.*\bput\b.*from "roqa"/);
			expect(result.code).toContain("count.v = 5");
		});

		it("handles empty import after all inlined", () => {
			const code = `import { cell, get } from "roqa";
const x = cell(0);
const y = get(x);`;
			const result = inlineGetCalls(code, "test.js");
			// The inlined code should work correctly
			expect(result.code).toContain("{ v: 0, e: [] }");
			expect(result.code).toContain("x.v");
		});
	});

	describe("source map generation", () => {
		it("generates source map", () => {
			const code = "const x = get(count);";
			const result = inlineGetCalls(code, "test.js");
			expect(result.map).toBeDefined();
			expect(result.map.sources).toContain("test.js");
		});
	});

	describe("complex expressions", () => {
		it("handles get() in arrow function", () => {
			const code = "const fn = () => get(count) + 1;";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const fn = () => count.v + 1;");
		});

		it("handles get() in template literal", () => {
			const code = "const msg = `Count: ${get(count)}`;";
			const result = inlineGetCalls(code, "test.js");
			expect(result.code).toBe("const msg = `Count: ${count.v}`;");
		});

		it("handles nested get() calls", () => {
			// Nested get() calls are a rare edge case
			// The outer get() is transformed, but the inner get() is not because
			// after transformation, the argument to the outer get() contains "get(...)"
			// which is then passed through as-is
			const code = "const x = get(get(cellRef));";
			const result = inlineGetCalls(code, "test.js");
			// The outer get is transformed, but inner get remains as the argument
			expect(result.code).toBe("const x = get(cellRef).v;");
		});
	});
});
