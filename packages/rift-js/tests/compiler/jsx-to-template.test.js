import { describe, it, expect } from "vitest";
import { parse } from "../../src/compiler/parser.js";
import {
	TemplateRegistry,
	VariableNameGenerator,
	extractTemplate,
	isSvgElement,
} from "../../src/compiler/transforms/jsx-to-template.js";

/**
 * Tests for the JSX to template transformation
 *
 * This is the core transformation that converts JSX into cloneable DOM templates
 * and traversal code. Key responsibilities:
 *
 * - Extracting static HTML into template() declarations
 * - Generating DOM traversal code (firstChild, nextSibling paths)
 * - Creating placeholder text nodes for dynamic content
 * - Deduplicating identical templates via TemplateRegistry
 * - Handling SVG elements with svgTemplate()
 *
 * Example:
 *   <div><span>{get(name)}</span></div>
 *   ->
 *   template('<div><span> </span></div>')  // space = text node placeholder
 *   + traversal: div_1.firstChild -> span_1, span_1.firstChild -> text node
 */

describe("TemplateRegistry", () => {
	it("registers templates and returns unique IDs", () => {
		const registry = new TemplateRegistry();
		const result1 = registry.register("<div>Hello</div>");
		const result2 = registry.register("<span>World</span>");

		expect(result1.id).toBe(1);
		expect(result2.id).toBe(2);
		expect(result1.varName).toBe("$tmpl_1");
		expect(result2.varName).toBe("$tmpl_2");
		expect(result1.isNew).toBe(true);
		expect(result2.isNew).toBe(true);
	});

	it("deduplicates identical templates", () => {
		const registry = new TemplateRegistry();
		const result1 = registry.register("<div>Hello</div>");
		const result2 = registry.register("<div>Hello</div>");

		expect(result1.id).toBe(result2.id);
		expect(result1.varName).toBe(result2.varName);
		expect(result1.isNew).toBe(true);
		expect(result2.isNew).toBe(false);
	});

	it("generates template declarations", () => {
		const registry = new TemplateRegistry();
		registry.register("<div>Hello</div>");
		registry.register("<span>World</span>");

		const declarations = registry.getDeclarations();
		expect(declarations.length).toBe(2);
		expect(declarations[0]).toContain("template('<div>Hello</div>')");
		expect(declarations[1]).toContain("template('<span>World</span>')");
	});

	it("handles SVG templates separately", () => {
		const registry = new TemplateRegistry();
		registry.register('<circle cx="50" cy="50" r="40" />', true);

		const declarations = registry.getDeclarations();
		expect(declarations[0]).toContain("svgTemplate");
		expect(registry.hasSvgTemplates()).toBe(true);
	});

	it("escapes single quotes in templates", () => {
		const registry = new TemplateRegistry();
		registry.register("<div class='foo'>Hello</div>");

		const declarations = registry.getDeclarations();
		expect(declarations[0]).toContain("\\'foo\\'");
	});
});

describe("VariableNameGenerator", () => {
	it("generates unique variable names for elements", () => {
		const gen = new VariableNameGenerator();

		expect(gen.generate("div")).toBe("div_1");
		expect(gen.generate("div")).toBe("div_2");
		expect(gen.generate("span")).toBe("span_1");
		expect(gen.generate("div")).toBe("div_3");
	});

	it("sanitizes hyphenated tag names", () => {
		const gen = new VariableNameGenerator();

		expect(gen.generate("my-component")).toBe("my_component_1");
		expect(gen.generate("my-component")).toBe("my_component_2");
	});

	it("generates text node variable names", () => {
		const gen = new VariableNameGenerator();

		expect(gen.generateTextNode("p_1")).toBe("p_1_text");
		expect(gen.generateTextNode("p_1")).toBe("p_1_text_2");
		expect(gen.generateTextNode("span_1")).toBe("span_1_text");
	});

	it("generates root variable names", () => {
		const gen = new VariableNameGenerator();

		expect(gen.generateRoot()).toBe("$root_1");
		expect(gen.generateRoot()).toBe("$root_2");
	});
});

