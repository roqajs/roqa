/** @import {Node, Expression, SpreadElement, PrivateName} from '@babel/types' */
/** @import {ExprIR, ClosureParam, DestructuredParam, DestructuredBinding, ObjectPropertyIR} from 'roqa/ir' */

import * as t from "@babel/types";
import { compileExpr } from "roqa/compiler";
import { KNOWN_GLOBALS } from "./utils.js";

/**
 * @typedef {Object} ExprContext
 * @property {Map<string, 'value' | 'computed' | 'collection'>} cells - Map of cell variable names to their kind
 * @property {Set<string>} actions - Set of action function names
 * @property {Set<string>} props - Set of prop names (from destructured params)
 * @property {Set<string>} params - Set of in-scope parameter names (closure/action params)
 * @property {Map<string, {source: string, isDefault?: boolean}>} imports - Non-roqa imports
 * @property {string | null} itemAlias - Current <For> item alias (if inside a For render)
 * @property {Set<string>} localVars - Set of local (non-cell, non-action) variable names
 * @property {string} [source] - Original source code (for opaque expression text)
 */

/**
 * Create a fresh expression context.
 * @returns {ExprContext}
 */
export function createExprContext() {
	return {
		cells: new Map(),
		actions: new Set(),
		props: new Set(),
		params: new Set(),
		imports: new Map(),
		itemAlias: null,
		localVars: new Set(),
		source: undefined,
	};
}

/**
 * Convert a Babel AST expression to an ExprIR node.
 *
 * @param {Node} node - Babel AST node
 * @param {ExprContext} ctx - Expression context for identifier resolution
 * @returns {ExprIR}
 */
export function convertExpr(node, ctx) {
	// Unwrap TS type assertions: (x as T) → x, x! → x
	if (t.isTSAsExpression(node) || t.isTSTypeAssertion(node)) {
		return convertExpr(node.expression, ctx);
	}
	if (t.isTSNonNullExpression(node)) {
		return convertExpr(node.expression, ctx);
	}
	// Unwrap parenthesized expressions
	if (t.isParenthesizedExpression(node)) {
		return convertExpr(node.expression, ctx);
	}

	// --- Literals ---
	if (t.isNumericLiteral(node)) {
		return { kind: "literal", value: node.value };
	}
	if (t.isStringLiteral(node)) {
		return { kind: "literal", value: node.value };
	}
	if (t.isBooleanLiteral(node)) {
		return { kind: "literal", value: node.value };
	}
	if (t.isNullLiteral(node)) {
		return { kind: "literal", value: null };
	}

	// --- Template literals ---
	if (t.isTemplateLiteral(node)) {
		return convertTemplateLiteral(node, ctx);
	}

	// --- Identifiers ---
	if (t.isIdentifier(node)) {
		return resolveIdentifier(node.name, ctx);
	}

	// --- this ---
	if (t.isThisExpression(node)) {
		return { kind: "external-ref", name: "this" };
	}

	// --- Binary ---
	if (t.isBinaryExpression(node)) {
		const op = normalizeBinaryOp(node.operator);
		if (op) {
			return {
				kind: "binary",
				op,
				left: convertExpr(node.left, ctx),
				right: convertExpr(node.right, ctx),
			};
		}
	}

	// --- Logical (&&, ||, ??) ---
	if (t.isLogicalExpression(node)) {
		return {
			kind: "binary",
			op: /** @type {"&&" | "||" | "??"} */ (node.operator),
			left: convertExpr(node.left, ctx),
			right: convertExpr(node.right, ctx),
		};
	}

	// --- Unary ---
	if (t.isUnaryExpression(node) && !node.prefix === false) {
		const op = normalizeUnaryOp(node.operator);
		if (op) {
			return { kind: "unary", op, operand: convertExpr(node.argument, ctx) };
		}
	}

	// --- Conditional (ternary) ---
	if (t.isConditionalExpression(node)) {
		return {
			kind: "conditional",
			test: convertExpr(node.test, ctx),
			consequent: convertExpr(node.consequent, ctx),
			alternate: convertExpr(node.alternate, ctx),
		};
	}

	// --- Call expressions ---
	if (t.isCallExpression(node)) {
		return convertCallExpr(node, ctx);
	}

	// --- Member expressions ---
	if (t.isMemberExpression(node)) {
		return convertMemberExpr(node, ctx);
	}

	// --- Optional chaining ---
	if (t.isOptionalMemberExpression(node)) {
		return convertOptionalMemberExpr(node, ctx);
	}

	if (t.isOptionalCallExpression(node)) {
		return convertOptionalCallExpr(node, ctx);
	}

	// --- Arrow function ---
	if (t.isArrowFunctionExpression(node)) {
		return convertArrowFunction(node, ctx);
	}

	// --- Function expression ---
	if (t.isFunctionExpression(node)) {
		return convertFunctionExpr(node, ctx);
	}

	// --- Object expression ---
	if (t.isObjectExpression(node)) {
		return convertObjectExpr(node, ctx);
	}

	// --- Array expression ---
	if (t.isArrayExpression(node)) {
		return convertArrayExpr(node, ctx);
	}

	// --- Spread element ---
	if (t.isSpreadElement(node)) {
		return { kind: "spread", argument: convertExpr(node.argument, ctx) };
	}

	// --- Assignment expression ---
	if (t.isAssignmentExpression(node)) {
		return convertAssignmentExpr(node, ctx);
	}

	// --- Update expression (++, --) ---
	if (t.isUpdateExpression(node)) {
		return convertUpdateExpr(node, ctx);
	}

	// --- Sequence expression (a, b, c) ---
	if (t.isSequenceExpression(node)) {
		return {
			kind: "block",
			body: node.expressions.map((e) => convertExpr(e, ctx)),
		};
	}

	// --- Tagged template expression ---
	if (t.isTaggedTemplateExpression(node)) {
		return toOpaque(node, ctx);
	}

	// --- New expression ---
	if (t.isNewExpression(node)) {
		return toOpaque(node, ctx);
	}

	// --- Await expression ---
	if (t.isAwaitExpression(node)) {
		return toOpaque(node, ctx);
	}

	// --- Yield expression ---
	if (t.isYieldExpression(node)) {
		return toOpaque(node, ctx);
	}

	// Fallback: opaque
	return toOpaque(node, ctx);
}

