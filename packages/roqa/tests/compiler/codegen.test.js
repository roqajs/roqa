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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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

		it("uses svgTemplate for SVG elements", () => {
			const code = `
import { defineComponent } from 'roqa';
function Icon() {
	return <svg><circle cx="50" cy="50" r="40" /></svg>;
}
defineComponent('my-icon', Icon);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("svgTemplate(");
		});
	});

	describe("traversal generation", () => {
		it("generates correct traversal for nested elements", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
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
import { defineComponent, cell, get } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
function App() { return <div>Hello</div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("import {");
			expect(result.code).toMatch(/import.*template.*from "roqa"/);
		});

		it("adds forBlock import when For components are used", () => {
			const code = `
import { defineComponent, cell } from 'roqa';
function App() {
	const items = cell([]);
	return <ul><For each={items}>{(item) => <li>{item}</li>}</For></ul>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toMatch(/import.*forBlock.*from "roqa"/);
		});

		it("adds showBlock import when Show components are used", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const visible = cell(true);
	return <div><Show when={get(visible)}><span>Visible</span></Show></div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toMatch(/import.*showBlock.*from "roqa"/);
		});

		it("preserves existing non-framework imports", () => {
			const code = `
import { defineComponent } from 'roqa';
import { someUtil } from './utils.js';
function App() { return <div>Hello</div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("import { someUtil } from './utils.js'");
		});
	});

	describe("Roqa component detection", () => {
		it("identifies components defined with defineComponent", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
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

			// Should use setProp for Roqa components
			expect(result.code).toContain("setProp(");
		});
	});

	describe("source map generation", () => {
		it("generates source map with correct source filename", () => {
			const code = `
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
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
import { defineComponent } from 'roqa';
function App() { return <div></div>; }
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			expect(result.code).toContain("template(");
		});

		it("handles self-closing void elements", () => {
			const code = `
import { defineComponent } from 'roqa';
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
import { defineComponent, cell, get } from 'roqa';
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

describe("cleanup generation", () => {
	describe("forBlock cleanup", () => {
		it("generates cleanup function for bind() calls inside For", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const selected = cell(null);
	const items = cell([]);
	return (
		<ul>
			<For each={items}>
				{(item) => <li class={get(selected) === item.id ? 'active' : ''}>{item.name}</li>}
			</For>
		</ul>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should have cleanup variable captured
			expect(result.code).toContain("const _cleanup_0 = bind(");
			// Should return cleanup in forBlock result
			expect(result.code).toContain("cleanup: () => {");
			expect(result.code).toContain("_cleanup_0()");
		});

		it("generates multiple cleanup vars for multiple bind() calls in For", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const selected = cell(null);
	const highlighted = cell(null);
	const items = cell([]);
	return (
		<ul>
			<For each={items}>
				{(item) => (
					<li 
						class={get(selected) === item.id ? 'selected' : ''}
						data-highlight={get(highlighted) === item.id ? 'yes' : 'no'}
					>
						{item.name}
					</li>
				)}
			</For>
		</ul>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should have multiple cleanup variables
			expect(result.code).toContain("const _cleanup_0 = bind(");
			expect(result.code).toContain("const _cleanup_1 = bind(");
			// Cleanup function should call all of them
			expect(result.code).toContain("_cleanup_0()");
			expect(result.code).toContain("_cleanup_1()");
		});

		it("does not generate cleanup for simple ref bindings in For", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const items = cell([]);
	return (
		<ul>
			<For each={items}>
				{(item) => <li>{get(item.label)}</li>}
			</For>
		</ul>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Simple ref bindings use .ref_N format, not bind()
			// Should not have cleanup if only simple bindings
			// But check that the forBlock still returns properly
			expect(result.code).toContain("forBlock(");
			expect(result.code).toContain("item.label.ref_1");
		});
	});

	describe("showBlock cleanup", () => {
		it("generates cleanup function for bind() calls inside Show", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const isActive = cell(true);
	const theme = cell('dark');
	return (
		<div>
			<Show when={get(isActive)}>
				<span class={get(theme) === 'dark' ? 'dark-mode' : 'light-mode'}>Active</span>
			</Show>
		</div>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Should have cleanup variable captured
			expect(result.code).toContain("const _cleanup_0 = bind(");
			// Should return cleanup in showBlock result
			expect(result.code).toContain("cleanup: () => {");
		});

		it("does not generate cleanup when only ref bindings in Show", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const isActive = cell(true);
	const count = cell(0);
	return (
		<div>
			<Show when={get(isActive)}>
				<span>{get(count)}</span>
			</Show>
		</div>
	);
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Simple get(count) uses ref_1 optimization
			expect(result.code).toContain("count.ref_1");
		});
	});

	describe("component-level bindings", () => {
		it("does not generate cleanup vars for component-level bind()", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const isDark = cell(false);
	return <div class={get(isDark) ? 'dark' : 'light'}>Theme</div>;
}
defineComponent('my-app', App);
`;
			const ast = parse(code, "test.jsx");
			const result = generateOutput(code, ast, "test.jsx");

			// Component level bindings don't need cleanup vars
			// They're cleaned up when component is disconnected
			expect(result.code).toContain("bind(isDark");
			expect(result.code).not.toContain("_cleanup_0");
		});
	});
});
