import { describe, it, expect } from "vitest";
import { parse } from "../../src/compiler/parser.js";
import { extractShowInfo } from "../../src/compiler/transforms/show-transform.js";

/**
 * Tests for the Show component transformation
 *
 * The show-transform handles the <Show when={condition}> control flow component,
 * converting it to showBlock() runtime calls. Key responsibilities:
 * - Extracting the when condition expression
 * - Parsing the body JSX to render when condition is true
 *
 * Example transformation:
 *   <Show when={get(visible)}><p>Hello</p></Show>
 *   ->
 *   showBlock(container, visible, (anchor) => { ... })
 */

describe("extractShowInfo", () => {
	function getShowElement(jsxCode) {
		const ast = parse(jsxCode, "test.jsx");
		return ast.program.body[0].expression;
	}

	it("extracts basic Show component info", () => {
		const showElement = getShowElement("<Show when={visible}><div>Content</div></Show>");
		const result = extractShowInfo(showElement, "container");

		expect(result.containerVar).toBe("container");
		expect(result.conditionExpression.type).toBe("Identifier");
		expect(result.conditionExpression.name).toBe("visible");
		expect(result.bodyJSX.type).toBe("JSXElement");
	});

	it("handles cell condition with get()", () => {
		const showElement = getShowElement("<Show when={get(isVisible)}><div>Content</div></Show>");
		const result = extractShowInfo(showElement, "container");

		expect(result.conditionExpression.type).toBe("CallExpression");
	});

	it("handles complex boolean expression", () => {
		const showElement = getShowElement("<Show when={get(count) > 0}><div>Content</div></Show>");
		const result = extractShowInfo(showElement, "container");

		expect(result.conditionExpression.type).toBe("BinaryExpression");
	});

	it("handles negated condition", () => {
		const showElement = getShowElement("<Show when={!get(hidden)}><div>Content</div></Show>");
		const result = extractShowInfo(showElement, "container");

		expect(result.conditionExpression.type).toBe("UnaryExpression");
		expect(result.conditionExpression.operator).toBe("!");
	});

	it("extracts nested JSX body", () => {
		const showElement = getShowElement(
			"<Show when={visible}><div><span>Nested</span></div></Show>",
		);
		const result = extractShowInfo(showElement, "container");

		expect(result.bodyJSX.type).toBe("JSXElement");
		// The body should have children
		expect(result.bodyJSX.children.length).toBeGreaterThan(0);
	});

	it("throws on missing when prop", () => {
		const showElement = getShowElement("<Show><div>Content</div></Show>");

		expect(() => extractShowInfo(showElement, "container")).toThrow(/Missing required 'when' prop/);
	});

	it("throws on empty Show component", () => {
		const showElement = getShowElement("<Show when={visible}></Show>");

		expect(() => extractShowInfo(showElement, "container")).toThrow(/must have at least one child/);
	});

	it("throws on non-JSX child", () => {
		const showElement = getShowElement("<Show when={visible}>{text}</Show>");

		expect(() => extractShowInfo(showElement, "container")).toThrow(
			/must have a JSX element as child/,
		);
	});

	it("handles whitespace-only text nodes gracefully", () => {
		const showElement = getShowElement(`<Show when={visible}>
			<div>Content</div>
		</Show>`);
		const result = extractShowInfo(showElement, "container");

		expect(result.bodyJSX.type).toBe("JSXElement");
	});

	it("handles expression container with JSX", () => {
		const showElement = getShowElement("<Show when={visible}>{<div>Content</div>}</Show>");
		const result = extractShowInfo(showElement, "container");

		expect(result.bodyJSX.type).toBe("JSXElement");
	});
});
