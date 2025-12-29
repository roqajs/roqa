import { describe, it, expect } from "vitest";
import { parse } from "../../src/compiler/parser.js";
import { findGetCalls, processBindings } from "../../src/compiler/transforms/bind-detector.js";

/**
 * Tests for the reactive binding detection phase
 *
 * The bind-detector finds get() calls in JSX expressions and generates the
 * corresponding bind() subscriptions. This enables Rift's fine-grained reactivity:
 *
 *   <p class={get(isActive) ? 'active' : ''}>{get(count)}</p>
 *   ->
 *   bind(isActive, (v) => { p_1.className = v ? 'active' : ''; });
 *   bind(count, (v) => { p_1_text.nodeValue = v; });
 *
 * Key responsibilities:
 * - Finding all get() calls within expressions
 * - Determining if get() is the only expression (direct assignment) or part of
 *   a larger expression (requires re-evaluating the full expression)
 * - Generating appropriate binding code for attributes vs text content
 */

describe("findGetCalls", () => {
	function getExpression(code) {
		const ast = parse(code, "test.jsx");
		return ast.program.body[0].expression;
	}

	it("finds simple get() call", () => {
		const expr = getExpression("get(count)");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(1);
		expect(getCalls[0].isOnlyExpression).toBe(true);
		expect(getCalls[0].cellArg.name).toBe("count");
	});

	it("finds get() in binary expression", () => {
		const expr = getExpression("get(count) + 1");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(1);
		expect(getCalls[0].isOnlyExpression).toBe(false);
	});

	it("finds get() in ternary expression", () => {
		const expr = getExpression('get(active) ? "yes" : "no"');
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(1);
		expect(getCalls[0].isOnlyExpression).toBe(false);
	});

	it("finds multiple get() calls", () => {
		const expr = getExpression("get(a) + get(b)");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(2);
	});

	it("finds get() with member expression argument", () => {
		const expr = getExpression("get(row.label)");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(1);
		expect(getCalls[0].cellArg.type).toBe("MemberExpression");
	});

	it("returns empty array when no get() calls", () => {
		const expr = getExpression("count + 1");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(0);
	});

	it("finds get() in template literal", () => {
		const expr = getExpression("`Hello ${get(name)}!`");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(1);
	});

	it("finds get() in function call argument", () => {
		const expr = getExpression("format(get(date))");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(1);
	});

	it("finds get() in logical expression", () => {
		const expr = getExpression("get(loading) || get(error)");
		const getCalls = findGetCalls(expr);

		expect(getCalls.length).toBe(2);
	});
});

