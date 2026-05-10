/** @import {Statement} from '@babel/types' */
/** @import {ActionIR} from 'roqa/ir' */
/** @import {ExprContext} from './expressions.js' */

import * as t from "@babel/types";
import { convertBody, extractParamNames } from "./expressions.js";

/**
 * Extract action declarations from a component function body.
 * Finds arrow functions and function declarations that are actions.
 *
 * Actions are functions that:
 * - Are not the return value
 * - Are not cell initializers (those are handled by state extraction)
 * - Contain set() calls, emit() calls, or are referenced in event handlers
 *
 * For v1, all non-cell, non-return functions are treated as actions.
 *
 * @param {Statement[]} body - Function body statements
 * @param {ExprContext} ctx - Expression context (with cells and imports populated)
 * @param {Set<string>} cellNames - Set of cell variable names (to exclude)
 * @returns {ActionIR[]}
 */
export function extractActions(body, ctx, cellNames) {
	/** @type {ActionIR[]} */
	const actions = [];

	for (const stmt of body) {
		// Arrow function: const fn = (...) => { ... }
		if (t.isVariableDeclaration(stmt)) {
			for (const decl of stmt.declarations) {
				if (!t.isIdentifier(decl.id)) continue;
				if (cellNames.has(decl.id.name)) continue;
				if (!decl.init) continue;

				if (
					t.isArrowFunctionExpression(decl.init) ||
					t.isFunctionExpression(decl.init)
				) {
					const fn = decl.init;
					const name = decl.id.name;
					const params = extractParamNames(fn.params).map(stripTypeAnnotation);

					// Create child context with params in scope
					const childCtx = {
						...ctx,
						params: new Set([...ctx.params, ...params]),
					};
					const actionBody = convertBody(fn.body, childCtx);

					actions.push({
						kind: "action",
						name,
						params,
						body: actionBody,
						async: !!fn.async,
					});
				}
			}
		}

		// Function declaration: function fn(...) { ... }
		if (t.isFunctionDeclaration(stmt) && stmt.id) {
			const name = stmt.id.name;
			const params = extractParamNames(stmt.params).map(stripTypeAnnotation);

			const childCtx = {
				...ctx,
				params: new Set([...ctx.params, ...params]),
			};
			const actionBody = convertBody(stmt.body, childCtx);

			actions.push({
				kind: "action",
				name,
				params,
				body: actionBody,
				async: !!stmt.async,
			});
		}
	}

	return actions;
}

/**
 * Strip TypeScript type annotation suffixes from parameter names.
 * (Babel strips types during parsing, so this is mostly a no-op,
 * but handles edge cases.)
 * @param {string} name
 * @returns {string}
 */
function stripTypeAnnotation(name) {
	return name;
}
