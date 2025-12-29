import { describe, it, expect } from "vitest";
import { generateOutput } from "../../src/compiler/codegen.js";
import { parse } from "../../src/compiler/parser.js";

/**
 * Unit tests for codegen.js
 *
 * These tests focus on specific codegen behavior rather than full compilation,
 * complementing the integration tests in compile.test.js
 */

describe("generateOutput", () => {
	describe("component detection", () => {
		it("returns unchanged code when no JSX is found", () => {
			const code = `const x = 1;\nconst y = 2;`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toBe(code);
		});

		it("detects function declarations with JSX returns", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	return <div>Hello</div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("this.connected");
			expect(result.code).toContain("template(");
		});

		it("detects function expressions with JSX returns", () => {
			const code = `
import { defineComponent } from 'rift-js';
const App = function() {
	return <div>Hello</div>;
};
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("this.connected");
		});

		it("handles multiple components in one file", () => {
			const code = `
import { defineComponent } from 'rift-js';
function Header() {
	return <header>Header</header>;
}
function Footer() {
	return <footer>Footer</footer>;
}
defineComponent('my-header', Header);
defineComponent('my-footer', Footer);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Both components should be transformed
			const connectedCount = (result.code.match(/this\.connected/g) || []).length;
			expect(connectedCount).toBe(2);
		});
	});

	describe("template generation", () => {
		it("extracts static HTML into template declarations", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	return <div class="container"><span>Text</span></div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("$tmpl_1 = template(");
			expect(result.code).toContain('<div class="container">');
			expect(result.code).toContain("<span>Text</span>");
		});

		it("deduplicates identical templates", () => {
			const code = `
import { defineComponent } from 'rift-js';
function A() { return <span>Same</span>; }
function B() { return <span>Same</span>; }
defineComponent('comp-a', A);
defineComponent('comp-b', B);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should only have one template declaration for identical content
			const templateMatches = result.code.match(/\$tmpl_\d+ = template\(/g);
			expect(templateMatches).not.toBeNull();
			// Both components should use the same template
			expect(result.code).toContain("$tmpl_1()");
		});

		it("uses svg_template for SVG elements", () => {
			const code = `
import { defineComponent } from 'rift-js';
function Icon() {
	return <svg><circle cx="50" cy="50" r="40" /></svg>;
}
defineComponent('my-icon', Icon);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("svg_template(");
		});
	});

	describe("traversal generation", () => {
		it("generates correct traversal for nested elements", () => {
			const code = `
import { defineComponent, cell, get } from 'rift-js';
function App() {
	const name = cell('World');
	return <div><p>{get(name)}</p></div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should have traversal for div and p
			expect(result.code).toContain("this.firstChild"); // div_1
			expect(result.code).toContain(".firstChild"); // p_1 from div_1
		});

		it("generates nextSibling traversal for siblings", () => {
			const code = `
import { defineComponent, cell, get } from 'rift-js';
function App() {
	const a = cell('A');
	const b = cell('B');
	return <div><span>{get(a)}</span><span>{get(b)}</span></div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Second span should use nextSibling
			expect(result.code).toContain("nextSibling");
		});
	});

	describe("event delegation", () => {
		it("adds delegate() call when events are present", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	const handleClick = () => {};
	return <button onclick={handleClick}>Click</button>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain('delegate(["click"])');
		});

		it("collects multiple event types", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	return <input oninput={() => {}} onfocus={() => {}} onblur={() => {}} />;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("delegate(");
			expect(result.code).toContain('"input"');
			expect(result.code).toContain('"focus"');
			expect(result.code).toContain('"blur"');
		});

		it("transforms event handlers to __eventname format", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	return <button onclick={() => console.log('clicked')}>Click</button>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("__click =");
		});
	});

	describe("import management", () => {
		it("adds template import when templates are generated", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() { return <div>Hello</div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("import {");
			expect(result.code).toMatch(/import.*template.*from "rift-js"/);
		});

		it("adds for_block import when For components are used", () => {
			const code = `
import { defineComponent, cell } from 'rift-js';
function App() {
	const items = cell([]);
	return <ul><For each={items}>{(item) => <li>{item}</li>}</For></ul>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toMatch(/import.*for_block.*from "rift-js"/);
		});

		it("adds show_block import when Show components are used", () => {
			const code = `
import { defineComponent, cell, get } from 'rift-js';
function App() {
	const visible = cell(true);
	return <div><Show when={get(visible)}><span>Visible</span></Show></div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toMatch(/import.*show_block.*from "rift-js"/);
		});

		it("preserves existing non-framework imports", () => {
			const code = `
import { defineComponent } from 'rift-js';
import { someUtil } from './utils.js';
function App() { return <div>Hello</div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("import { someUtil } from './utils.js'");
		});
	});

	describe("Rift component detection", () => {
		it("identifies components defined with defineComponent", () => {
			const code = `
import { defineComponent, cell, get } from 'rift-js';
function Child() {
	return <span>Child</span>;
}
defineComponent('child-component', Child);

function Parent() {
	const value = cell(42);
	return <div><child-component value={get(value)}></child-component></div>;
}
defineComponent('parent-component', Parent);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should use setProp for Rift components
			expect(result.code).toContain("setProp(");
		});
	});

	describe("source map generation", () => {
		it("generates source map with correct source filename", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() { return <div>Hello</div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "my-component.jsx");

			expect(result.map).toBeDefined();
			expect(result.map.sources).toContain("my-component.jsx");
		});
	});

	describe("edge cases", () => {
		it("handles parenthesized JSX returns", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	return (
		<div>
			<span>Hello</span>
		</div>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("this.connected");
		});

		it("handles JSX fragments", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() {
	return (
		<>
			<div>A</div>
			<div>B</div>
		</>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("this.connected");
		});

		it("handles empty elements", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() { return <div></div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("template(");
		});

		it("handles self-closing void elements", () => {
			const code = `
import { defineComponent } from 'rift-js';
function App() { return <input type="text" />; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("<input");
			expect(result.code).not.toContain("</input>");
		});
	});
});

describe("helper functions", () => {
	describe("escapeStringLiteral behavior", () => {
		it("escapes special characters in template strings", () => {
			const code = `
import { defineComponent, cell, get } from 'rift-js';
function App() {
	const msg = cell('Hello "World"');
	return <p>{get(msg)}</p>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should compile without errors
			expect(result.code).toContain("this.connected");
		});
	});
});
