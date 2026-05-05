import { describe, it, expect } from "vitest";
import { compileExpr } from "../../src/compiler/expr-compiler.js";

describe("compileExpr", () => {
	it("compiles literal number", () => {
		expect(compileExpr({ kind: "literal", value: 42 })).toBe("42");
	});

	it("compiles literal string", () => {
		expect(compileExpr({ kind: "literal", value: "hello" })).toBe('"hello"');
	});

	it("compiles literal null", () => {
		expect(compileExpr({ kind: "literal", value: null })).toBe("null");
	});

	it("compiles state-read", () => {
		expect(compileExpr({ kind: "state-read", name: "count" })).toBe("count.v");
	});

	it("compiles binary expression", () => {
		const expr = {
			kind: "binary",
			op: "+",
			left: { kind: "state-read", name: "count" },
			right: { kind: "literal", value: 1 },
		};
		expect(compileExpr(expr)).toBe("count.v + 1");
	});

	it("compiles unary not", () => {
		const expr = {
			kind: "unary",
			op: "!",
			operand: { kind: "state-read", name: "visible" },
		};
		expect(compileExpr(expr)).toBe("!visible.v");
	});

	it("compiles member expression", () => {
		const expr = {
			kind: "member",
			object: { kind: "local-read", name: "e" },
			property: "target",
		};
		expect(compileExpr(expr)).toBe("e.target");
	});

	it("compiles action-call with no args", () => {
		expect(compileExpr({ kind: "action-call", name: "increment", args: [] })).toBe("increment()");
	});

	it("compiles emit", () => {
		const expr = {
			kind: "emit",
			event: "count-changed",
			detail: { kind: "state-read", name: "count" },
		};
		expect(compileExpr(expr)).toBe('this.emit("count-changed", count.v)');
	});

	it("compiles external-ref with path", () => {
		const expr = {
			kind: "external-ref",
			name: "Math",
			path: ["floor"],
		};
		expect(compileExpr(expr)).toBe("Math.floor");
	});

	it("compiles attr-read", () => {
		expect(compileExpr({ kind: "attr-read", name: "variant" })).toBe('this.getAttribute("variant")');
	});

	it("compiles local-read", () => {
		expect(compileExpr({ kind: "local-read", name: "todo" })).toBe("todo");
	});

	it("compiles let", () => {
		const expr = {
			kind: "let",
			name: "x",
			value: { kind: "binary", op: "+", left: { kind: "literal", value: 1 }, right: { kind: "literal", value: 2 } },
		};
		expect(compileExpr(expr)).toBe("let x = 1 + 2");
	});

	it("compiles closure with block body", () => {
		const expr = {
			kind: "closure",
			params: ["e"],
			body: {
				kind: "state-write",
				name: "draft",
				value: { kind: "member", object: { kind: "member", object: { kind: "local-read", name: "e" }, property: "target" }, property: "value" },
			},
		};
		const result = compileExpr(expr, { isInlineHandler: true });
		expect(result).toContain("(e) => {");
		expect(result).toContain("draft.v = e.target.value");
	});

	it("compiles object expression", () => {
		const expr = {
			kind: "object",
			properties: [
				{ kind: "property", key: "id", value: { kind: "literal", value: 1 } },
				{ kind: "spread", argument: { kind: "local-read", name: "t" } },
			],
		};
		expect(compileExpr(expr)).toBe("{ id: 1, ...t }");
	});

	it("compiles template-literal", () => {
		const expr = {
			kind: "template-literal",
			parts: ["Hello ", { kind: "state-read", name: "name" }, "!"],
		};
		expect(compileExpr(expr)).toBe('"Hello " + name.v + "!"');
	});
});
