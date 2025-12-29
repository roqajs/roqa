import { describe, it, expect } from "vitest";
import { template, svg_template } from "../../src/runtime/template.js";

/**
 * Tests for the template runtime functions
 *
 * Rift uses cloneable DOM templates for efficient rendering. The template()
 * function creates a factory that clones pre-parsed HTML:
 *
 *   const tmpl = template('<div><span>Hello</span></div>');
 *   const clone = tmpl(); // Returns DocumentFragment with cloned nodes
 *
 * Key features:
 * - template() for HTML elements
 * - svg_template() for SVG elements (uses correct namespace)
 * - Returns DocumentFragment for efficient insertion
 * - Cloning is faster than parsing HTML repeatedly
 */

describe("template", () => {
	it("creates a clone function from HTML string", () => {
		const tmpl = template("<div>Hello</div>");
		expect(typeof tmpl).toBe("function");
	});

	it("returns a DocumentFragment when called", () => {
		const tmpl = template("<div>Hello</div>");
		const result = tmpl();
		expect(result).toBeInstanceOf(DocumentFragment);
	});

	it("clones contain the correct content", () => {
		const tmpl = template("<div>Hello World</div>");
		const clone = tmpl();
		expect(clone.firstChild.textContent).toBe("Hello World");
	});

	it("each clone is independent", () => {
		const tmpl = template("<div>Test</div>");
		const clone1 = tmpl();
		const clone2 = tmpl();

		clone1.firstChild.textContent = "Modified";

		expect(clone1.firstChild.textContent).toBe("Modified");
		expect(clone2.firstChild.textContent).toBe("Test");
	});

	it("handles multiple root elements", () => {
		const tmpl = template("<div>A</div><div>B</div>");
		const clone = tmpl();

		expect(clone.childNodes.length).toBe(2);
		expect(clone.firstChild.textContent).toBe("A");
		expect(clone.lastChild.textContent).toBe("B");
	});

	it("handles nested elements", () => {
		const tmpl = template("<div><span><b>Nested</b></span></div>");
		const clone = tmpl();
		const nested = clone.firstChild.firstChild.firstChild;

		expect(nested.textContent).toBe("Nested");
	});

	it("preserves attributes", () => {
		const tmpl = template('<input type="text" class="my-input" />');
		const clone = tmpl();
		const input = clone.firstChild;

		expect(input.getAttribute("type")).toBe("text");
		expect(input.getAttribute("class")).toBe("my-input");
	});

	it("handles void elements", () => {
		const tmpl = template("<br><hr><input>");
		const clone = tmpl();

		expect(clone.childNodes.length).toBe(3);
	});

	it("handles empty template", () => {
		const tmpl = template("");
		const clone = tmpl();

		expect(clone.childNodes.length).toBe(0);
	});

	it("handles text-only template", () => {
		const tmpl = template("Just text");
		const clone = tmpl();

		expect(clone.firstChild.textContent).toBe("Just text");
	});

	it("handles special characters in content", () => {
		const tmpl = template("<div>&lt;script&gt;</div>");
		const clone = tmpl();

		expect(clone.firstChild.textContent).toBe("<script>");
	});
});

describe("svg_template", () => {
	it("creates a clone function from SVG string", () => {
		const tmpl = svg_template('<circle cx="50" cy="50" r="40" />');
		expect(typeof tmpl).toBe("function");
	});

	it("returns a DocumentFragment when called", () => {
		const tmpl = svg_template('<circle cx="50" cy="50" r="40" />');
		const result = tmpl();
		expect(result).toBeInstanceOf(DocumentFragment);
	});

	it("creates SVG elements in correct namespace", () => {
		const tmpl = svg_template('<circle cx="50" cy="50" r="40" />');
		const clone = tmpl();
		const circle = clone.firstChild;

		expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");
	});

	it("handles multiple SVG elements", () => {
		const tmpl = svg_template('<circle cx="25" /><rect x="50" />');
		const clone = tmpl();

		expect(clone.childNodes.length).toBe(2);
		expect(clone.firstChild.tagName.toLowerCase()).toBe("circle");
		expect(clone.lastChild.tagName.toLowerCase()).toBe("rect");
	});

	it("handles nested SVG elements", () => {
		const tmpl = svg_template('<g><circle cx="50" /></g>');
		const clone = tmpl();
		const g = clone.firstChild;
		const circle = g.firstChild;

		expect(g.tagName.toLowerCase()).toBe("g");
		expect(circle.tagName.toLowerCase()).toBe("circle");
	});

	it("preserves SVG attributes", () => {
		const tmpl = svg_template('<rect x="10" y="20" width="100" height="50" fill="red" />');
		const clone = tmpl();
		const rect = clone.firstChild;

		expect(rect.getAttribute("x")).toBe("10");
		expect(rect.getAttribute("fill")).toBe("red");
	});

	it("each clone is independent", () => {
		const tmpl = svg_template('<circle cx="50" />');
		const clone1 = tmpl();
		const clone2 = tmpl();

		clone1.firstChild.setAttribute("cx", "100");

		expect(clone1.firstChild.getAttribute("cx")).toBe("100");
		expect(clone2.firstChild.getAttribute("cx")).toBe("50");
	});

	it("handles path elements", () => {
		const tmpl = svg_template('<path d="M10 10 H 90 V 90 H 10 Z" />');
		const clone = tmpl();
		const path = clone.firstChild;

		expect(path.tagName.toLowerCase()).toBe("path");
		expect(path.getAttribute("d")).toContain("M10 10");
	});

	it("handles text elements", () => {
		const tmpl = svg_template('<text x="10" y="50">Hello SVG</text>');
		const clone = tmpl();
		const text = clone.firstChild;

		expect(text.tagName.toLowerCase()).toBe("text");
		expect(text.textContent).toBe("Hello SVG");
	});
});
