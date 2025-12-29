import { describe, it, expect } from "vitest";
import { parse } from "../../src/compiler/parser.js";
import { validateNoCustomComponents } from "../../src/compiler/transforms/validate.js";

/**
 * Tests for the AST validation phase of the Rift compiler
 *
 * The validate transform runs in Phase 2 of the compilation pipeline and enforces
 * Rift's component model constraints. It ensures that only valid JSX patterns are
 * used:
 * - Standard HTML elements (lowercase)
 * - Web components (hyphenated names like my-component)
 * - Built-in control flow components (For, Show)
 *
 * PascalCase components (like React's <MyComponent>) are rejected because Rift
 * compiles to web components rather than supporting component functions.
 */

describe("validateNoCustomComponents", () => {
	it("allows lowercase HTML elements", () => {
		const ast = parse("<div><span>Hello</span></div>", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});

	it("allows hyphenated custom elements (web components)", () => {
		const ast = parse("<my-component><child-element></child-element></my-component>", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});

	it("allows For control flow component", () => {
		const ast = parse("<For each={items}>{(item) => <li>{item}</li>}</For>", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});

	it("allows Show control flow component", () => {
		const ast = parse("<Show when={visible}><div>Content</div></Show>", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});

	it("allows nested For and Show components", () => {
		const ast = parse(
			`
			<div>
				<For each={items}>
					{(item) => (
						<Show when={item.visible}>
							<span>{item.name}</span>
						</Show>
					)}
				</For>
			</div>
		`,
			"test.jsx",
		);
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});

	it("rejects PascalCase components", () => {
		const ast = parse("<MyComponent />", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).toThrow(/Unsupported component 'MyComponent'/);
	});

	it("rejects nested PascalCase components", () => {
		const ast = parse("<div><MyComponent /></div>", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).toThrow(/Unsupported component 'MyComponent'/);
	});

	it("provides helpful error message with suggestions", () => {
		const ast = parse("<UserCard />", "test.jsx");
		try {
			validateNoCustomComponents(ast);
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error.code).toBe("UNSUPPORTED_COMPONENT");
			expect(error.componentName).toBe("UserCard");
			expect(error.suggestions).toBeDefined();
			expect(error.suggestions.length).toBeGreaterThan(0);
			// Should suggest kebab-case web component
			expect(error.suggestions.some((s) => s.includes("user-card"))).toBe(true);
		}
	});

	it("error message includes component location info", () => {
		const ast = parse("<div><MyWidget /></div>", "test.jsx");
		try {
			validateNoCustomComponents(ast);
			expect.fail("Should have thrown");
		} catch (error) {
			// Error should have location information for better debugging
			expect(error.message).toContain("MyWidget");
			// The error object should be informative
			expect(error.code).toBe("UNSUPPORTED_COMPONENT");
		}
	});

	it("suggests using Show/For for conditional/list patterns", () => {
		// A component named 'If' or 'Each' should suggest Show/For
		const ast = parse("<If condition={x}><span /></If>", "test.jsx");
		try {
			validateNoCustomComponents(ast);
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error.componentName).toBe("If");
			// Should provide useful suggestions
			expect(error.suggestions).toBeDefined();
		}
	});

	it("rejects member expression components (Foo.Bar)", () => {
		const ast = parse("<Foo.Bar />", "test.jsx");
		expect(() => validateNoCustomComponents(ast)).toThrow(/Unsupported component/);
	});

	it("allows void HTML elements", () => {
		const ast = parse('<input type="text" />', "test.jsx");
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});

	it("allows SVG elements", () => {
		const ast = parse('<svg><circle cx="50" cy="50" r="40" /></svg>', "test.jsx");
		expect(() => validateNoCustomComponents(ast)).not.toThrow();
	});
});