/**
 * Convert a Babel AST node to statements (for action bodies).
 * Returns an ExprIR — a single expression or BlockExpr for multiple statements.
 *
 * @param {Node} node - The node (BlockStatement, ExpressionStatement, etc.)
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
export function convertBody(node, ctx) {
	if (t.isBlockStatement(node)) {
		return convertBlockStatement(node, ctx);
	}
	// Expression body (arrow function shorthand)
	return convertExpr(node, ctx);
}

/**
 * @param {import('@babel/types').BlockStatement} block
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertBlockStatement(block, ctx) {
	const exprs = [];
	let hasNonExpressionStatement = false;
	for (const stmt of block.body) {
		if (!t.isExpressionStatement(stmt)) {
			hasNonExpressionStatement = true;
		}
		const expr = convertStatement(stmt, ctx);
		if (expr) exprs.push(expr);
	}
	if (exprs.length === 0) {
		return { kind: "literal", value: null };
	}
	// When the original block contained statements (return/if/var-decl/etc),
	// preserve a block wrapping so callers (e.g. closure compilation) emit the
	// surrounding `{ }` — bare statements are not valid arrow-function bodies.
	if (exprs.length === 1 && !hasNonExpressionStatement) {
		return exprs[0];
	}
	return { kind: "block", body: exprs };
}

/**
 * @param {import('@babel/types').Statement} stmt
 * @param {ExprContext} ctx
 * @returns {ExprIR | null}
 */
function convertStatement(stmt, ctx) {
	if (t.isExpressionStatement(stmt)) {
		return convertExpr(stmt.expression, ctx);
	}
	if (t.isReturnStatement(stmt)) {
		// Preserve the `return` keyword so that the emitted action correctly
		// returns its value (otherwise the inner expression is emitted as a
		// bare statement and any value is lost).
		return toOpaque(stmt, ctx);
	}
	if (t.isVariableDeclaration(stmt)) {
		return convertVarDeclaration(stmt, ctx);
	}
	if (t.isIfStatement(stmt)) {
		return convertIfStatement(stmt, ctx);
	}
	// Fallback: opaque for complex statements
	return toOpaque(stmt, ctx);
}

/**
 * @param {import('@babel/types').VariableDeclaration} decl
 * @param {ExprContext} ctx
 * @returns {ExprIR | null}
 */
