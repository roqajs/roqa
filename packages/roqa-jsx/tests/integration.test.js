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

describe("integration: JSX → MIR → JS", () => {
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
		it("produces correct MIR", () => {
			const code = readExample("counter-button");
			const mir = frontend.toMIR(code, "counter-button.tsx");

			expect(mir.version).toBe(1);
			expect(mir.tagName).toBe("counter-button");
			expect(mir.name).toBe("App");

			// State
			expect(mir.state).toHaveLength(1);
			expect(mir.state[0]).toEqual({ kind: "value", name: "count", initial: 0 });

			// Actions
			expect(mir.actions).toHaveLength(1);
			expect(mir.actions[0].name).toBe("increment");
			expect(mir.actions[0].body.kind).toBe("state-write");
			expect(mir.actions[0].body.name).toBe("count");

			// Render
			expect(mir.render).toHaveLength(1);
			expect(mir.render[0].kind).toBe("element");
			expect(mir.render[0].tag).toBe("button");

			// Event
			expect(mir.render[0].events).toHaveLength(1);
			expect(mir.render[0].events[0].event).toBe("click");
			expect(mir.render[0].events[0].handler).toEqual({
				kind: "action-call",
				name: "increment",
				args: [],
			});

			// Text children
			expect(mir.render[0].children).toHaveLength(2);
			expect(mir.render[0].children[0]).toEqual({ kind: "text", value: "Count is " });
			expect(mir.render[0].children[1]).toEqual({
				kind: "reactive-text",
				source: { kind: "state-read", name: "count" },
			});

			// Empty sections
			expect(mir.props).toEqual([]);
			expect(mir.attrs).toEqual([]);
			expect(mir.emits).toEqual([]);
			expect(mir.lifecycle).toEqual({});
		});

		it("compiles end-to-end", () => {
			const code = readExample("counter-button");
			const mir = frontend.toMIR(code, "counter-button.tsx");
			const result = compile(mir);
			expect(result.code).toContain("defineComponent");
			expect(result.code).toContain("counter-button");
		});

		it("preserves side-effect CSS imports", () => {
			const code = readExample("counter-button");
			const mir = frontend.toMIR(code, "counter-button.tsx");
			const result = compile(mir);

			expect(result.code).toContain('import "./styles.css";');
		});
	});

	describe("derived-count reference translation", () => {
		it("produces correct computed state", () => {
			const code = readExample("derived-count");
			const mir = frontend.toMIR(code, "derived-count.tsx");

			expect(mir.state).toHaveLength(4);
			expect(mir.state[0]).toEqual({ kind: "value", name: "count", initial: 0 });

			expect(mir.state[1].kind).toBe("computed");
			expect(mir.state[1].name).toBe("doubled");
			expect(mir.state[1].body).toEqual({
				kind: "binary",
				op: "*",
				left: { kind: "state-read", name: "count" },
				right: { kind: "literal", value: 2 },
			});

			expect(mir.state[2].kind).toBe("computed");
			expect(mir.state[2].name).toBe("quadrupled");
			expect(mir.state[2].body).toEqual({
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
			const mir = frontend.toMIR(code, "hello-world.tsx");

			expect(mir.tagName).toBe("hello-world");
			expect(mir.state[0]).toEqual({ kind: "value", name: "name", initial: "World" });

			// Action: updateName strips TS annotation
			expect(mir.actions[0].name).toBe("updateName");
			expect(mir.actions[0].params).toEqual(["e"]);
			expect(mir.actions[0].body.kind).toBe("state-write");

			// Render: 3 root elements
			expect(mir.render).toHaveLength(3);
			expect(mir.render[0].tag).toBe("label");
			expect(mir.render[1].tag).toBe("input");
			expect(mir.render[2].tag).toBe("p");

			// Input has reactive value and event
			expect(mir.render[1].attributes.value).toEqual({
				kind: "state-read",
				name: "name",
			});
			expect(mir.render[1].events[0].event).toBe("input");
		});
	});

	describe("component-props: multi-component file", () => {
		it("extracts two components", () => {
			const code = readExample("component-props");
			const mir = frontend.toMIR(code, "component-props.tsx");

			expect(Array.isArray(mir)).toBe(true);
			expect(mir).toHaveLength(2);
			expect(mir[0].tagName).toBe("roqa-app");
			expect(mir[1].tagName).toBe("name-tag");
		});

		it("extracts props from destructured parameter", () => {
			const code = readExample("component-props");
			const mir = frontend.toMIR(code, "component-props.tsx");

			const nameTag = mir[1];
			expect(nameTag.props).toHaveLength(2);
			expect(nameTag.props[0].name).toBe("name");
			expect(nameTag.props[1].name).toBe("message");
		});
	});

	describe("todo-list: For component", () => {
		it("produces EachIR from <For>", () => {
			const code = readExample("todo-list");
			const mir = frontend.toMIR(code, "todo-list.tsx");

			// Find the For/each node
			const section = mir.render.find((n) => n.kind === "element" && n.tag === "section");
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
			const mir = frontend.toMIR(code, "life-cycle.tsx");

			expect(mir.lifecycle.onConnect).toBeDefined();
			expect(mir.lifecycle.onDisconnect).toBeDefined();
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
				const mir = frontend.toMIR(code, mainPath);
				const result = compile(mir);
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
				const mir = frontend.toMIR(code, filePath);
				const result = compile(mir);
				expect(result.code.length).toBeGreaterThan(0);
			});
		}
	});
});
