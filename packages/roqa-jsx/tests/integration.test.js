import { describe, it, expect } from "vitest";
import jsx from "../src/index.js";
import { compile } from "roqa/compiler";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(__dirname, "../../../examples/jsx");

function readExample(name) {
	return readFileSync(resolve(examplesDir, name, "src/main.tsx"), "utf-8");
}

describe("integration: JSX → IR → JS", () => {
	const frontend = jsx();

	describe("handles()", () => {
		it("returns true for .tsx files", () => {
			expect(frontend.handles("/src/main.tsx")).toBe(true);
		});

		it("returns true for .jsx files", () => {
			expect(frontend.handles("/src/main.jsx")).toBe(true);
		});

		it("returns false for .ts files", () => {
			expect(frontend.handles("/src/main.ts")).toBe(false);
		});

		it("returns false for .js files", () => {
			expect(frontend.handles("/src/main.js")).toBe(false);
		});

		it("returns false for .roqa files", () => {
			expect(frontend.handles("/src/main.roqa")).toBe(false);
		});
	});

	describe("counter-button reference translation", () => {
		it("produces correct IR", () => {
			const code = readExample("counter-button");
			const ir = frontend.toIR(code, "counter-button.tsx");

			expect(ir.version).toBe(1);
			expect(ir.tagName).toBe("counter-button");
			expect(ir.name).toBe("App");

			// State
			expect(ir.state).toHaveLength(1);
			expect(ir.state[0]).toEqual({ kind: "value", name: "count", initial: 0 });

			// Actions
			expect(ir.actions).toHaveLength(1);
			expect(ir.actions[0].name).toBe("increment");
			expect(ir.actions[0].body.kind).toBe("state-write");
			expect(ir.actions[0].body.name).toBe("count");

			// Render
			expect(ir.render).toHaveLength(1);
			expect(ir.render[0].kind).toBe("element");
			expect(ir.render[0].tag).toBe("button");

			// Event
			expect(ir.render[0].events).toHaveLength(1);
			expect(ir.render[0].events[0].event).toBe("click");
			expect(ir.render[0].events[0].handler).toEqual({
				kind: "action-call",
				name: "increment",
				args: [],
			});

			// Text children
			expect(ir.render[0].children).toHaveLength(2);
			expect(ir.render[0].children[0]).toEqual({ kind: "text", value: "Count is " });
			expect(ir.render[0].children[1]).toEqual({
				kind: "reactive-text",
				source: { kind: "state-read", name: "count" },
			});

			// Empty sections
			expect(ir.props).toEqual([]);
			expect(ir.attrs).toEqual([]);
			expect(ir.emits).toEqual([]);
			expect(ir.lifecycle).toEqual({});
		});

		it("compiles end-to-end", () => {
			const code = readExample("counter-button");
			const ir = frontend.toIR(code, "counter-button.tsx");
			const result = compile(ir);
			expect(result.code).toContain("defineComponent");
			expect(result.code).toContain("counter-button");
		});

		it("preserves side-effect CSS imports", () => {
			const code = readExample("counter-button");
			const ir = frontend.toIR(code, "counter-button.tsx");
			const result = compile(ir);

			expect(result.code).toContain('import "./styles.css";');
		});
	});

	describe("derived-count reference translation", () => {
		it("produces correct computed state", () => {
			const code = readExample("derived-count");
			const ir = frontend.toIR(code, "derived-count.tsx");

			expect(ir.state).toHaveLength(4);
			expect(ir.state[0]).toEqual({ kind: "value", name: "count", initial: 0 });

			expect(ir.state[1].kind).toBe("computed");
			expect(ir.state[1].name).toBe("doubled");
			expect(ir.state[1].body).toEqual({
				kind: "binary",
				op: "*",
				left: { kind: "state-read", name: "count" },
				right: { kind: "literal", value: 2 },
			});

			expect(ir.state[2].kind).toBe("computed");
			expect(ir.state[2].name).toBe("quadrupled");
			expect(ir.state[2].body).toEqual({
				kind: "binary",
				op: "*",
				left: { kind: "computed-read", name: "doubled" },
				right: { kind: "literal", value: 2 },
			});
		});
	});

	describe("hello-world reference translation", () => {
		it("produces correct two-way binding MIR", () => {
			const code = readExample("hello-world");
			const ir = frontend.toIR(code, "hello-world.tsx");

			expect(ir.tagName).toBe("hello-world");
			expect(ir.state[0]).toEqual({ kind: "value", name: "name", initial: "World" });

			// Action: updateName strips TS annotation
			expect(ir.actions[0].name).toBe("updateName");
			expect(ir.actions[0].params).toEqual(["e"]);
			expect(ir.actions[0].body.kind).toBe("state-write");

			// Render: 3 root elements
			expect(ir.render).toHaveLength(3);
			expect(ir.render[0].tag).toBe("label");
			expect(ir.render[1].tag).toBe("input");
			expect(ir.render[2].tag).toBe("p");

			// Input has reactive value and event
			expect(ir.render[1].attributes.value).toEqual({
				kind: "state-read",
				name: "name",
			});
			expect(ir.render[1].events[0].event).toBe("input");
		});
	});

	describe("component-props: multi-component file", () => {
		it("extracts two components", () => {
			const code = readExample("component-props");
			const ir = frontend.toIR(code, "component-props.tsx");

			expect(Array.isArray(ir)).toBe(true);
			expect(ir).toHaveLength(2);
			expect(ir[0].tagName).toBe("roqa-app");
			expect(ir[1].tagName).toBe("name-tag");
		});

		it("extracts props from destructured parameter", () => {
			const code = readExample("component-props");
			const ir = frontend.toIR(code, "component-props.tsx");

			const nameTag = ir[1];
			expect(nameTag.props).toHaveLength(2);
			expect(nameTag.props[0].name).toBe("name");
			expect(nameTag.props[1].name).toBe("message");
		});
	});

	describe("todo-list: For component", () => {
		it("produces EachIR from <For>", () => {
			const code = readExample("todo-list");
			const ir = frontend.toIR(code, "todo-list.tsx");

			// Find the For/each node
			const section = ir.render.find((n) => n.kind === "element" && n.tag === "section");
			expect(section).toBeDefined();
			const each = section.children.find((n) => n.kind === "each");
			expect(each).toBeDefined();
			expect(each.source).toEqual({ kind: "cell-ref", name: "todos" });
			expect(each.itemAlias).toBe("todo");
		});
	});

	describe("life-cycle: lifecycle hooks", () => {
		it("extracts onConnect and onDisconnect", () => {
			const code = readExample("life-cycle");
			const ir = frontend.toIR(code, "life-cycle.tsx");

			expect(ir.lifecycle.onConnect).toBeDefined();
			expect(ir.lifecycle.onDisconnect).toBeDefined();
		});
	});

	describe("all examples compile end-to-end", () => {
		const examples = [
			"counter-button",
			"hello-world",
			"derived-count",
			"bound-values",
			"temp-converter",
			"slider-math",
			"add-numbers",
			"with-tailwind",
			"todo-list",
			"flight-booker",
			"stop-watch",
			"component-props",
			"life-cycle",
			"mouse-position",
			"message-passing",
			"with-web-components",
			"hacker-news",
			"data-visualization",
			"three-js",
			"kanban-board",
		];

		for (const name of examples) {
			it(`compiles ${name}`, () => {
				const mainPath = resolve(examplesDir, name, "src/main.tsx");
				if (!existsSync(mainPath)) return;
				const code = readFileSync(mainPath, "utf-8");
				const ir = frontend.toIR(code, mainPath);
				const result = compile(ir);
				expect(result.code.length).toBeGreaterThan(0);
			});
		}
	});

	describe("sub-component files compile", () => {
		const subFiles = [
			"hacker-news/src/story-item.tsx",
			"hacker-news/src/story-list.tsx",
			"hacker-news/src/comment-item.tsx",
			"hacker-news/src/header.tsx",
			"hacker-news/src/comment-page.tsx",
			"message-passing/src/counter.tsx",
		];

		for (const file of subFiles) {
			it(`compiles ${file}`, () => {
				const filePath = resolve(examplesDir, file);
				if (!existsSync(filePath)) return;
				const code = readFileSync(filePath, "utf-8");
				const ir = frontend.toIR(code, filePath);
				const result = compile(ir);
				expect(result.code.length).toBeGreaterThan(0);
			});
		}
	});
});