function convertVarDeclaration(decl, ctx) {
	/** @type {string[]} */
	const partsSource = [];
	for (const d of decl.declarations) {
		if (t.isIdentifier(d.id)) {
			ctx.localVars.add(d.id.name);
			if (d.init) {
				const initIR = convertExpr(d.init, ctx);
				partsSource.push(`${d.id.name} = ${compileExpr(initIR)}`);
			} else {
				partsSource.push(d.id.name);
			}
		} else if (d.init) {
			// Destructured / pattern declaration — fall back to original source.
			partsSource.push(nodeRangeText(d, ctx));
		}
	}
	const kind = decl.kind || "let";
	return {
		kind: "opaque",
		source: `${kind} ${partsSource.join(", ")}`,
		reads: [],
		writes: [],
	};
}

/**
 * Extract the original source text for a node, falling back to a placeholder.
 * @param {import('@babel/types').Node} node
 * @param {ExprContext} ctx
 * @returns {string}
 */
function nodeRangeText(node, ctx) {
	if (
		ctx &&
		typeof ctx.source === "string" &&
		typeof node.start === "number" &&
		typeof node.end === "number"
	) {
		return ctx.source.slice(node.start, node.end);
	}
	return `/* ${node.type} */`;
}

/**
 * @param {import('@babel/types').IfStatement} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertIfStatement(node, ctx) {
	// Convert if/else to opaque since MIR expressions don't have if statements
	return toOpaque(node, ctx);
}

// --- Identifier resolution ---

/**
 * @param {string} name
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function resolveIdentifier(name, ctx) {
	// Item alias inside <For> (the iteration variable itself, not a field access)
	if (name === ctx.itemAlias) {
		return { kind: "local-read", name };
	}

	// Closure / action parameter
	if (ctx.params.has(name)) {
		return { kind: "local-read", name };
	}

	// Prop
	if (ctx.props.has(name)) {
		return { kind: "prop-read", name };
	}

	// Cell variable — bare reference
	// In expression context, reading a cell produces a state-read (the value).
	// cell-ref is only produced explicitly in <For each={}> and show conditions.
	if (ctx.cells.has(name)) {
		const cellKind = ctx.cells.get(name);
		if (cellKind === "computed") {
			return { kind: "computed-read", name };
		}
		return { kind: "state-read", name };
	}

	// Action function
	if (ctx.actions.has(name)) {
		// Bare reference (not a call). The CallExpression converter handles
		// the call form `actionName(args)` directly; here we just emit the
		// function reference so it can be passed around (e.g. to event
		// listeners or callbacks).
		return { kind: "external-ref", name };
	}

	// Imported reference
	if (ctx.imports.has(name)) {
		const imp = ctx.imports.get(name);
		return { kind: "imported-ref", source: imp.source, name, isDefault: imp.isDefault };
	}

	// Local variable
	if (ctx.localVars.has(name)) {
		return { kind: "local-read", name };
	}

	// Known global
	if (KNOWN_GLOBALS.has(name)) {
		return { kind: "external-ref", name };
	}

	// Unknown — treat as external ref
	return { kind: "external-ref", name };
}

// --- Call expression handling ---

/**
 * @param {import('@babel/types').CallExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertCallExpr(node, ctx) {
	const callee = node.callee;

	// get(cellVar)
	if (t.isIdentifier(callee) && callee.name === "get" && node.arguments.length === 1) {
		const arg = node.arguments[0];
		if (t.isIdentifier(arg) && ctx.cells.has(arg.name)) {
			const cellKind = ctx.cells.get(arg.name);
			if (cellKind === "computed") {
				return { kind: "computed-read", name: arg.name };
			}
			return { kind: "state-read", name: arg.name };
		}
	}

	// set(cellVar, value)
	if (t.isIdentifier(callee) && callee.name === "set" && node.arguments.length === 2) {
		const arg0 = node.arguments[0];
		const arg1 = node.arguments[1];
		if (t.isIdentifier(arg0) && ctx.cells.has(arg0.name)) {
			return {
				kind: "state-write",
				name: arg0.name,
				value: convertExpr(arg1, ctx),
			};
		}
	}

	// this.emit(eventName, detail)
	if (
		t.isMemberExpression(callee) &&
		t.isThisExpression(callee.object) &&
		t.isIdentifier(callee.property) &&
		callee.property.name === "emit"
	) {
		const eventArg = node.arguments[0];
		if (t.isStringLiteral(eventArg)) {
			/** @type {ExprIR | undefined} */
			let detail;
			if (node.arguments.length > 1) {
				detail = convertExpr(node.arguments[1], ctx);
			}
			return { kind: "emit", event: eventArg.value, detail };
		}
	}

	// this.connected(fn) / this.disconnected(fn) — handled at extract level
	// For other this.method() calls, fall through to method-call

	// roqa runtime functions that take a Cell as the first argument:
	// pass the cell reference (not the value) without unwrapping.
	const CELL_ARG_HELPERS = new Set(["bind", "subscribe", "notify", "put"]);
	if (
		t.isIdentifier(callee) &&
		CELL_ARG_HELPERS.has(callee.name) &&
		node.arguments.length >= 1
	) {
		const firstArg = node.arguments[0];
		if (t.isIdentifier(firstArg) && ctx.cells.has(firstArg.name)) {
			const restArgs = convertArgs(node.arguments.slice(1), ctx);
			return {
				kind: "call",
				callee: { kind: "external-ref", name: callee.name },
				args: [{ kind: "external-ref", name: firstArg.name }, ...restArgs],
			};
		}
	}

	// Method call: obj.method(args)
	if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && !callee.computed) {
		const obj = convertExpr(callee.object, ctx);
		const method = callee.property.name;
		const args = convertArgs(node.arguments, ctx);
		return { kind: "method-call", object: obj, method, args };
	}

	// Action call: actionName(args) where actionName is a known action
	if (t.isIdentifier(callee) && ctx.actions.has(callee.name)) {
		return {
			kind: "action-call",
			name: callee.name,
			args: convertArgs(node.arguments, ctx),
		};
	}

	// Generic call
	const calleeExpr = convertExpr(callee, ctx);
	const args = convertArgs(node.arguments, ctx);
	return { kind: "call", callee: calleeExpr, args };
}

