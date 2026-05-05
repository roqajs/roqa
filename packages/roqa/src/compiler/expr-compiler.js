/** @typedef {import("./types.d.ts").ExprIR} ExprIR */
/** @typedef {import("./types.d.ts").ClosureParam} ClosureParam */

/**
 * @typedef {Object} ExprContext
 * @property {boolean} [isInlineHandler] - Inside an inline event handler
 * @property {string} [componentName] - Component function name
 * @property {Map<string, string>} [collectionKeys] - Collection name → key field.
 *   When a collection-op (`remove`, `update`) targets a name in this map, the
 *   compiler uses the declared key field instead of the default `id`.
 */

/**
 * Compile an ExprIR tree into a JavaScript code fragment.
 * @param {ExprIR} expr
 * @param {ExprContext} [ctx]
 * @returns {string}
 */
export function compileExpr(expr, ctx = {}) {
	switch (expr.kind) {
		case "literal":
			return compileLiteral(expr.value);

		case "template-literal":
			return compileTemplateLiteral(expr, ctx);

		case "object":
			return compileObject(expr, ctx);

		case "array":
			return `[${expr.elements.map((e) => compileExpr(e, ctx)).join(", ")}]`;

		case "assign":
			return `${compileExpr(expr.target, ctx)} ${expr.op} ${compileExpr(expr.value, ctx)}`;

		case "update":
			if (expr.prefix) return `${expr.op}${compileExpr(expr.target, ctx)}`;
			return `${compileExpr(expr.target, ctx)}${expr.op}`;

		case "state-read":
			return `${expr.name}.v`;

		case "state-write":
			if (ctx.isInlineHandler) {
				return `${expr.name}.v = ${compileExpr(expr.value, ctx)}`;
			}
			return `${expr.name}.v = ${compileExpr(expr.value, ctx)}`;

		case "computed-read":
			return `${expr.name}.v`;

		case "prop-read":
			if (expr.path && expr.path.length > 0) {
				return `${expr.name}.${expr.path.join(".")}`;
			}
			return expr.name;

		case "attr-read":
			return `this.getAttribute("${expr.name}")`;

		case "local-read":
			return expr.name;

		case "let":
			return `let ${expr.name} = ${compileExpr(expr.value, ctx)}`;

		case "binary":
			return compileBinary(expr, ctx);

		case "unary":
			return compileUnary(expr, ctx);

		case "conditional":
			return `${compileExpr(expr.test, ctx)} ? ${compileExpr(expr.consequent, ctx)} : ${compileExpr(expr.alternate, ctx)}`;

		case "member":
			return `${compileReceiver(expr.object, ctx)}.${expr.property}`;

		case "index":
			return `${compileReceiver(expr.object, ctx)}[${compileExpr(expr.index, ctx)}]`;

		case "spread":
			return `...${compileExpr(expr.argument, ctx)}`;

		case "call":
			return `${compileReceiver(expr.callee, ctx)}(${expr.args.map((a) => compileExpr(a, ctx)).join(", ")})`;

		case "method-call":
			return `${compileReceiver(expr.object, ctx)}.${expr.method}(${expr.args.map((a) => compileExpr(a, ctx)).join(", ")})`;

		case "new":
			return `new ${compileReceiver(expr.callee, ctx)}(${expr.args.map((a) => compileExpr(a, ctx)).join(", ")})`;

		case "block":
			return expr.body.map((e) => compileExpr(e, ctx)).join(";\n");

		case "return":
			return expr.value === undefined ? "return" : `return ${compileExpr(expr.value, ctx)}`;

		case "closure":
			return compileClosure(expr, ctx);

		case "collection-op":
			return compileCollectionOp(expr, ctx);

		case "emit":
			if (expr.detail) {
				return `this.emit("${expr.event}", ${compileExpr(expr.detail, ctx)})`;
			}
			return `this.emit("${expr.event}")`;

		case "action-call":
			if (expr.args.length === 0) {
				return `${expr.name}()`;
			}
			return `${expr.name}(${expr.args.map((a) => compileExpr(a, ctx)).join(", ")})`;

		case "imported-ref":
			return expr.name;

		case "external-ref":
			if (expr.path && expr.path.length > 0) {
				return `${expr.name}.${expr.path.join(".")}`;
			}
			return expr.name;

		case "opaque":
			return expr.source;

		default:
			throw new Error(`Unknown expression kind: ${/** @type {any} */ (expr).kind}`);
	}
}

/**
 * Compile an expression in receiver position (e.g. left side of `.member`,
 * callee of `f(...)`). Wraps in parentheses when the expression's outer
 * grammar would bind less tightly than property access — this is required for
 * literals like `(32).toFixed(1)` and for binary/conditional/assignment
 * receivers.
 *
 * @param {ExprIR} expr
 * @param {ExprContext} [ctx]
 * @returns {string}
 */
function compileReceiver(expr, ctx) {
	const code = compileExpr(expr, ctx);
	if (needsReceiverParens(expr, code)) {
		return `(${code})`;
	}
	return code;
}

