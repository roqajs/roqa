import { describe, it, expect } from "vitest";
import { compile } from "../../src/compiler/index.js";

/**
 * Integration tests for the full Roqa compilation pipeline
 *
 * These tests exercise the complete compiler flow from JSX input to optimized
 * JavaScript output, verifying that all phases work together correctly:
 *
 *   Phase 1: Parse     - JSX to Babel AST
 *   Phase 2: Validate  - Reject unsupported patterns
 *   Phase 3: Generate  - JSX to templates + traversal + bindings
 *   Phase 4: Inline    - Optimize reactive primitives
 *
 * Unlike unit tests for individual transforms, these tests verify end-to-end
 * behavior: template generation, event delegation, reactive bindings, control
 * flow components, and proper import management.
 */

describe("compile", () => {
	describe("basic compilation", () => {
		it("compiles simple component", () => {
			const input = `
import { defineComponent, cell, get, set } from 'roqa';

function App() {
	const count = cell(0);
	return <button>Count: {get(count)}</button>;
}
defineComponent('counter-button', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("template(");
			expect(result.code).toContain("this.connected");
			expect(result.code).toContain("defineComponent");
			// get() should be inlined
			expect(result.code).toContain(".v");
		});

		it("compiles component with event handler", () => {
			const input = `
import { defineComponent, cell, get, set } from 'roqa';

function App() {
	const count = cell(0);
	const increment = () => set(count, get(count) + 1);
	return <button onclick={increment}>Count: {get(count)}</button>;
}
defineComponent('counter-button', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("__click");
			expect(result.code).toContain("delegate(");
		});

		it("compiles component with multiple elements", () => {
			const input = `
import { defineComponent } from 'roqa';

function App() {
	return (
		<div>
			<h1>Title</h1>
			<p>Content</p>
		</div>
	);
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("template(");
			expect(result.code).toContain("<div>");
			expect(result.code).toContain("<h1>");
			expect(result.code).toContain("<p>");
		});
	});

	describe("fragments", () => {
		it("compiles JSX fragments", () => {
			const input = `
import { defineComponent, cell, get, set } from 'roqa';

function App() {
	const name = cell('World');
	return (
		<>
			<label>Name:</label>
			<input type="text" value={get(name)} />
			<p>Hello {get(name)}!</p>
		</>
	);
}
defineComponent('hello-world', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("template(");
			// Should have multiple root elements in template
		});
	});

	describe("For component", () => {
		it("compiles For loop", () => {
			const input = `
import { defineComponent, cell, get, set } from 'roqa';

function App() {
	const items = cell(['a', 'b', 'c']);
	return (
		<ul>
			<For each={items}>
				{(item) => <li>{item}</li>}
			</For>
		</ul>
	);
}
defineComponent('item-list', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("forBlock");
			expect(result.code).toContain("anchor");
		});

		it("compiles For loop with index", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function App() {
	const items = cell(['a', 'b']);
	return (
		<ul>
			<For each={items}>
				{(item, index) => <li>{index}: {item}</li>}
			</For>
		</ul>
	);
}
defineComponent('indexed-list', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("forBlock");
			expect(result.code).toContain("index");
		});

		it("compiles nested For loops", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function App() {
	const matrix = cell([[1,2], [3,4]]);
	return (
		<div>
			<For each={matrix}>
				{(row) => (
					<div>
						<For each={row}>
							{(cell) => <span>{cell}</span>}
						</For>
					</div>
				)}
			</For>
		</div>
	);
}
defineComponent('matrix-view', App);
`;
			const result = compile(input, "test.jsx");

			// Should have two forBlock calls
			const forBlockMatches = result.code.match(/forBlock/g);
			expect(forBlockMatches.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("Show component", () => {
		it("compiles Show conditional", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function App() {
	const visible = cell(true);
	return (
		<div>
			<Show when={get(visible)}>
				<p>Visible content</p>
			</Show>
		</div>
	);
}
defineComponent('toggle-content', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("showBlock");
		});

		it("compiles Show with complex condition", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function App() {
	const count = cell(0);
	return (
		<div>
			<Show when={get(count) > 0}>
				<p>Count is positive</p>
			</Show>
		</div>
	);
}
defineComponent('conditional-content', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.code).toContain("showBlock");
		});
	});

	describe("custom elements", () => {
		it("compiles with Roqa custom elements", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function Parent() {
	const value = cell(42);
	return <child-component value={get(value)}></child-component>;
}
defineComponent('parent-component', Parent);
`;
			const result = compile(input, "test.jsx");

			// Should use setProp for Roqa components
			expect(result.code).toContain("setProp");
		});
	});

	describe("void elements", () => {
		it("handles void elements correctly", () => {
			const input = `
import { defineComponent, cell, get, set } from 'roqa';

function App() {
	const value = cell('');
	return (
		<div>
			<input type="text" value={get(value)} />
			<br />
			<hr />
			<img src="test.png" />
		</div>
	);
}
defineComponent('void-elements', App);
`;
			const result = compile(input, "test.jsx");

			// Void elements should not have closing tags in template
			expect(result.code).toContain("<input");
			expect(result.code).toContain("<br>");
			expect(result.code).toContain("<hr>");
			expect(result.code).toContain("<img");
			expect(result.code).not.toContain("</input>");
			expect(result.code).not.toContain("</br>");
		});
	});

	describe("SVG elements", () => {
		it("compiles SVG elements with svgTemplate", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function App() {
	const radius = cell(50);
	return (
		<svg width="100" height="100">
			<circle cx="50" cy="50" r={get(radius)} />
		</svg>
	);
}
defineComponent('svg-circle', App);
`;
			const result = compile(input, "test.jsx");

			// SVG should use svgTemplate
			expect(result.code).toContain("svgTemplate");
		});
	});

	describe("error handling", () => {
		it("rejects PascalCase components", () => {
			const input = `
import { defineComponent } from 'roqa';

function App() {
	return <MyComponent />;
}
defineComponent('my-app', App);
`;
			expect(() => compile(input, "test.jsx")).toThrow(/Unsupported component/);
		});

		it("allows For and Show components", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';

function App() {
	const items = cell([]);
	const visible = cell(true);
	return (
		<div>
			<For each={items}>{(item) => <span>{item}</span>}</For>
			<Show when={get(visible)}><p>Content</p></Show>
		</div>
	);
}
defineComponent('my-app', App);
`;
			expect(() => compile(input, "test.jsx")).not.toThrow();
		});
	});

	describe("source maps", () => {
		it("generates source map", () => {
			const input = `
import { defineComponent } from 'roqa';
function App() { return <div>Hello</div>; }
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");

			expect(result.map).toBeDefined();
			expect(result.map.sources).toContain("test.jsx");
		});
	});

	describe("edge cases", () => {
		it("handles empty component", () => {
			const input = `
import { defineComponent } from 'roqa';
function App() { return <div></div>; }
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			expect(result.code).toContain("template(");
		});

		it("handles component with only text", () => {
			const input = `
import { defineComponent } from 'roqa';
function App() { return <p>Hello World</p>; }
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			expect(result.code).toContain("Hello World");
		});

		it("handles boolean attributes", () => {
			const input = `
import { defineComponent } from 'roqa';
function App() { return <input disabled />; }
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			expect(result.code).toContain("disabled");
		});

		it("handles multiple dynamic expressions in text", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const a = cell(1);
	const b = cell(2);
	return <p>{get(a)} + {get(b)} = {get(a) + get(b)}</p>;
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			// Should handle multiple get() calls
			expect(result.code).toContain(".v");
		});

		it("preserves existing this.connected() callbacks", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	this.connected(() => {
		console.log('connected');
	});
	return <div>Hello</div>;
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			// Should preserve user's this.connected callback
			expect(result.code).toContain("console.log");
		});

		it("handles deeply nested expressions", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const user = cell({ name: 'John', score: 100 });
	return <p>{get(user).name}: {get(user).score}</p>;
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			expect(result.code).toContain(".v.name");
			expect(result.code).toContain(".v.score");
		});

		it("handles class attribute with ternary", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const active = cell(false);
	return <div class={get(active) ? 'active' : 'inactive'}>Toggle</div>;
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			// Should have className binding (may use ref-based or bind-based approach)
			expect(result.code).toContain("className");
			// The expression should be compiled correctly
			expect(result.code).toContain("active.v");
		});

		it("handles style attribute binding", () => {
			const input = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const color = cell('red');
	return <div style={\`color: \${get(color)}\`}>Styled</div>;
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			expect(result.code).toContain("style");
		});

		it("treats string literal expressions as static text (formatter compatibility)", () => {
			// Formatters like Prettier convert inline text to {" "} syntax
			const input = `
import { defineComponent } from 'roqa';
function App() {
	return (
		<p>
			<a href="a">Link A</a>{" "}
			by{" "}
			<a href="b">Link B</a>
			, CC Attribution.
		</p>
	);
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			// The template should contain "by" as static text, not as a binding
			expect(result.code).toContain("by");
			// Should NOT have text bindings for the static strings
			expect(result.code).not.toContain("nodeValue");
		});

		it("includes string literals in template between elements", () => {
			const input = `
import { defineComponent } from 'roqa';
function App() {
	return <p><a>A</a>{" and "}<a>B</a></p>;
}
defineComponent('my-app', App);
`;
			const result = compile(input, "test.jsx");
			// " and " should be directly in the template string
			expect(result.code).toContain(" and ");
		});
	});
});
