import { describe, it, expect } from "vitest";
import { generateOutput } from "../../src/compiler/codegen.js";
import { compile } from "../../src/compiler/index.js";
import { parse } from "../../src/compiler/parser.js";
import { inlineGetCalls } from "../../src/compiler/transforms/inline-get.js";

/**
 * Performance regression tests for the Roqa compiler
 *
 * These tests ensure that compilation performance stays within acceptable bounds.
 * They are not meant to be exact benchmarks, but rather to catch severe performance
 * regressions that might slip through during development.
 *
 * Thresholds are set conservatively to avoid flaky tests while still catching
 * obvious regressions.
 */

describe("compiler performance", () => {
	// Generous threshold for CI environments with varying performance
	const THRESHOLD_MULTIPLIER = 5;

	describe("parse performance", () => {
		it("parses small component quickly", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const count = cell(0);
	return <button>{get(count)}</button>;
}
defineComponent('my-app', App);
`;
			const start = performance.now();
			for (let i = 0; i < 100; i++) {
				parse(code, "test.jsx");
			}
			const duration = performance.now() - start;

			// 100 parses should complete in under 2500ms
			expect(duration).toBeLessThan(500 * THRESHOLD_MULTIPLIER);
		});

		it("parses medium component with reasonable performance", () => {
			const code = `
import { defineComponent, cell, get, set } from 'roqa';
function TodoApp() {
	const items = cell([]);
	const newItem = cell('');
	const filter = cell('all');
	
	const addItem = () => {
		set(items, [...get(items), { id: Date.now(), text: get(newItem), done: false }]);
		set(newItem, '');
	};
	
	return (
		<div class="todo-app">
			<header>
				<h1>Todo List</h1>
				<input value={get(newItem)} oninput={(e) => set(newItem, e.target.value)} />
				<button onclick={addItem}>Add</button>
			</header>
			<main>
				<For each={items}>
					{(item) => (
						<div class={get(item.done) ? 'done' : ''}>
							<input type="checkbox" checked={get(item.done)} />
							<span>{item.text}</span>
							<button>Delete</button>
						</div>
					)}
				</For>
			</main>
			<footer>
				<span>{get(items).length} items</span>
				<div>
					<button class={get(filter) === 'all' ? 'active' : ''}>All</button>
					<button class={get(filter) === 'active' ? 'active' : ''}>Active</button>
					<button class={get(filter) === 'done' ? 'active' : ''}>Done</button>
				</div>
			</footer>
		</div>
	);
}
defineComponent('todo-app', TodoApp);
`;
			const start = performance.now();
			for (let i = 0; i < 50; i++) {
				parse(code, "test.jsx");
			}
			const duration = performance.now() - start;

			// 50 parses of medium component should complete in under 2500ms
			expect(duration).toBeLessThan(500 * THRESHOLD_MULTIPLIER);
		});
	});

	describe("full compilation performance", () => {
		it("compiles simple component quickly", () => {
			const code = `
import { defineComponent, cell, get, set } from 'roqa';
function Counter() {
	const count = cell(0);
	return <button onclick={() => set(count, get(count) + 1)}>Count: {get(count)}</button>;
}
defineComponent('my-counter', Counter);
`;
			const start = performance.now();
			for (let i = 0; i < 50; i++) {
				compile(code, "test.jsx");
			}
			const duration = performance.now() - start;

			// 50 compilations should complete in under 5000ms
			expect(duration).toBeLessThan(1000 * THRESHOLD_MULTIPLIER);
		});

		it("compiles component with For loop efficiently", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function List() {
	const items = cell(Array.from({ length: 100 }, (_, i) => ({ id: i, name: 'Item ' + i })));
	return (
		<ul>
			<For each={items}>
				{(item) => <li>{item.id}: {item.name}</li>}
			</For>
		</ul>
	);
}
defineComponent('my-list', List);
`;
			const start = performance.now();
			for (let i = 0; i < 25; i++) {
				compile(code, "test.jsx");
			}
			const duration = performance.now() - start;

			// 25 compilations with For should complete in under 5000ms
			expect(duration).toBeLessThan(1000 * THRESHOLD_MULTIPLIER);
		});

		it("compiles multiple components efficiently", () => {
			// Generate 10 component definitions
			const components = Array.from(
				{ length: 10 },
				(_, i) => `
function Component${i}() {
	const value${i} = cell(${i});
	return <div class="comp-${i}">{get(value${i})}</div>;
}
defineComponent('comp-${i}', Component${i});
`,
			).join("\n");

			const code = `
import { defineComponent, cell, get } from 'roqa';
${components}
`;

			const start = performance.now();
			for (let i = 0; i < 10; i++) {
				compile(code, "test.jsx");
			}
			const duration = performance.now() - start;

			// 10 compilations of 10-component file should complete in under 10000ms
			expect(duration).toBeLessThan(2000 * THRESHOLD_MULTIPLIER);
		});
	});

	describe("inline-get performance", () => {
		it("inlines get() calls efficiently", () => {
			// Generate code with many get() calls
			const getters = Array.from({ length: 50 }, (_, i) => `const v${i} = get(cell${i});`).join(
				"\n",
			);
			const code = `
import { cell, get } from 'roqa';
${Array.from({ length: 50 }, (_, i) => `const cell${i} = cell(${i});`).join("\n")}
${getters}
`;

			const start = performance.now();
			for (let i = 0; i < 50; i++) {
				inlineGetCalls(code, "test.js");
			}
			const duration = performance.now() - start;

			// 50 inlinings should complete in under 2500ms
			expect(duration).toBeLessThan(500 * THRESHOLD_MULTIPLIER);
		});
	});

	describe("codegen performance", () => {
		it("generates output for complex JSX efficiently", () => {
			const code = `
import { defineComponent, cell, get, set } from 'roqa';
function Complex() {
	const a = cell(1);
	const b = cell(2);
	const c = cell(3);
	return (
		<div>
			<header>
				<h1>Title: {get(a)}</h1>
				<nav>
					<a href="#" class={get(b) > 0 ? 'active' : ''}>Link 1</a>
					<a href="#">Link 2</a>
					<a href="#">Link 3</a>
				</nav>
			</header>
			<main>
				<section>
					<h2>Section {get(c)}</h2>
					<p>Some content here with {get(a)} and {get(b)}</p>
				</section>
				<aside>
					<For each={cell([1,2,3])}>
						{(item) => <span>{item}</span>}
					</For>
				</aside>
			</main>
			<footer>
				<Show when={get(a) > 0}>
					<p>Visible: {get(a) + get(b) + get(c)}</p>
				</Show>
			</footer>
		</div>
	);
}
defineComponent('my-complex', Complex);
`;

			const ast = parse(code, "test.jsx");

			const start = performance.now();
			for (let i = 0; i < 25; i++) {
				generateOutput(code, ast, "test.jsx");
			}
			const duration = performance.now() - start;

			// 25 code generations should complete in under 2500ms
			expect(duration).toBeLessThan(500 * THRESHOLD_MULTIPLIER);
		});
	});

	describe("memory efficiency", () => {
		it("does not leak memory during repeated compilations", () => {
			const code = `
import { defineComponent, cell, get } from 'roqa';
function App() {
	const count = cell(0);
	return <div>{get(count)}</div>;
}
defineComponent('my-app', App);
`;

			// Run many compilations and check that memory doesn't grow unboundedly
			// This is a basic sanity check, not a precise memory test
			const initialMemory = process.memoryUsage?.().heapUsed || 0;

			for (let i = 0; i < 100; i++) {
				compile(code, "test.jsx");
			}

			// Force GC if available (Node.js with --expose-gc flag)
			if (global.gc) {
				global.gc();
			}

			const finalMemory = process.memoryUsage?.().heapUsed || 0;

			// Memory growth should be reasonable (less than 50MB for 100 compilations)
			// This is a very loose bound to avoid flaky tests
			if (initialMemory > 0) {
				const memoryGrowth = finalMemory - initialMemory;
				expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
			}
		});
	});
});