/**
 * @param {ExprIR} expr
 * @param {string} code
 * @returns {boolean}
 */
function needsReceiverParens(expr, code) {
	switch (expr.kind) {
		case "binary":
		case "unary":
		case "conditional":
		case "spread":
		case "object":
		case "closure":
			return true;
		case "literal":
			// Numeric literals followed by `.` would be parsed as decimals.
			return typeof expr.value === "number";
		case "opaque":
			// Opaque source may itself be a complex expression — wrap defensively
			// when it doesn't already start with `(` or look like a simple
			// identifier / member chain.
			return /[+\-*/%<>=&|?:,]/.test(code) && !/^\s*\(/.test(code);
		default:
			return false;
	}
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function compileLiteral(value) {
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	return String(value);
}

/**
 * @param {import("./types.d.ts").TemplateLiteralExpr} expr
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileTemplateLiteral(expr, ctx) {
	const parts = expr.parts.map((part) => {
		if (typeof part === "string") {
			return JSON.stringify(part);
		}
		return compileExpr(part, ctx);
	});
	return parts.join(" + ");
}

/**
 * @param {import("./types.d.ts").ObjectExpr} expr
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileObject(expr, ctx) {
	const props = expr.properties.map((prop) => {
		if (prop.kind === "spread") {
			return `...${compileExpr(prop.argument, ctx)}`;
		}
		return `${prop.key}: ${compileExpr(prop.value, ctx)}`;
	});
	return `{ ${props.join(", ")} }`;
}

/**
 * @param {import("./types.d.ts").BinaryExpr} expr
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileBinary(expr, ctx) {
	const left = compileBinaryOperand(expr.left, expr.op, "left", ctx);
	const right = compileBinaryOperand(expr.right, expr.op, "right", ctx);
	return `${left} ${expr.op} ${right}`;
}

/**
 * @param {ExprIR} operand
 * @param {string} parentOp
 * @param {"left" | "right"} side
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileBinaryOperand(operand, parentOp, side, ctx) {
	const code = compileExpr(operand, ctx);
	if (operand.kind !== "binary" && operand.kind !== "conditional") {
		return code;
	}
	if (operand.kind === "conditional") {
		return `(${code})`;
	}
	const childPrec = binaryPrecedence(operand.op);
	const parentPrec = binaryPrecedence(parentOp);
	if (childPrec < parentPrec) return `(${code})`;
	if (childPrec === parentPrec) {
		// Most binary operators are left-associative; right operand needs parens
		// when it shares precedence so that `a - (b - c)` doesn't become `a - b - c`.
		if (side === "right") return `(${code})`;
	}
	return code;
}

/**
 * @param {string} op
 * @returns {number}
 */
function binaryPrecedence(op) {
	switch (op) {
		case "||":
		case "??":
			return 1;
		case "&&":
			return 2;
		case "==":
		case "===":
		case "!=":
		case "!==":
			return 3;
		case "<":
		case "<=":
		case ">":
		case ">=":
			return 4;
		case "+":
		case "-":
			return 5;
		case "*":
		case "/":
		case "%":
			return 6;
		default:
			return 0;
	}
}

/**
 * @param {import("./types.d.ts").UnaryExpr} expr
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileUnary(expr, ctx) {
	const operand = compileExpr(expr.operand, ctx);
	if (expr.op === "typeof") {
		return `typeof ${operand}`;
	}
	return `${expr.op}${operand}`;
}

/**
 * @param {import("./types.d.ts").ClosureExpr} expr
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileClosure(expr, ctx) {
	const params = expr.params.map((p) => compileClosureParam(p)).join(", ");
	const body = compileExpr(expr.body, ctx);
	const asyncPrefix = expr.async ? "async " : "";
	// Use block syntax for statement-like bodies
	const needsBlock = expr.body.kind === "state-write" || expr.body.kind === "block" ||
		expr.body.kind === "collection-op";
	if (needsBlock) {
		return `${asyncPrefix}(${params}) => {\n\t\t\t${body};\n\t\t}`;
	}
	// Object literal expression bodies must be wrapped in parens; otherwise
	// the parser treats `{ ... }` as a block statement.
	if (expr.body.kind === "object") {
		return `${asyncPrefix}(${params}) => (${body})`;
	}
	return `${asyncPrefix}(${params}) => ${body}`;
}

/**
 * @param {ClosureParam} param
 * @returns {string}
 */
function compileClosureParam(param) {
	if (typeof param === "string") return param;

	// Destructured parameter
	if (param.pattern === "object") {
		const bindings = param.bindings.map((b) => {
			if (b.alias) return `${b.key}: ${b.alias}`;
			return b.key;
		});
		const rest = param.rest ? `, ...${param.rest}` : "";
		return `{ ${bindings.join(", ")}${rest} }`;
	}

	// Array pattern
	const bindings = param.bindings.map((b) => b.alias || b.key);
	const rest = param.rest ? `, ...${param.rest}` : "";
	return `[${bindings.join(", ")}${rest}]`;
}

/**
 * @param {import("./types.d.ts").CollectionOpExpr} expr
 * @param {ExprContext} ctx
 * @returns {string}
 */
function compileCollectionOp(expr, ctx) {
	const name = expr.name;
	const keyField = ctx.collectionKeys?.get(name) ?? "id";
	switch (expr.op) {
		case "insert":
			return `${name}.v = [...${name}.v, ${compileExpr(expr.args[0], ctx)}]`;
		case "remove":
			return `${name}.v = ${name}.v.filter((t) => t.${keyField} !== ${compileExpr(expr.args[0], ctx)})`;
		case "update": {
			const id = compileExpr(expr.args[0], ctx);
			const closureArg = expr.args[1];
			if (closureArg.kind === "closure" && closureArg.params.length === 1) {
				// Inline the closure: (param) => body becomes the map callback body
				const param = typeof closureArg.params[0] === "string" ? closureArg.params[0] : "t";
				const body = compileExpr(closureArg.body, ctx);
				return `${name}.v = ${name}.v.map((${param}) => ${param}.${keyField} === ${id} ? ${body} : ${param})`;
			}
			const fn = compileExpr(closureArg, ctx);
			return `${name}.v = ${name}.v.map((t) => t.${keyField} === ${id} ? ${fn}(t) : t)`;
		}
		case "remove-where": {
			const fn = compileExpr(expr.args[0], ctx);
			return `${name}.v = ${name}.v.filter((t) => !${fn}(t))`;
		}
		case "clear":
			return `${name}.v = []`;
		default:
			throw new Error(`Unknown collection op: ${expr.op}`);
	}
}

/**
 * Compile an expression specifically for a computed cell body.
 * Returns a function expression: () => <compiled body>.
 * @param {ExprIR} body
 * @returns {string}
 */
export function compileComputedBody(body) {
	return `() => ${compileExpr(body)}`;
}

/**
 * Get the "expanded" body of a computed expression, with all computed-read
 * references recursively replaced by their expanded bodies.
 * This is used for inlining in binding update expressions.
 * @param {ExprIR} body - The computed cell body expression
 * @param {Map<string, ExprIR>} computedBodies - Map of computed name → body ExprIR
 * @param {Set<string>} [visited] - Cycle detection
 * @returns {string}
 */
export function compileExpandedExpr(body, computedBodies, visited = new Set()) {
	return expandExpr(body, computedBodies, visited);
}

/**
 * @param {ExprIR} expr
 * @param {Map<string, ExprIR>} computedBodies
 * @param {Set<string>} visited
 * @returns {string}
 */
function expandExpr(expr, computedBodies, visited) {
	switch (expr.kind) {
		case "computed-read": {
			if (visited.has(expr.name)) {
				return `${expr.name}.v`; // Cycle — bail
			}
			const computedBody = computedBodies.get(expr.name);
			if (computedBody) {
				visited.add(expr.name);
				const expanded = expandExpr(computedBody, computedBodies, visited);
				visited.delete(expr.name);
				return expanded;
			}
			return `${expr.name}.v`;
		}
		case "state-read":
			return `${expr.name}.v`;
		case "binary": {
			const left = expandExpr(expr.left, computedBodies, visited);
			const right = expandExpr(expr.right, computedBodies, visited);
			return `${left} ${expr.op} ${right}`;
		}
		case "unary": {
			const operand = expandExpr(expr.operand, computedBodies, visited);
			if (expr.op === "typeof") return `typeof ${operand}`;
			return `${expr.op}${operand}`;
		}
		case "call": {
			const callee = expandExpr(expr.callee, computedBodies, visited);
			const args = expr.args.map((a) => expandExpr(a, computedBodies, visited));
			return `${callee}(${args.join(", ")})`;
		}
		case "method-call": {
			const obj = expandExpr(expr.object, computedBodies, visited);
			const args = expr.args.map((a) => expandExpr(a, computedBodies, visited));
			return `${obj}.${expr.method}(${args.join(", ")})`;
		}
		case "member":
			return `${expandExpr(expr.object, computedBodies, visited)}.${expr.property}`;
		case "closure": {
			const params = expr.params.map((p) => compileClosureParam(p)).join(", ");
			const body = expandExpr(expr.body, computedBodies, visited);
			return `(${params}) => ${body}`;
		}
		case "conditional": {
			const test = expandExpr(expr.test, computedBodies, visited);
			const consequent = expandExpr(expr.consequent, computedBodies, visited);
			const alternate = expandExpr(expr.alternate, computedBodies, visited);
			return `${test} ? ${consequent} : ${alternate}`;
		}
		case "template-literal": {
			const parts = expr.parts.map((part) => {
				if (typeof part === "string") return JSON.stringify(part);
				return expandExpr(part, computedBodies, visited);
			});
			return parts.join(" + ");
		}
		default:
			return compileExpr(expr);
	}
}