/**
 * @param {import('@babel/types').OptionalCallExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertOptionalCallExpr(node, ctx) {
	// Optional calls are complex — use opaque for now
	return toOpaque(node, ctx);
}

/**
 * @param {Array<Expression | SpreadElement>} args
 * @param {ExprContext} ctx
 * @returns {ExprIR[]}
 */
function convertArgs(args, ctx) {
	return args.map((arg) => {
		if (t.isSpreadElement(arg)) {
			return { kind: "spread", argument: convertExpr(arg.argument, ctx) };
		}
		return convertExpr(arg, ctx);
	});
}

// --- Member expression handling ---

/**
 * @param {import('@babel/types').MemberExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertMemberExpr(node, ctx) {
	// Computed access: obj[expr]
	if (node.computed) {
		return {
			kind: "index",
			object: convertExpr(node.object, ctx),
			index: convertExpr(/** @type {Expression} */ (node.property), ctx),
		};
	}

	const prop = /** @type {import('@babel/types').Identifier} */ (node.property);

	// Item field access: itemAlias.field inside <For>
	if (t.isIdentifier(node.object) && node.object.name === ctx.itemAlias) {
		return {
			kind: "member",
			object: { kind: "local-read", name: ctx.itemAlias },
			property: prop.name,
		};
	}

	// Chain member access
	const obj = convertExpr(node.object, ctx);
	return { kind: "member", object: obj, property: prop.name };
}

/**
 * @param {import('@babel/types').OptionalMemberExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertOptionalMemberExpr(node, ctx) {
	// Optional chaining — simplify to regular member for MIR
	if (node.computed) {
		return {
			kind: "index",
			object: convertExpr(node.object, ctx),
			index: convertExpr(/** @type {Expression} */ (node.property), ctx),
		};
	}
	const prop = /** @type {import('@babel/types').Identifier} */ (node.property);
	const obj = convertExpr(node.object, ctx);
	return { kind: "member", object: obj, property: prop.name };
}

// --- Arrow / function expressions ---

/**
 * @param {import('@babel/types').ArrowFunctionExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertArrowFunction(node, ctx) {
	const params = convertClosureParams(node.params);
	const paramNames = extractParamNames(node.params);

	// Create a child context with the params in scope
	const childCtx = { ...ctx, params: new Set([...ctx.params, ...paramNames]) };
	const body = convertBody(node.body, childCtx);

	/** @type {ExprIR} */
	const result = { kind: "closure", params, body };
	if (node.async) result.async = true;
	return result;
}

/**
 * @param {import('@babel/types').FunctionExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertFunctionExpr(node, ctx) {
	const params = convertClosureParams(node.params);
	const paramNames = extractParamNames(node.params);
	const childCtx = { ...ctx, params: new Set([...ctx.params, ...paramNames]) };
	const body = convertBody(node.body, childCtx);

	/** @type {ExprIR} */
	const result = { kind: "closure", params, body };
	if (node.async) result.async = true;
	return result;
}

