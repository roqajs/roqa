/** @import {Statement, VariableDeclaration, CallExpression, Expression} from '@babel/types' */
/** @import {StateIR} from 'roqa/ir' */
/** @import {ExprContext} from './expressions.js' */

import * as t from "@babel/types";
import { convertExpr } from "./expressions.js";

/**
 * @typedef {Object} StateResult
 * @property {StateIR[]} states - Extracted state declarations
 * @property {Map<string, 'value' | 'computed' | 'collection'>} cellMap - Map of cell variable names to their kind
 */

/**
 * Extract state declarations from a component function body.
 * Finds all `const x = cell(init)` patterns.
 *
 * @param {Statement[]} body - Function body statements
 * @param {ExprContext} ctx - Expression context (for converting computed bodies)
 * @param {Set<string>} forSources - Set of cell names used as <For each={x}> sources
 * @returns {StateResult}
 */
export function extractState(body, ctx, forSources) {
	/** @type {StateIR[]} */
	const states = [];
	/** @type {Map<string, 'value' | 'computed' | 'collection'>} */
	const cellMap = new Map();

	for (const stmt of body) {
		if (!t.isVariableDeclaration(stmt) || stmt.kind !== "const") continue;

		for (const decl of stmt.declarations) {
			if (!t.isIdentifier(decl.id) || !decl.init) continue;
			if (!t.isCallExpression(decl.init)) continue;

			const callExpr = decl.init;
			if (!t.isIdentifier(callExpr.callee) || callExpr.callee.name !== "cell") continue;

			const varName = decl.id.name;
			const arg = callExpr.arguments[0];

			if (!arg) {
				// cell() with no args — treat as value with undefined
				states.push({ kind: "value", name: varName, initial: undefined });
				cellMap.set(varName, "value");
				continue;
			}

			// cell(() => expr) — computed
			if (t.isArrowFunctionExpression(arg) && arg.params.length === 0) {
				const exprBody = t.isBlockStatement(arg.body)
					? extractReturnExpr(arg.body)
					: arg.body;

				if (exprBody) {
					// Create a temporary context with cells known so far
					const tempCtx = { ...ctx, cells: new Map(cellMap) };
					states.push({
						kind: "computed",
						name: varName,
						body: convertExpr(exprBody, tempCtx),
					});
					cellMap.set(varName, "computed");
				}
				continue;
			}

			// cell(initialValue) — check if it's an array and used with <For>
			const initial = extractLiteralValue(arg);

			// If the initializer wasn't a literal we can extract, fall back to
			// preserving its raw source so the runtime can evaluate it.
			let initialExpr;
			if (initial === undefined && !t.isIdentifier(arg)) {
				initialExpr = nodeSource(arg, ctx);
			} else if (initial === undefined && t.isIdentifier(arg) && arg.name !== "undefined") {
				initialExpr = arg.name;
			}

			if (Array.isArray(initial) && forSources.has(varName)) {
				states.push({
					kind: "collection",
					name: varName,
					key: null,
					initial,
				});
				cellMap.set(varName, "collection");
			} else {
				/** @type {import('roqa/ir').StateValueIR} */
				const state = { kind: "value", name: varName, initial };
				if (initialExpr) state.initialExpr = initialExpr;
				states.push(state);
				cellMap.set(varName, "value");
			}
		}
	}

	return { states, cellMap };
}

/**
 * Extract source text for a node using ctx.source range info.
 * @param {import('@babel/types').Node} node
 * @param {ExprContext} ctx
 * @returns {string | undefined}
 */
function nodeSource(node, ctx) {
	if (
		ctx &&
		typeof ctx.source === "string" &&
		typeof node.start === "number" &&
		typeof node.end === "number"
	) {
		return ctx.source.slice(node.start, node.end);
	}
	return undefined;
}

/**
 * Extract the return expression from a block statement.
 * @param {import('@babel/types').BlockStatement} block
 * @returns {Expression | null}
 */
function extractReturnExpr(block) {
	for (const stmt of block.body) {
		if (t.isReturnStatement(stmt) && stmt.argument) {
			return stmt.argument;
		}
	}
	return null;
}

/**
 * Extract a literal JS value from a Babel AST expression.
 * Returns the actual JS value for simple cases, or an opaque representation.
 *
 * @param {Expression | import('@babel/types').SpreadElement} node
 * @returns {unknown}
 */
export function extractLiteralValue(node) {
	if (t.isNumericLiteral(node)) return node.value;
	if (t.isStringLiteral(node)) return node.value;
	if (t.isBooleanLiteral(node)) return node.value;
	if (t.isNullLiteral(node)) return null;

	// Handle unary minus for negative numbers
	if (t.isUnaryExpression(node) && node.operator === "-" && t.isNumericLiteral(node.argument)) {
		return -node.argument.value;
	}

	// Handle method calls like Number(0).toFixed(2) → use the string representation
	if (t.isCallExpression(node)) {
		// Try to evaluate simple call patterns
		if (
			t.isMemberExpression(node.callee) &&
			t.isCallExpression(node.callee.object) &&
			t.isIdentifier(node.callee.object.callee) &&
			node.callee.object.callee.name === "Number"
		) {
			// Number(x).toFixed(n) pattern
			const numArg = node.callee.object.arguments[0];
			if (t.isNumericLiteral(numArg) && t.isIdentifier(node.callee.property) && node.callee.property.name === "toFixed") {
				const precision = node.arguments[0];
				if (t.isNumericLiteral(precision)) {
					return numArg.value.toFixed(precision.value);
				}
			}
		}
	}

	if (t.isArrayExpression(node)) {
		return node.elements.map((el) => {
			if (!el) return null;
			if (t.isSpreadElement(el)) return extractLiteralValue(el.argument);
			return extractLiteralValue(el);
		});
	}

	if (t.isObjectExpression(node)) {
		/** @type {Record<string, unknown>} */
		const obj = {};
		for (const prop of node.properties) {
			if (t.isObjectProperty(prop)) {
				const key = t.isIdentifier(prop.key)
					? prop.key.name
					: t.isStringLiteral(prop.key)
						? prop.key.value
						: String(/** @type {any} */ (prop.key).value);
				obj[key] = extractLiteralValue(/** @type {Expression} */ (prop.value));
			}
		}
		return obj;
	}

	// Template literal with no expressions
	if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
		return node.quasis[0]?.value.cooked ?? "";
	}

	// Undefined
	if (t.isIdentifier(node) && node.name === "undefined") return undefined;

	// For anything else, return undefined (will be serialized as null in JSON)
	return undefined;
}
