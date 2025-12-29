import { describe, it, expect } from "vitest";
import {
	parse,
	isGetCall,
	isForComponent,
	isShowComponent,
	isPascalCase,
	getJSXElementName,
	extractJSXAttributes,
	getJSXChildren,
	isJSXElement,
	isJSXFragment,
	isJSXText,
	isJSXExpressionContainer,
	extractGetCellArg,
	isControlFlowComponent,
} from "../../src/compiler/parser.js";

/**
 * Tests for the Rift compiler parser (Phase 1)
 *
 * The parser is responsible for:
 * - Converting JSX source code into a Babel AST
 * - Providing utility functions for AST inspection (isGetCall, isForComponent, etc.)
 * - Extracting information from JSX elements (attributes, children, names)
 *
 * These utilities are used throughout the compiler pipeline to identify
 * reactive patterns (get() calls) and control flow components (For, Show).
 */

describe("parse", () => {
	it("parses simple JSX", () => {
		const code = "<div>Hello</div>";
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
		expect(ast.program.body.length).toBe(1);
	});

	it("parses JSX with expressions", () => {
		const code = "<button onclick={handleClick}>Count: {get(count)}</button>";
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("parses JSX with attributes", () => {
		const code = '<input type="text" value={name} disabled />';
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("parses nested JSX", () => {
		const code = `
			<div>
				<span>Hello</span>
				<span>World</span>
			</div>
		`;
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("parses JSX fragments", () => {
		const code = "<><div>A</div><div>B</div></>";
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("parses For component", () => {
		const code = "<For each={items}>{(item) => <li>{item}</li>}</For>";
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("parses Show component", () => {
		const code = "<Show when={visible}><div>Content</div></Show>";
		const ast = parse(code, "test.jsx");
		expect(ast.type).toBe("File");
	});

	it("throws on invalid JSX syntax", () => {
		const code = "<div><span></div>";
		expect(() => parse(code, "test.jsx")).toThrow();
	});
});

describe("isGetCall", () => {
	it("identifies get() calls", () => {
		const ast = parse("get(count)", "test.jsx");
		const expr = ast.program.body[0].expression;
		expect(isGetCall(expr)).toBe(true);
	});

	it("rejects non-get calls", () => {
		const ast = parse("set(count, 1)", "test.jsx");
		const expr = ast.program.body[0].expression;
		expect(isGetCall(expr)).toBe(false);
	});

	it("rejects identifiers", () => {
		const ast = parse("get", "test.jsx");
		const expr = ast.program.body[0].expression;
		expect(isGetCall(expr)).toBe(false);
	});

	it("handles null/undefined gracefully", () => {
		// isGetCall returns falsy (null/undefined) for null/undefined inputs
		expect(isGetCall(null)).toBeFalsy();
		expect(isGetCall(undefined)).toBeFalsy();
	});
});

describe("extractGetCellArg", () => {
	it("extracts cell argument from get() call", () => {
		const ast = parse("get(count)", "test.jsx");
		const expr = ast.program.body[0].expression;
		const cellArg = extractGetCellArg(expr);
		expect(cellArg.type).toBe("Identifier");
		expect(cellArg.name).toBe("count");
	});

	it("extracts member expression argument", () => {
		const ast = parse("get(row.label)", "test.jsx");
		const expr = ast.program.body[0].expression;
		const cellArg = extractGetCellArg(expr);
		expect(cellArg.type).toBe("MemberExpression");
	});

	it("returns null for non-get calls", () => {
		const ast = parse("set(count, 1)", "test.jsx");
		const expr = ast.program.body[0].expression;
		expect(extractGetCellArg(expr)).toBeNull();
	});
});

describe("isPascalCase", () => {
	it("identifies PascalCase names", () => {
		expect(isPascalCase("MyComponent")).toBe(true);
		expect(isPascalCase("For")).toBe(true);
		expect(isPascalCase("Show")).toBe(true);
		expect(isPascalCase("A")).toBe(true);
	});

	it("rejects non-PascalCase names", () => {
		expect(isPascalCase("div")).toBe(false);
		expect(isPascalCase("myComponent")).toBe(false);
		expect(isPascalCase("my-component")).toBe(false);
		expect(isPascalCase("123")).toBe(false);
	});
});

describe("isForComponent / isShowComponent / isControlFlowComponent", () => {
	it("identifies For component", () => {
		const ast = parse("<For each={items}>{(item) => <li>{item}</li>}</For>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(isForComponent(jsxElement)).toBe(true);
		expect(isShowComponent(jsxElement)).toBe(false);
		expect(isControlFlowComponent(jsxElement)).toBe(true);
	});

	it("identifies Show component", () => {
		const ast = parse("<Show when={visible}><div>Content</div></Show>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(isForComponent(jsxElement)).toBe(false);
		expect(isShowComponent(jsxElement)).toBe(true);
		expect(isControlFlowComponent(jsxElement)).toBe(true);
	});

	it("rejects regular elements", () => {
		const ast = parse("<div>Content</div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(isForComponent(jsxElement)).toBe(false);
		expect(isShowComponent(jsxElement)).toBe(false);
		expect(isControlFlowComponent(jsxElement)).toBe(false);
	});
});

describe("getJSXElementName", () => {
	it("gets simple element names", () => {
		const ast = parse("<div></div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(getJSXElementName(jsxElement)).toBe("div");
	});

	it("gets custom element names with hyphens", () => {
		const ast = parse("<my-component></my-component>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(getJSXElementName(jsxElement)).toBe("my-component");
	});

	it("gets PascalCase component names", () => {
		const ast = parse("<MyComponent></MyComponent>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(getJSXElementName(jsxElement)).toBe("MyComponent");
	});

	it("gets member expression names (Foo.Bar)", () => {
		const ast = parse("<Foo.Bar></Foo.Bar>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		expect(getJSXElementName(jsxElement)).toBe("Foo.Bar");
	});
});

describe("extractJSXAttributes", () => {
	it("extracts string attributes", () => {
		const ast = parse('<input type="text" />', "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const attrs = extractJSXAttributes(jsxElement.openingElement);
		expect(attrs.get("type").value).toBe("text");
	});

	it("extracts expression attributes", () => {
		const ast = parse("<input value={name} />", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const attrs = extractJSXAttributes(jsxElement.openingElement);
		expect(attrs.get("value").type).toBe("JSXExpressionContainer");
	});

	it("extracts boolean attributes", () => {
		const ast = parse("<input disabled />", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const attrs = extractJSXAttributes(jsxElement.openingElement);
		expect(attrs.get("disabled")).toBeNull();
	});

	it("extracts spread attributes", () => {
		const ast = parse("<input {...props} />", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const attrs = extractJSXAttributes(jsxElement.openingElement);
		expect(attrs.has("...")).toBe(true);
	});
});

describe("getJSXChildren", () => {
	it("gets element children", () => {
		const ast = parse("<div><span></span></div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const children = getJSXChildren(jsxElement);
		expect(children.length).toBe(1);
		expect(children[0].type).toBe("JSXElement");
	});

	it("filters whitespace-only text nodes", () => {
		const ast = parse("<div>  \n  </div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const children = getJSXChildren(jsxElement);
		expect(children.length).toBe(0);
	});

	it("keeps non-whitespace text", () => {
		const ast = parse("<div>Hello</div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const children = getJSXChildren(jsxElement);
		expect(children.length).toBe(1);
		expect(children[0].type).toBe("JSXText");
	});

	it("gets expression children", () => {
		const ast = parse("<div>{count}</div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const children = getJSXChildren(jsxElement);
		expect(children.length).toBe(1);
		expect(children[0].type).toBe("JSXExpressionContainer");
	});
});

describe("isJSXElement / isJSXFragment / isJSXText / isJSXExpressionContainer", () => {
	it("identifies JSX elements", () => {
		const ast = parse("<div></div>", "test.jsx");
		const expr = ast.program.body[0].expression;
		expect(isJSXElement(expr)).toBe(true);
		expect(isJSXFragment(expr)).toBe(false);
	});

	it("identifies JSX fragments", () => {
		const ast = parse("<><div></div></>", "test.jsx");
		const expr = ast.program.body[0].expression;
		expect(isJSXElement(expr)).toBe(false);
		expect(isJSXFragment(expr)).toBe(true);
	});

	it("identifies JSX text", () => {
		const ast = parse("<div>Hello</div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const textChild = jsxElement.children[0];
		expect(isJSXText(textChild)).toBe(true);
	});

	it("identifies JSX expression containers", () => {
		const ast = parse("<div>{count}</div>", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const exprChild = jsxElement.children[0];
		expect(isJSXExpressionContainer(exprChild)).toBe(true);
	});
});