/**
 * Convert Babel function params to ClosureParam[].
 * @param {Array<import('@babel/types').Identifier | import('@babel/types').RestElement | import('@babel/types').Pattern>} params
 * @returns {ClosureParam[]}
 */
export function convertClosureParams(params) {
	return params.map((p) => {
		if (t.isIdentifier(p)) {
			return p.name;
		}
		if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) {
			return p.left.name;
		}
		if (t.isObjectPattern(p)) {
			return convertDestructuredObject(p);
		}
		if (t.isArrayPattern(p)) {
			return convertDestructuredArray(p);
		}
		if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
			return p.argument.name;
		}
		// TS annotation wrapper
		if (t.isTSParameterProperty(p)) {
			return convertClosureParams([p.parameter])[0];
		}
		return "unknown";
	});
}

/**
 * @param {import('@babel/types').ObjectPattern} pat
 * @returns {DestructuredParam}
 */
function convertDestructuredObject(pat) {
	/** @type {DestructuredBinding[]} */
	const bindings = [];
	/** @type {string | undefined} */
	let rest;

	for (const prop of pat.properties) {
		if (t.isRestElement(prop)) {
			if (t.isIdentifier(prop.argument)) {
				rest = prop.argument.name;
			}
		} else if (t.isObjectProperty(prop)) {
			const key = t.isIdentifier(prop.key) ? prop.key.name : String(/** @type {any} */ (prop.key).value);
			/** @type {string | undefined} */
			let alias;
			if (t.isIdentifier(prop.value) && prop.value.name !== key) {
				alias = prop.value.name;
			} else if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)) {
				if (prop.value.left.name !== key) {
					alias = prop.value.left.name;
				}
			}
			/** @type {DestructuredBinding} */
			const binding = { key };
			if (alias) binding.alias = alias;
			bindings.push(binding);
		}
	}

	/** @type {DestructuredParam} */
	const result = { kind: "destructured", pattern: "object", bindings };
	if (rest) result.rest = rest;
	return result;
}

/**
 * @param {import('@babel/types').ArrayPattern} pat
 * @returns {DestructuredParam}
 */
function convertDestructuredArray(pat) {
	/** @type {DestructuredBinding[]} */
	const bindings = [];
	/** @type {string | undefined} */
	let rest;

	for (let i = 0; i < pat.elements.length; i++) {
		const el = pat.elements[i];
		if (!el) continue;
		if (t.isRestElement(el) && t.isIdentifier(el.argument)) {
			rest = el.argument.name;
		} else if (t.isIdentifier(el)) {
			bindings.push({ key: String(i), alias: el.name });
		} else if (t.isAssignmentPattern(el) && t.isIdentifier(el.left)) {
			bindings.push({ key: String(i), alias: el.left.name });
		}
	}

	/** @type {DestructuredParam} */
	const result = { kind: "destructured", pattern: "array", bindings };
	if (rest) result.rest = rest;
	return result;
}

/**
 * Extract plain parameter names from Babel params (for scope tracking).
 * @param {Array<import('@babel/types').Identifier | import('@babel/types').RestElement | import('@babel/types').Pattern>} params
 * @returns {string[]}
 */
export function extractParamNames(params) {
	const names = [];
	for (const p of params) {
		if (t.isIdentifier(p)) {
			names.push(p.name);
		} else if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) {
			names.push(p.left.name);
		} else if (t.isObjectPattern(p)) {
			for (const prop of p.properties) {
				if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
					names.push(prop.argument.name);
				} else if (t.isObjectProperty(prop)) {
					if (t.isIdentifier(prop.value)) {
						names.push(prop.value.name);
					} else if (t.isAssignmentPattern(prop.value) && t.isIdentifier(prop.value.left)) {
						names.push(prop.value.left.name);
					}
				}
			}
		} else if (t.isArrayPattern(p)) {
			for (const el of p.elements) {
				if (t.isIdentifier(el)) {
					names.push(el.name);
				} else if (t.isRestElement(el) && t.isIdentifier(el.argument)) {
					names.push(el.argument.name);
				}
			}
		} else if (t.isRestElement(p) && t.isIdentifier(p.argument)) {
			names.push(p.argument.name);
		}
	}
	return names;
}

// --- Object / Array expressions ---