describe("baseline performance benchmarks", () => {
	/**
	 * These tests establish baseline performance numbers.
	 * They don't assert specific values but log performance data
	 * that can be used for tracking over time.
	 */

	it("logs baseline compilation performance", () => {
		const code = `
import { defineComponent, cell, get, set } from 'roqa';
function Benchmark() {
	const count = cell(0);
	const items = cell([1, 2, 3, 4, 5]);
	return (
		<div>
			<span>Count: {get(count)}</span>
			<button onclick={() => set(count, get(count) + 1)}>+</button>
			<ul>
				<For each={items}>
					{(item) => <li>{item}</li>}
				</For>
			</ul>
		</div>
	);
}
defineComponent('benchmark', Benchmark);
`;

		const iterations = 100;
		const times = [];

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			compile(code, "benchmark.jsx");
			times.push(performance.now() - start);
		}

		const avg = times.reduce((a, b) => a + b, 0) / times.length;
		const min = Math.min(...times);
		const max = Math.max(...times);

		// Log for reference (visible in verbose test output)
		console.log(`\nCompilation Performance (${iterations} iterations):`);
		console.log(`  Average: ${avg.toFixed(2)}ms`);
		console.log(`  Min: ${min.toFixed(2)}ms`);
		console.log(`  Max: ${max.toFixed(2)}ms`);

		// Just ensure it completes
		expect(times.length).toBe(iterations);
	});
});
