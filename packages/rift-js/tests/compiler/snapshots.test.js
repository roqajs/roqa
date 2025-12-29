import { describe, it, expect } from "vitest";
import { compile } from "../../src/compiler/index.js";

/**
 * Snapshot tests for the Rift compiler
 *
 * These tests capture the full compiled output and compare against snapshots.
 * This helps catch unexpected changes in the compilation output format.
 *
 * To update snapshots when intentionally changing output:
 * pnpm test -u
 */

describe("compile snapshots", () => {
	describe("basic components", () => {
		it("compiles simple static component", () => {
			const input = `
import { defineComponent } from 'rift-js';

function HelloWorld() {
	return <div class="greeting">Hello, World!</div>;
}

defineComponent('hello-world', HelloWorld);
`;
			const result = compile(input, "hello-world.jsx");
			expect(result.code).toMatchSnapshot();
		});

		it("compiles component with reactive state", () => {
			const input = `
import { defineComponent, cell, get, set } from 'rift-js';

function Counter() {
	const count = cell(0);
	const increment = () => set(count, get(count) + 1);
	return (
		<div>
			<span>Count: {get(count)}</span>
			<button onclick={increment}>+</button>
		</div>
	);
}

defineComponent('my-counter', Counter);
`;
			const result = compile(input, "counter.jsx");
			expect(result.code).toMatchSnapshot();
		});

		it("compiles component with multiple cells", () => {
			const input = `
import { defineComponent, cell, get, set } from 'rift-js';

function Form() {
	const name = cell('');
	const email = cell('');
	const submitted = cell(false);
	
	return (
		<form>
			<input value={get(name)} oninput={(e) => set(name, e.target.value)} />
			<input value={get(email)} oninput={(e) => set(email, e.target.value)} />
			<button type="submit">Submit</button>
		</form>
	);
}

defineComponent('my-form', Form);
`;
			const result = compile(input, "form.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});

	describe("control flow", () => {
		it("compiles For component", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function TodoList() {
	const items = cell(['Learn Rift', 'Build app', 'Deploy']);
	
	return (
		<ul>
			<For each={items}>
				{(item, index) => <li>{index}: {item}</li>}
			</For>
		</ul>
	);
}

defineComponent('todo-list', TodoList);
`;
			const result = compile(input, "todo-list.jsx");
			expect(result.code).toMatchSnapshot();
		});

		it("compiles Show component", () => {
			const input = `
import { defineComponent, cell, get, set } from 'rift-js';

function Toggle() {
	const visible = cell(false);
	
	return (
		<div>
			<button onclick={() => set(visible, !get(visible))}>Toggle</button>
			<Show when={get(visible)}>
				<p>Now you see me!</p>
			</Show>
		</div>
	);
}

defineComponent('my-toggle', Toggle);
`;
			const result = compile(input, "toggle.jsx");
			expect(result.code).toMatchSnapshot();
		});

		it("compiles nested For and Show", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function DataGrid() {
	const rows = cell([
		{ id: 1, name: 'Alice', active: true },
		{ id: 2, name: 'Bob', active: false },
	]);
	
	return (
		<table>
			<For each={rows}>
				{(row) => (
					<tr>
						<td>{row.id}</td>
						<td>{row.name}</td>
						<Show when={row.active}>
							<td class="active">Active</td>
						</Show>
					</tr>
				)}
			</For>
		</table>
	);
}

defineComponent('data-grid', DataGrid);
`;
			const result = compile(input, "data-grid.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});

	describe("bindings", () => {
		it("compiles attribute bindings", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function DynamicButton() {
	const isDisabled = cell(false);
	const buttonClass = cell('btn-primary');
	
	return (
		<button 
			class={get(buttonClass)} 
			disabled={get(isDisabled)}
		>
			Click me
		</button>
	);
}

defineComponent('dynamic-button', DynamicButton);
`;
			const result = compile(input, "dynamic-button.jsx");
			expect(result.code).toMatchSnapshot();
		});

		it("compiles text bindings with concatenation", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function Greeting() {
	const firstName = cell('John');
	const lastName = cell('Doe');
	
	return <p>Hello, {get(firstName)} {get(lastName)}!</p>;
}

defineComponent('my-greeting', Greeting);
`;
			const result = compile(input, "greeting.jsx");
			expect(result.code).toMatchSnapshot();
		});

		it("compiles ternary expressions", () => {
			const input = `
import { defineComponent, cell, get, set } from 'rift-js';

function ThemeToggle() {
	const isDark = cell(false);
	
	return (
		<div class={get(isDark) ? 'dark-theme' : 'light-theme'}>
			<button onclick={() => set(isDark, !get(isDark))}>
				{get(isDark) ? 'Switch to Light' : 'Switch to Dark'}
			</button>
		</div>
	);
}

defineComponent('theme-toggle', ThemeToggle);
`;
			const result = compile(input, "theme-toggle.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});

	describe("SVG", () => {
		it("compiles SVG elements", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function Circle() {
	const radius = cell(50);
	const color = cell('blue');
	
	return (
		<svg width="100" height="100">
			<circle 
				cx="50" 
				cy="50" 
				r={get(radius)} 
				fill={get(color)} 
			/>
		</svg>
	);
}

defineComponent('svg-circle', Circle);
`;
			const result = compile(input, "circle.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});

	describe("component composition", () => {
		it("compiles parent-child Rift components", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function ChildComponent() {
	return <span>I am child</span>;
}
defineComponent('child-component', ChildComponent);

function ParentComponent() {
	const message = cell('Hello from parent');
	return (
		<div>
			<child-component message={get(message)}></child-component>
		</div>
	);
}
defineComponent('parent-component', ParentComponent);
`;
			const result = compile(input, "parent-child.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});

	describe("fragments", () => {
		it("compiles JSX fragments", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function MultiRoot() {
	const title = cell('Title');
	const subtitle = cell('Subtitle');
	
	return (
		<>
			<h1>{get(title)}</h1>
			<h2>{get(subtitle)}</h2>
			<p>Some content</p>
		</>
	);
}

defineComponent('multi-root', MultiRoot);
`;
			const result = compile(input, "multi-root.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});

	describe("lifecycle", () => {
		it("compiles component with connected callback", () => {
			const input = `
import { defineComponent, cell, get } from 'rift-js';

function Timer() {
	const seconds = cell(0);
	
	this.connected(() => {
		const interval = setInterval(() => {
			seconds.v++;
		}, 1000);
		
		this.disconnected(() => {
			clearInterval(interval);
		});
	});
	
	return <span>Seconds: {get(seconds)}</span>;
}

defineComponent('my-timer', Timer);
`;
			const result = compile(input, "timer.jsx");
			expect(result.code).toMatchSnapshot();
		});
	});
});
