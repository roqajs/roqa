/** @typedef {import("./types.d.ts").ExprIR} ExprIR */
/** @typedef {import("./types.d.ts").ClosureParam} ClosureParam */

/**
 * @typedef {Object} ExprContext
 * @property {string} [itemAlias] - Current iteration variable name
 * @property {boolean} [isInlineHandler] - Inside an inline event handler
 * @property {string} [componentName] - Component function name
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

		case "param-read":
			return expr.name;

		case "item-field-read":
			return `${ctx.itemAlias || "item"}.${expr.field}`;

		case "binary":
			return compileBinary(expr, ctx);

		case "unary":
			return compileUnary(expr, ctx);

		case "conditional":
			return `${compileExpr(expr.test, ctx)} ? ${compileExpr(expr.consequent, ctx)} : ${compileExpr(expr.alternate, ctx)}`;

		case "member":
			return `${compileExpr(expr.object, ctx)}.${expr.property}`;

		case "index":
			return `${compileExpr(expr.object, ctx)}[${compileExpr(expr.index, ctx)}]`;

		case "spread":
			return `...${compileExpr(expr.argument, ctx)}`;

		case "call":
			return `${compileExpr(expr.callee, ctx)}(${expr.args.map((a) => compileExpr(a, ctx)).join(", ")})`;

		case "method-call":
			return `${compileExpr(expr.object, ctx)}.${expr.method}(${expr.args.map((a) => compileExpr(a, ctx)).join(", ")})`;

		case "block":
			return expr.body.map((e) => compileExpr(e, ctx)).join(";\n");

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
	const left = compileExpr(expr.left, ctx);
	const right = compileExpr(expr.right, ctx);
	return `${left} ${expr.op} ${right}`;
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
	// Use block syntax for statement-like bodies
	const needsBlock = expr.body.kind === "state-write" || expr.body.kind === "block" ||
		expr.body.kind === "collection-op";
	if (needsBlock) {
		return `(${params}) => {\n\t\t\t${body};\n\t\t}`;
	}
	return `(${params}) => ${body}`;
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
	switch (expr.op) {
		case "insert":
			return `${name}.v = [...${name}.v, ${compileExpr(expr.args[0], ctx)}]`;
		case "remove":
			return `${name}.v = ${name}.v.filter((t) => t.id !== ${compileExpr(expr.args[0], ctx)})`;
		case "update": {
			const id = compileExpr(expr.args[0], ctx);
			const closureArg = expr.args[1];
			if (closureArg.kind === "closure" && closureArg.params.length === 1) {
				// Inline the closure: (param) => body becomes the map callback body
				const param = typeof closureArg.params[0] === "string" ? closureArg.params[0] : "t";
				const body = compileExpr(closureArg.body, ctx);
				return `${name}.v = ${name}.v.map((${param}) => ${param}.id === ${id} ? ${body} : ${param})`;
			}
			const fn = compileExpr(closureArg, ctx);
			return `${name}.v = ${name}.v.map((t) => t.id === ${id} ? ${fn}(t) : t)`;
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