describe("isSvgElement", () => {
	it("identifies SVG elements", () => {
		expect(isSvgElement("svg")).toBe(true);
		expect(isSvgElement("circle")).toBe(true);
		expect(isSvgElement("rect")).toBe(true);
		expect(isSvgElement("path")).toBe(true);
		expect(isSvgElement("g")).toBe(true);
		expect(isSvgElement("text")).toBe(true);
		expect(isSvgElement("linearGradient")).toBe(true);
		expect(isSvgElement("feGaussianBlur")).toBe(true);
	});

	it("rejects non-SVG elements", () => {
		expect(isSvgElement("div")).toBe(false);
		expect(isSvgElement("span")).toBe(false);
		expect(isSvgElement("button")).toBe(false);
		expect(isSvgElement("my-component")).toBe(false);
	});
});

describe("extractTemplate", () => {
	function extractFromJSX(jsxCode, isComponentRoot = false) {
		const ast = parse(jsxCode, "test.jsx");
		const jsxNode = ast.program.body[0].expression;
		const registry = new TemplateRegistry();
		const nameGen = new VariableNameGenerator();
		return extractTemplate(jsxNode, registry, nameGen, isComponentRoot);
	}

	it("extracts simple element template", () => {
		const result = extractFromJSX("<div>Hello</div>");

		expect(result.templateVar).toBe("$tmpl_1");
		expect(result.rootVar).toBe("$root_1");
		expect(result.traversal.length).toBeGreaterThan(0);
		expect(result.traversal[0].varName).toBe("div_1");
	});

	it("extracts nested element templates", () => {
		const result = extractFromJSX("<div><span>Hello</span></div>");

		expect(result.traversal.length).toBeGreaterThan(1);
		const varNames = result.traversal.map((t) => t.varName);
		expect(varNames).toContain("div_1");
		expect(varNames).toContain("span_1");
	});

	it("generates firstChild traversal for root in component", () => {
		const result = extractFromJSX("<div>Hello</div>", true);

		expect(result.traversal[0].code).toBe("this.firstChild");
	});

	it("generates rootVar.firstChild traversal for non-component root", () => {
		const result = extractFromJSX("<div>Hello</div>", false);

		expect(result.traversal[0].code).toContain(".firstChild");
	});

	it("collects dynamic text bindings", () => {
		const result = extractFromJSX("<p>{get(name)}</p>");

		expect(result.bindings.length).toBeGreaterThan(0);
		expect(result.bindings[0].type).toBe("text");
	});

	it("collects attribute bindings", () => {
		const result = extractFromJSX("<div class={get(className)}></div>");

		expect(result.bindings.length).toBeGreaterThan(0);
		expect(result.bindings[0].type).toBe("attribute");
		expect(result.bindings[0].attrName).toBe("className");
	});

	it("collects event bindings", () => {
		const result = extractFromJSX("<button onclick={handleClick}>Click</button>");

		expect(result.events.length).toBe(1);
		expect(result.events[0].eventName).toBe("click");
	});

	it("collects For blocks", () => {
		const result = extractFromJSX("<div><For each={items}>{(item) => <li>{item}</li>}</For></div>");

		expect(result.forBlocks.length).toBe(1);
		expect(result.forBlocks[0].containerVarName).toBe("div_1");
	});

	it("collects Show blocks", () => {
		const result = extractFromJSX("<div><Show when={visible}><span>Content</span></Show></div>");

		expect(result.showBlocks.length).toBe(1);
		expect(result.showBlocks[0].containerVarName).toBe("div_1");
	});

	it("handles void elements", () => {
		const result = extractFromJSX('<input type="text" />');

		expect(result.traversal.length).toBeGreaterThan(0);
	});

	it("handles mixed static and dynamic content", () => {
		const result = extractFromJSX("<p>Hello {get(name)}!</p>");

		expect(result.bindings.length).toBeGreaterThan(0);
	});

	it("handles multiple siblings", () => {
		const result = extractFromJSX("<div><span>A</span><span>B</span></div>");

		const spanTraversals = result.traversal.filter((t) => t.varName.startsWith("span"));
		expect(spanTraversals.length).toBe(2);
		// Second span should use nextSibling from first
		expect(spanTraversals[1].code).toContain("nextSibling");
	});

	it("handles fragments", () => {
		const ast = parse("<><div>A</div><div>B</div></>", "test.jsx");
		const jsxNode = ast.program.body[0].expression;
		const registry = new TemplateRegistry();
		const nameGen = new VariableNameGenerator();
		const result = extractTemplate(jsxNode, registry, nameGen, false, true);

		expect(result.traversal.length).toBeGreaterThan(0);
	});

	it("handles deeply nested structures", () => {
		const result = extractFromJSX("<div><ul><li><span><b>Deep</b></span></li></ul></div>");

		// Should generate traversal for all levels
		const varNames = result.traversal.map((t) => t.varName);
		expect(varNames).toContain("div_1");
		expect(varNames).toContain("ul_1");
		expect(varNames).toContain("li_1");
	});

	it("handles Rift custom elements with prop bindings", () => {
		const ast = parse("<my-counter value={get(count)}></my-counter>", "test.jsx");
		const jsxNode = ast.program.body[0].expression;
		const registry = new TemplateRegistry();
		const nameGen = new VariableNameGenerator();
		// Pass my-counter as a Rift component tag
		const riftTags = new Set(["my-counter"]);
		const result = extractTemplate(jsxNode, registry, nameGen, false, false, riftTags);

		// Should have a prop binding, not an attribute binding
		expect(result.bindings.some((b) => b.type === "prop")).toBe(true);
	});

	it("handles third-party web components with attribute bindings", () => {
		const ast = parse("<third-party-widget data={someValue}></third-party-widget>", "test.jsx");
		const jsxNode = ast.program.body[0].expression;
		const registry = new TemplateRegistry();
		const nameGen = new VariableNameGenerator();
		// Not in Rift tags - should be treated as third-party
		const riftTags = new Set(["my-counter"]);
		const result = extractTemplate(jsxNode, registry, nameGen, false, false, riftTags);

		// Should have a prop binding marked as third-party (or attribute)
		const binding = result.bindings.find((b) => b.propName === "data" || b.attrName === "data");
		expect(binding).toBeDefined();
	});

	it("preserves whitespace text nodes correctly", () => {
		const result = extractFromJSX("<p>Hello World</p>");

		// Template should contain the text
		expect(result.templateVar).toBeDefined();
	});

	it("treats string literal expressions as static text", () => {
		// This is the pattern formatters like Prettier produce: {" "}
		const result = extractFromJSX('<p><a href="a">Link</a>{" by "}<a href="b">Other</a></p>');

		// Should NOT create any bindings - string literals are static
		expect(result.bindings.length).toBe(0);
	});

	it("includes string literal expression content in template", () => {
		const ast = parse('<p><a href="a">Link</a>{" by "}<a href="b">Other</a></p>', "test.jsx");
		const jsxNode = ast.program.body[0].expression;
		const registry = new TemplateRegistry();
		const nameGen = new VariableNameGenerator();
		extractTemplate(jsxNode, registry, nameGen, false);

		const declarations = registry.getDeclarations();
		// The template HTML should contain " by " as static text
		expect(declarations[0]).toContain(" by ");
	});

	it("handles multiple string literal expressions between elements", () => {
		const ast = parse(
			'<p><a href="a">A</a>{" and "}<a href="b">B</a>{" and "}<a href="c">C</a></p>',
			"test.jsx",
		);
		const jsxNode = ast.program.body[0].expression;
		const registry = new TemplateRegistry();
		const nameGen = new VariableNameGenerator();
		const result = extractTemplate(jsxNode, registry, nameGen, false);

		// No bindings needed - all static
		expect(result.bindings.length).toBe(0);

		const declarations = registry.getDeclarations();
		// Both " and " strings should be in the template
		expect(declarations[0]).toContain(" and ");
	});

	it("handles mixed string literals and dynamic expressions", () => {
		const result = extractFromJSX('<p>{" prefix "}{get(value)}{" suffix "}</p>');

		// Should have exactly one binding for the dynamic get(value)
		expect(result.bindings.length).toBe(1);
		expect(result.bindings[0].type).toBe("text");
	});

	it("handles boolean attributes without values", () => {
		const result = extractFromJSX("<input disabled readonly />");

		// Template should have the boolean attributes
		expect(result.templateVar).toBeDefined();
	});
});