/**
 * @param {import('@babel/types').ObjectExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertObjectExpr(node, ctx) {
	/** @type {ObjectPropertyIR[]} */
	const properties = [];

	for (const prop of node.properties) {
		if (t.isSpreadElement(prop)) {
			properties.push({ kind: "spread", argument: convertExpr(prop.argument, ctx) });
		} else if (t.isObjectProperty(prop)) {
			const key = t.isIdentifier(prop.key)
				? prop.key.name
				: t.isStringLiteral(prop.key)
					? prop.key.value
					: String(/** @type {any} */ (prop.key).value);
			properties.push({
				kind: "property",
				key,
				value: convertExpr(/** @type {Expression} */ (prop.value), ctx),
			});
		} else if (t.isObjectMethod(prop)) {
			// Object method shorthand — convert to closure
			const params = convertClosureParams(prop.params);
			const paramNames = extractParamNames(prop.params);
			const childCtx = { ...ctx, params: new Set([...ctx.params, ...paramNames]) };
			const body = convertBody(prop.body, childCtx);
			const key = t.isIdentifier(prop.key) ? prop.key.name : String(/** @type {any} */ (prop.key).value);
			properties.push({
				kind: "property",
				key,
				value: { kind: "closure", params, body },
			});
		}
	}

	return { kind: "object", properties };
}

/**
 * @param {import('@babel/types').ArrayExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertArrayExpr(node, ctx) {
	const elements = [];
	for (const el of node.elements) {
		if (!el) {
			elements.push({ kind: "literal", value: null });
		} else if (t.isSpreadElement(el)) {
			elements.push({ kind: "spread", argument: convertExpr(el.argument, ctx) });
		} else {
			elements.push(convertExpr(el, ctx));
		}
	}
	return { kind: "array", elements };
}

// --- Assignment / Update expressions ---

/**
 * @param {import('@babel/types').AssignmentExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertAssignmentExpr(node, ctx) {
	return {
		kind: "assign",
		op: /** @type {any} */ (node.operator),
		target: convertExpr(node.left, ctx),
		value: convertExpr(node.right, ctx),
	};
}

/**
 * @param {import('@babel/types').UpdateExpression} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertUpdateExpr(node, ctx) {
	return {
		kind: "update",
		op: /** @type {"++" | "--"} */ (node.operator),
		prefix: !!node.prefix,
		target: convertExpr(node.argument, ctx),
	};
}

// --- Template literal ---

/**
 * @param {import('@babel/types').TemplateLiteral} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertTemplateLiteral(node, ctx) {
	/** @type {(string | ExprIR)[]} */
	const parts = [];
	for (let i = 0; i < node.quasis.length; i++) {
		const quasi = node.quasis[i];
		if (quasi.value.cooked) {
			parts.push(quasi.value.cooked);
		}
		if (i < node.expressions.length) {
			parts.push(convertExpr(node.expressions[i], ctx));
		}
	}
	return { kind: "template-literal", parts };
}

// --- Operator normalization ---

/** @type {Record<string, string>} */
const BINARY_OP_MAP = {
	"+": "+",
	"-": "-",
	"*": "*",
	"/": "/",
	"%": "%",
	"===": "===",
	"!==": "!==",
	"==": "===",
	"!=": "!==",
	">": ">",
	"<": "<",
	">=": ">=",
	"<=": "<=",
};

/**
 * @param {string} op
 * @returns {string | null}
 */
function normalizeBinaryOp(op) {
	return BINARY_OP_MAP[op] || null;
}

/**
 * @param {string} op
 * @returns {"!" | "-" | "typeof" | null}
 */
function normalizeUnaryOp(op) {
	if (op === "!" || op === "-" || op === "typeof") return op;
	return null;
}

// --- Opaque fallback ---

/**
 * Generate an OpaqueExpr from a Babel AST node.
 * @param {Node} node
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function toOpaque(node, ctx) {
	let source;
	try {
		source = nodeToSource(node, ctx);
	} catch {
		source = `/* unrepresentable: ${node.type} */`;
	}
	return { kind: "opaque", source, reads: [], writes: [] };
}

/**
 * Extract source text for a Babel AST node.
 * Uses original source code via node.start/node.end when available; falls back
 * to a placeholder comment otherwise.
 * @param {Node} node
 * @param {ExprContext} [ctx]
 * @returns {string}
 */
function nodeToSource(node, ctx) {
	if (
		ctx &&
		typeof ctx.source === "string" &&
		typeof node.start === "number" &&
		typeof node.end === "number"
	) {
		return ctx.source.slice(node.start, node.end);
	}
	return `/* ${node.type} */`;
}