describe("processBindings", () => {
	const mockCode = `
		const count = cell(0);
		const name = cell("World");
		<div class={get(active) ? "active" : ""}>
			<p>{get(count)}</p>
			<span>Hello {get(name)}!</span>
		</div>
	`;

	it("processes text binding with simple get()", () => {
		const bindings = [
			{
				type: "text",
				varName: "p_1",
				textVarName: "p_1_text",
				expression: {
					type: "CallExpression",
					callee: { type: "Identifier", name: "get" },
					arguments: [{ type: "Identifier", name: "count", start: 10, end: 15 }],
					start: 5,
					end: 16,
				},
				path: [],
			},
		];

		const processed = processBindings(bindings, mockCode);

		expect(processed.length).toBe(1);
		expect(processed[0].targetVar).toBe("p_1_text");
		expect(processed[0].targetProperty).toBe("nodeValue");
		// Simple get() with isOnlyExpression=true sets needsTransform=false
		expect(processed[0].needsTransform).toBe(false);
		expect(processed[0].isStatic).toBe(false);
	});

	it("processes attribute binding", () => {
		const bindings = [
			{
				type: "attribute",
				varName: "div_1",
				attrName: "className",
				expression: {
					type: "ConditionalExpression",
					test: {
						type: "CallExpression",
						callee: { type: "Identifier", name: "get" },
						arguments: [{ type: "Identifier", name: "active", start: 10, end: 16 }],
						start: 5,
						end: 17,
					},
					start: 5,
					end: 40,
				},
				path: [],
			},
		];

		const processed = processBindings(bindings, mockCode);

		expect(processed.length).toBe(1);
		expect(processed[0].targetVar).toBe("div_1");
		expect(processed[0].targetProperty).toBe("className");
		// Complex expression with get() inside sets needsTransform=true
		expect(processed[0].needsTransform).toBe(true);
	});

	it("identifies static bindings (no get() calls)", () => {
		const bindings = [
			{
				type: "attribute",
				varName: "div_1",
				attrName: "id",
				expression: { type: "StringLiteral", value: "container", start: 0, end: 10 },
				path: [],
			},
		];

		const processed = processBindings(bindings, mockCode);

		expect(processed.length).toBe(1);
		expect(processed[0].isStatic).toBe(true);
	});

	it("processes prop bindings for Rift components", () => {
		const bindings = [
			{
				type: "prop",
				varName: "my_component_1",
				propName: "value",
				expression: {
					type: "CallExpression",
					callee: { type: "Identifier", name: "get" },
					arguments: [{ type: "Identifier", name: "count", start: 10, end: 15 }],
					start: 5,
					end: 16,
				},
				path: [],
			},
		];

		const processed = processBindings(bindings, mockCode);

		expect(processed.length).toBe(1);
		expect(processed[0].type).toBe("prop");
		expect(processed[0].propName).toBe("value");
	});

	it("processes contentParts format for mixed text", () => {
		const bindings = [
			{
				type: "text",
				varName: "span_1",
				textVarName: "span_1_text",
				contentParts: [
					{ type: "static", value: "Hello " },
					{
						type: "dynamic",
						expression: {
							type: "CallExpression",
							callee: { type: "Identifier", name: "get" },
							arguments: [{ type: "Identifier", name: "name", start: 100, end: 104 }],
							start: 95,
							end: 105,
						},
					},
					{ type: "static", value: "!" },
				],
				path: [],
			},
		];

		const processed = processBindings(bindings, mockCode);

		expect(processed.length).toBe(1);
		expect(processed[0].contentParts).toBeDefined();
		expect(processed[0].contentParts.length).toBe(3);
	});

	it("handles multiple get() calls in one expression", () => {
		const bindings = [
			{
				type: "text",
				varName: "span_1",
				textVarName: "span_1_text",
				contentParts: [
					{
						type: "dynamic",
						expression: {
							type: "CallExpression",
							callee: { type: "Identifier", name: "get" },
							arguments: [{ type: "Identifier", name: "a", start: 10, end: 11 }],
							start: 5,
							end: 12,
						},
					},
					{ type: "static", value: " + " },
					{
						type: "dynamic",
						expression: {
							type: "CallExpression",
							callee: { type: "Identifier", name: "get" },
							arguments: [{ type: "Identifier", name: "b", start: 20, end: 21 }],
							start: 15,
							end: 22,
						},
					},
				],
				path: [],
			},
		];

		const processed = processBindings(bindings, mockCode);

		// Should create bindings for each unique cell
		expect(processed.length).toBe(2);
	});

	it("deduplicates bindings for same cell", () => {
		// Use a simple code string where we know the exact positions
		const testCode = "get(count) vs get(count)";
		// "count" appears at positions 4-9 and 18-23
		const bindings = [
			{
				type: "text",
				varName: "span_1",
				textVarName: "span_1_text",
				contentParts: [
					{
						type: "dynamic",
						expression: {
							type: "CallExpression",
							callee: { type: "Identifier", name: "get" },
							arguments: [{ type: "Identifier", name: "count", start: 4, end: 9 }],
							start: 0,
							end: 10,
						},
					},
					{ type: "static", value: " vs " },
					{
						type: "dynamic",
						expression: {
							type: "CallExpression",
							callee: { type: "Identifier", name: "get" },
							arguments: [{ type: "Identifier", name: "count", start: 18, end: 23 }],
							start: 14,
							end: 24,
						},
					},
				],
				path: [],
			},
		];

		const processed = processBindings(bindings, testCode);

		// Same cell referenced twice should only create one binding
		expect(processed.length).toBe(1);
	});

	it("passes through SVG flag", () => {
		const bindings = [
			{
				type: "attribute",
				varName: "circle_1",
				attrName: "r",
				expression: {
					type: "CallExpression",
					callee: { type: "Identifier", name: "get" },
					arguments: [{ type: "Identifier", name: "radius", start: 10, end: 16 }],
					start: 5,
					end: 17,
				},
				path: [],
				isSvg: true,
			},
		];

		const processed = processBindings(bindings, mockCode);

		expect(processed[0].isSvg).toBe(true);
	});
});
