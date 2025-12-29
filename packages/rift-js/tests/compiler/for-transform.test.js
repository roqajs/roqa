import { describe, it, expect } from "vitest";
import { parse } from "../../src/compiler/parser.js";
import {
	extractForInfo,
	getCallbackPreamble,
} from "../../src/compiler/transforms/for-transform.js";

/**
 * Tests for the For component transformation
 *
 * The for-transform handles the <For each={items}> control flow component,
 * converting it to for_block() runtime calls. Key responsibilities:
 * - Extracting the each expression (the cell/array to iterate)
 * - Parsing the callback parameters (item, index)
 * - Generating the callback preamble for indexed access
 *
 * Example transformation:
 *   <For each={items}>{(item, i) => <li>{item}</li>}</For>
 *   ->
 *   for_block(container, items, (anchor, item, i) => { ... })
 */

describe("extractForInfo", () => {
	function getForElement(jsxCode) {
		const ast = parse(jsxCode, "test.jsx");
		return ast.program.body[0].expression;
	}

	it("extracts basic For component info", () => {
		const forElement = getForElement("<For each={items}>{(item) => <li>{item}</li>}</For>");
		const result = extractForInfo(forElement, "container");

		expect(result.containerVar).toBe("container");
		expect(result.itemParam).toBe("item");
		expect(result.indexParam).toBeNull();
		expect(result.bodyJSX.type).toBe("JSXElement");
	});

	it("extracts For component with index parameter", () => {
		const forElement = getForElement(
			"<For each={items}>{(item, index) => <li>{index}: {item}</li>}</For>",
		);
		const result = extractForInfo(forElement, "container");

		expect(result.itemParam).toBe("item");
		expect(result.indexParam).toBe("index");
	});

	it("extracts items expression", () => {
		const forElement = getForElement("<For each={todos}>{(todo) => <li>{todo.text}</li>}</For>");
		const result = extractForInfo(forElement, "container");

		expect(result.itemsExpression.type).toBe("Identifier");
		expect(result.itemsExpression.name).toBe("todos");
	});

	it("handles member expression in each prop", () => {
		const forElement = getForElement("<For each={data.items}>{(item) => <li>{item}</li>}</For>");
		const result = extractForInfo(forElement, "container");

		expect(result.itemsExpression.type).toBe("MemberExpression");
	});

	it("handles function call in each prop", () => {
		const forElement = getForElement("<For each={get(items)}>{(item) => <li>{item}</li>}</For>");
		const result = extractForInfo(forElement, "container");

		expect(result.itemsExpression.type).toBe("CallExpression");
	});

	it("preserves original callback reference", () => {
		const forElement = getForElement("<For each={items}>{(item) => <li>{item}</li>}</For>");
		const result = extractForInfo(forElement, "container");

		expect(result.originalCallback).toBeDefined();
		expect(result.originalCallback.type).toBe("ArrowFunctionExpression");
	});

	it("throws on missing each prop", () => {
		const forElement = getForElement("<For>{(item) => <li>{item}</li>}</For>");

		expect(() => extractForInfo(forElement, "container")).toThrow(/Missing required 'each' prop/);
	});

	it("throws on missing callback child", () => {
		const forElement = getForElement("<For each={items}></For>");

		expect(() => extractForInfo(forElement, "container")).toThrow(/must have exactly one child/);
	});

	it("throws on non-function callback", () => {
		const forElement = getForElement("<For each={items}>{items}</For>");

		expect(() => extractForInfo(forElement, "container")).toThrow(/must be an arrow function/);
	});

	it("throws on callback with no parameters", () => {
		const forElement = getForElement("<For each={items}>{() => <li>Item</li>}</For>");

		expect(() => extractForInfo(forElement, "container")).toThrow(
			/must have at least one parameter/,
		);
	});

	it("handles block body callback", () => {
		const forElement = getForElement(`
			<For each={items}>
				{(item) => {
					return <li>{item}</li>;
				}}
			</For>
		`);
		const result = extractForInfo(forElement, "container");

		expect(result.bodyJSX.type).toBe("JSXElement");
	});

	it("handles parenthesized JSX return", () => {
		const forElement = getForElement(`
			<For each={items}>
				{(item) => {
					return (<li>{item}</li>);
				}}
			</For>
		`);
		const result = extractForInfo(forElement, "container");

		expect(result.bodyJSX.type).toBe("JSXElement");
	});
});

describe("getCallbackPreamble", () => {
	function getCallback(jsxCode) {
		const ast = parse(jsxCode, "test.jsx");
		const forElement = ast.program.body[0].expression;
		const children = forElement.children.filter((c) => c.type === "JSXExpressionContainer");
		return children[0].expression;
	}

	it("returns empty array for expression body callback", () => {
		const callback = getCallback("<For each={items}>{(item) => <li>{item}</li>}</For>");
		const preamble = getCallbackPreamble(callback);

		expect(preamble).toEqual([]);
	});

	it("returns statements before return in block body", () => {
		const callback = getCallback(`
			<For each={items}>
				{(item) => {
					const text = item.name;
					return <li>{text}</li>;
				}}
			</For>
		`);
		const preamble = getCallbackPreamble(callback);

		expect(preamble.length).toBe(1);
		expect(preamble[0].type).toBe("VariableDeclaration");
	});

	it("returns multiple preamble statements", () => {
		const callback = getCallback(`
			<For each={items}>
				{(item) => {
					const text = item.name;
					const isActive = item.active;
					return <li>{text}</li>;
				}}
			</For>
		`);
		const preamble = getCallbackPreamble(callback);

		expect(preamble.length).toBe(2);
	});

	it("stops at return statement", () => {
		const callback = getCallback(`
			<For each={items}>
				{(item) => {
					const text = item.name;
					return <li>{text}</li>;
				}}
			</For>
		`);
		const preamble = getCallbackPreamble(callback);

		// Should not include the return statement
		expect(preamble.every((s) => s.type !== "ReturnStatement")).toBe(true);
	});
});
