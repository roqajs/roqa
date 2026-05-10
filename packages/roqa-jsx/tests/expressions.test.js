import { describe, it, expect } from "vitest";
import { convertExpr, createExprContext } from "../src/expressions.js";
import { parse } from "../src/parse.js";
import * as t from "@babel/types";

/**
 * Helper: parse a single expression and return the AST node.
 */
function parseExpr(code) {
	const ast = parse(`(${code})`, "test.tsx");
	const stmt = ast.program.body[0];
	return stmt.expression;
}

function makeCtx(cells = {}, actions = [], props = [], params = [], imports = {}) {
	const ctx = createExprContext();
	for (const [name, kind] of Object.entries(cells)) {
		ctx.cells.set(name, kind);
	}
	for (const a of actions) ctx.actions.add(a);
	for (const p of props) ctx.props.add(p);
	for (const p of params) ctx.params.add(p);
	for (const [name, info] of Object.entries(imports)) {
		ctx.imports.set(name, info);
	}
	return ctx;
}

describe("convertExpr", () => {
	describe("literals", () => {
		it("converts numeric literals", () => {
			const node = parseExpr("42");
			const result = convertExpr(node, createExprContext());
			expect(result).toEqual({ kind: "literal", value: 42 });
		});

		it("converts string literals", () => {
			const node = parseExpr('"hello"');
			const result = convertExpr(node, createExprContext());
			expect(result).toEqual({ kind: "literal", value: "hello" });
		});

		it("converts boolean literals", () => {
			const node = parseExpr("true");
			const result = convertExpr(node, createExprContext());
			expect(result).toEqual({ kind: "literal", value: true });
		});

		it("converts null", () => {
			const node = parseExpr("null");
			const result = convertExpr(node, createExprContext());
			expect(result).toEqual({ kind: "literal", value: null });
		});
	});

	describe("get() and set()", () => {
		it("converts get(valueCell) to StateReadExpr", () => {
			const node = parseExpr("get(count)");
			const ctx = makeCtx({ count: "value" });
			const result = convertExpr(node, ctx);
			expect(result).toEqual({ kind: "state-read", name: "count" });
		});

		it("converts get(computedCell) to ComputedReadExpr", () => {
			const node = parseExpr("get(doubled)");
			const ctx = makeCtx({ doubled: "computed" });
			const result = convertExpr(node, ctx);
			expect(result).toEqual({ kind: "computed-read", name: "doubled" });
		});

		it("converts set(cell, value) to StateWriteExpr", () => {
			const node = parseExpr("set(count, 42)");
			const ctx = makeCtx({ count: "value" });
			const result = convertExpr(node, ctx);
			expect(result).toEqual({
				kind: "state-write",
				name: "count",
				value: { kind: "literal", value: 42 },
			});
		});

		it("converts set() with complex value expression", () => {
			const node = parseExpr("set(count, get(count) + 1)");
			const ctx = makeCtx({ count: "value" });
			const result = convertExpr(node, ctx);
			expect(result.kind).toBe("state-write");
			expect(result.value.kind).toBe("binary");
			expect(result.value.op).toBe("+");
		});
	});

	describe("binary expressions", () => {
		it("converts addition", () => {
			const node = parseExpr("1 + 2");
			const result = convertExpr(node, createExprContext());
			expect(result).toEqual({
				kind: "binary",
				op: "+",
				left: { kind: "literal", value: 1 },
				right: { kind: "literal", value: 2 },
			});
		});

		it("converts comparison operators", () => {
			const node = parseExpr("a === b");
			const ctx = createExprContext();
			const result = convertExpr(node, ctx);
			expect(result.kind).toBe("binary");
			expect(result.op).toBe("===");
		});

		it("normalizes == to ===", () => {
			const node = parseExpr("a == b");
			const result = convertExpr(node, createExprContext());
			expect(result.op).toBe("===");
		});
	});

	describe("unary expressions", () => {
		it("converts logical not", () => {
			const node = parseExpr("!x");
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("unary");
			expect(result.op).toBe("!");
		});

		it("converts negation", () => {
			const node = parseExpr("-x");
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("unary");
			expect(result.op).toBe("-");
		});
	});

	describe("conditional expressions", () => {
		it("converts ternary", () => {
			const node = parseExpr('x ? "yes" : "no"');
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("conditional");
			expect(result.consequent).toEqual({ kind: "literal", value: "yes" });
			expect(result.alternate).toEqual({ kind: "literal", value: "no" });
		});
	});

	describe("member expressions", () => {
		it("converts property access", () => {
			const node = parseExpr("e.target");
			const ctx = makeCtx({}, [], [], ["e"]);
			const result = convertExpr(node, ctx);
			expect(result).toEqual({
				kind: "member",
				object: { kind: "local-read", name: "e" },
				property: "target",
			});
		});

		it("converts chained property access", () => {
			const node = parseExpr("e.target.value");
			const ctx = makeCtx({}, [], [], ["e"]);
			const result = convertExpr(node, ctx);
			expect(result.kind).toBe("member");
			expect(result.property).toBe("value");
			expect(result.object.kind).toBe("member");
		});

		it("converts item field access inside For", () => {
			const node = parseExpr("todo.text");
			const ctx = makeCtx();
			ctx.itemAlias = "todo";
			const result = convertExpr(node, ctx);
			expect(result).toEqual({
				kind: "member",
				object: { kind: "local-read", name: "todo" },
				property: "text",
			});
		});
	});

	describe("call expressions", () => {
		it("converts action calls", () => {
			const node = parseExpr("increment()");
			const ctx = makeCtx({}, ["increment"]);
			const result = convertExpr(node, ctx);
			expect(result).toEqual({ kind: "action-call", name: "increment", args: [] });
		});

		it("converts method calls", () => {
			const node = parseExpr("arr.filter(x => x > 0)");
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("method-call");
			expect(result.method).toBe("filter");
		});

		it("converts this.emit()", () => {
			const node = parseExpr('this.emit("count-changed", { count: 1 })');
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("emit");
			expect(result.event).toBe("count-changed");
		});
	});

	describe("arrow functions", () => {
		it("converts to ClosureExpr", () => {
			const node = parseExpr("(x) => x + 1");
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("closure");
			expect(result.params).toEqual(["x"]);
			expect(result.body.kind).toBe("binary");
		});
	});

	describe("template literals", () => {
		it("converts template literals", () => {
			const node = parseExpr("`Hello ${name}`");
			const ctx = makeCtx({}, [], [], ["name"]);
			const result = convertExpr(node, ctx);
			expect(result.kind).toBe("template-literal");
			expect(result.parts[0]).toBe("Hello ");
			expect(result.parts[1].kind).toBe("local-read");
		});
	});

	describe("identifier resolution", () => {
		it("resolves props to PropReadExpr", () => {
			const node = parseExpr("label");
			const ctx = makeCtx({}, [], ["label"]);
			const result = convertExpr(node, ctx);
			expect(result).toEqual({ kind: "prop-read", name: "label" });
		});

		it("resolves params to LocalReadExpr", () => {
			const node = parseExpr("e");
			const ctx = makeCtx({}, [], [], ["e"]);
			const result = convertExpr(node, ctx);
			expect(result).toEqual({ kind: "local-read", name: "e" });
		});

		it("resolves imports to ImportedRefExpr", () => {
			const node = parseExpr("formatDate");
			const ctx = makeCtx({}, [], [], [], { formatDate: { source: "./utils.js" } });
			const result = convertExpr(node, ctx);
			expect(result.kind).toBe("imported-ref");
			expect(result.source).toBe("./utils.js");
		});

		it("resolves known globals to ExternalRefExpr", () => {
			const node = parseExpr("Math");
			const result = convertExpr(node, createExprContext());
			expect(result).toEqual({ kind: "external-ref", name: "Math" });
		});

		it("resolves bare cell to state-read", () => {
			const node = parseExpr("count");
			const ctx = makeCtx({ count: "value" });
			const result = convertExpr(node, ctx);
			expect(result).toEqual({ kind: "state-read", name: "count" });
		});
	});

	describe("TypeScript handling", () => {
		it("unwraps TSAsExpression", () => {
			const node = parseExpr("(e.target as HTMLInputElement).value");
			const ctx = makeCtx({}, [], [], ["e"]);
			const result = convertExpr(node, ctx);
			expect(result.kind).toBe("member");
			expect(result.property).toBe("value");
		});
	});

	describe("object expressions", () => {
		it("converts simple objects", () => {
			const node = parseExpr('({ text: "hello", completed: false })');
			const result = convertExpr(node, createExprContext());
			expect(result.kind).toBe("object");
			expect(result.properties).toHaveLength(2);
			expect(result.properties[0].key).toBe("text");
		});
	});
});
