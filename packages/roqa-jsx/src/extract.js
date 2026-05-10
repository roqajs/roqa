/** @import {File, Statement, Expression} from '@babel/types' */
/** @import {ComponentIR, PropIR, LifecycleIR, ImportIR} from 'roqa/ir' */

import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { createExprContext, convertBody, extractParamNames, convertExpr } from "./expressions.js";
import { extractState } from "./state.js";
import { extractActions } from "./actions.js";
import { convertJSXToNodes, collectForSources } from "./render.js";
import { ROQA_IMPORTS } from "./utils.js";

// Handle both ESM default and CJS interop for @babel/traverse
const traverse = /** @type {typeof _traverse.default} */ (
	typeof _traverse === "function" ? _traverse : _traverse.default
);

/**
 * @typedef {Object} ComponentInfo
 * @property {string} tagName - Custom element tag name
 * @property {string} name - Component function name
 * @property {import('@babel/types').Function} fn - The component function node
 * @property {Statement[]} body - Function body statements
 */

/**
 * Extract all component definitions from a parsed Babel AST.
 *
 * @param {File} ast - Parsed Babel AST
 * @param {string} id - Source file path
 * @param {string} [source] - Original source code (used for opaque expression text)
 * @returns {ComponentIR[]}
 */
export function extractComponents(ast, id, source) {
	const components = findDefineComponentCalls(ast);
	const moduleImports = extractModuleImports(ast);
	const moduleCode = extractModuleLevelCode(ast, components, source);

	return components.map((comp, idx) => {
		const ir = buildComponentIR(comp, moduleImports, id, source);
		// Attach module-level code only to the first component to avoid duplicates
		if (idx === 0 && moduleCode) {
			ir.metadata = ir.metadata || { sourceFile: id, frontend: "jsx" };
			ir.metadata.moduleCode = moduleCode;
		}
		return ir;
	});
}

/**
 * Extract module-level code (constants, helpers, etc.) that isn't an import,
 * a defineComponent call, or a component function declaration. Returns the
 * raw source text so it can be hoisted to the top of the emitted output.
 *
 * @param {File} ast
 * @param {ComponentInfo[]} components
 * @param {string | undefined} source
 * @returns {string | undefined}
 */
function extractModuleLevelCode(ast, components, source) {
	if (!source) return undefined;

	const componentFnNodes = new Set();
	for (const c of components) {
		componentFnNodes.add(c.fn);
	}

	/** @type {string[]} */
	const chunks = [];
	for (const stmt of ast.program.body) {
		// Skip imports
		if (t.isImportDeclaration(stmt)) continue;
		// Skip defineComponent() calls
		if (
			t.isExpressionStatement(stmt) &&
			t.isCallExpression(stmt.expression) &&
			t.isIdentifier(stmt.expression.callee) &&
			stmt.expression.callee.name === "defineComponent"
		) {
			continue;
		}
		// Skip component function declarations
		if (t.isFunctionDeclaration(stmt) && componentFnNodes.has(stmt)) continue;
		if (t.isVariableDeclaration(stmt)) {
			let allComponentFns = true;
			for (const decl of stmt.declarations) {
				if (!decl.init || !componentFnNodes.has(decl.init)) {
					allComponentFns = false;
					break;
				}
			}
			if (allComponentFns) continue;
		}

		if (typeof stmt.start === "number" && typeof stmt.end === "number") {
			chunks.push(source.slice(stmt.start, stmt.end));
		}
	}

	if (chunks.length === 0) return undefined;
	return chunks.join("\n");
}

/**
 * Find all defineComponent(tagName, fn) calls and resolve the function references.
 *
 * @param {File} ast
 * @returns {ComponentInfo[]}
 */
function findDefineComponentCalls(ast) {
	/** @type {ComponentInfo[]} */
	const components = [];

	/** @type {Map<string, import('@babel/types').Function>} */
	const functionMap = new Map();

	// First pass: collect all function declarations
	for (const stmt of ast.program.body) {
		if (t.isFunctionDeclaration(stmt) && stmt.id) {
			functionMap.set(stmt.id.name, stmt);
		}
		if (t.isVariableDeclaration(stmt)) {
			for (const decl of stmt.declarations) {
				if (
					t.isIdentifier(decl.id) &&
					(t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init))
				) {
					functionMap.set(decl.id.name, decl.init);
				}
			}
		}
	}

	// Second pass: find defineComponent calls
	for (const stmt of ast.program.body) {
		if (!t.isExpressionStatement(stmt)) continue;
		if (!t.isCallExpression(stmt.expression)) continue;

		const call = stmt.expression;
		if (!t.isIdentifier(call.callee) || call.callee.name !== "defineComponent") continue;
		if (call.arguments.length < 2) continue;

		const tagArg = call.arguments[0];
		const fnArg = call.arguments[1];

		if (!t.isStringLiteral(tagArg)) continue;
		const tagName = tagArg.value;

		// Resolve the function
		let fn = null;
		let name = "";

		if (t.isIdentifier(fnArg)) {
			fn = functionMap.get(fnArg.name) || null;
			name = fnArg.name;
		} else if (t.isArrowFunctionExpression(fnArg) || t.isFunctionExpression(fnArg)) {
			fn = fnArg;
			name = fnArg.id?.name || tagName;
		}

		if (fn) {
			const body = t.isBlockStatement(fn.body)
				? fn.body.body
				: [];
			components.push({ tagName, name, fn, body });
		}
	}

	return components;
}

/**
 * Build a ComponentIR from a component's extracted info.
 *
 * @param {ComponentInfo} comp
 * @param {ImportIR[]} moduleImports
 * @param {string} id
 * @param {string} [source]
 * @returns {ComponentIR}
 */
function buildComponentIR(comp, moduleImports, id, source) {
	const { tagName, name, fn, body } = comp;

	// 1. Extract props from destructured parameters
	const props = extractProps(fn);

	// 2. Create initial expression context
	const ctx = createExprContext();
	ctx.source = source;

	// Populate props in context
	for (const prop of props) {
		ctx.props.add(prop.name);
	}

	// Populate imports in context
	for (const imp of moduleImports) {
		for (const binding of imp.bindings) {
			const local = typeof binding === "string" ? binding : binding.local;
			ctx.imports.set(local, { source: imp.source });
		}
	}

	// 3. Find the return statement to get JSX root
	const jsxRoot = findReturnJSX(body);

	// 4. Pre-pass: collect <For each={x}> sources for collection detection
	const forSources = jsxRoot ? collectForSources(jsxRoot) : new Set();

	// 5. Extract state (populates ctx.cells)
	const { states, cellMap } = extractState(body, ctx, forSources);
	ctx.cells = cellMap;

	// 6. Pre-scan for action names (before extracting action bodies)
	const actionNames = collectActionNames(body, cellMap);
	ctx.actions = actionNames;

	// 7. Extract actions
	const actions = extractActions(body, ctx, new Set(cellMap.keys()));

	// 7b. Extract top-level let/var declarations (so closures can capture them)
	const locals = extractLocals(body, ctx, cellMap);
	for (const local of locals) {
		ctx.localVars.add(local.name);
	}

	// 7c. Extract miscellaneous top-level statements (e.g. `this.foo = ...`)
	const topLevelStatements = extractTopLevelStatements(body, ctx);

	// 8. Extract lifecycle hooks
	const lifecycle = extractLifecycle(body, ctx);

	// 9. Convert render tree
	const render = jsxRoot ? convertJSXToNodes(jsxRoot, ctx) : [];

	/** @type {ComponentIR} */
	const ir = {
		version: 1,
		tagName,
		name,
		state: states,
		actions,
		props,
		attrs: [],
		emits: [],
		lifecycle,
		render,
	};

	if (locals.length > 0) {
		ir.locals = locals;
	}

	if (topLevelStatements.length > 0) {
		ir.preamble = topLevelStatements;
	}

	// Add metadata if there are imports
	if (moduleImports.length > 0) {
		ir.metadata = {
			sourceFile: id,
			frontend: "jsx",
			imports: moduleImports,
		};
	} else {
		ir.metadata = {
			sourceFile: id,
			frontend: "jsx",
		};
	}

	return ir;
}

/**
 * Extract props from a component function's destructured parameter.
 *
 * @param {import('@babel/types').Function} fn
 * @returns {PropIR[]}
 */
function extractProps(fn) {
	/** @type {PropIR[]} */
	const props = [];

	if (fn.params.length === 0) return props;

	// Check if first param is destructured object (props) or `this` typed param
	const firstParam = fn.params[0];

	if (t.isObjectPattern(firstParam)) {
		for (const prop of firstParam.properties) {
			if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
				const hasDefault = t.isAssignmentPattern(prop.value);
				props.push({
					kind: "prop",
					name: prop.key.name,
					required: !hasDefault,
				});
			} else if (t.isRestElement(prop)) {
				// Rest props not directly supported
			}
		}
	}

	return props;
}

/**
 * Find the JSX expression returned by the component function.
 *
 * @param {Statement[]} body
 * @returns {Expression | null}
 */
function findReturnJSX(body) {
	for (const stmt of body) {
		if (t.isReturnStatement(stmt) && stmt.argument) {
			return stmt.argument;
		}
	}
	return null;
}

/**
 * Pre-scan to collect action function names (before full extraction).
 *
 * @param {Statement[]} body
 * @param {Map<string, string>} cellMap
 * @returns {Set<string>}
 */
function collectActionNames(body, cellMap) {
	const names = new Set();

	for (const stmt of body) {
		if (t.isVariableDeclaration(stmt)) {
			for (const decl of stmt.declarations) {
				if (!t.isIdentifier(decl.id)) continue;
				if (cellMap.has(decl.id.name)) continue;
				if (
					t.isArrowFunctionExpression(decl.init) ||
					t.isFunctionExpression(decl.init)
				) {
					names.add(decl.id.name);
				}
			}
		}
		if (t.isFunctionDeclaration(stmt) && stmt.id) {
			names.add(stmt.id.name);
		}
	}

	return names;
}

/**
 * Extract top-level `let`/`var` declarations (excluding cell declarations and
 * action functions). These are emitted in the component scope so that
 * lifecycle callbacks and event handlers can capture and assign to them.
 *
 * @param {Statement[]} body
 * @param {import('./expressions.js').ExprContext} ctx
 * @param {Map<string, 'value' | 'computed' | 'collection'>} cellMap
 * @returns {import('roqa/ir').LocalDeclIR[]}
 */
function extractLocals(body, ctx, cellMap) {
	/** @type {import('roqa/ir').LocalDeclIR[]} */
	const locals = [];

	for (const stmt of body) {
		if (!t.isVariableDeclaration(stmt)) continue;
		if (stmt.kind !== "let" && stmt.kind !== "var") continue;

		for (const decl of stmt.declarations) {
			if (!t.isIdentifier(decl.id)) continue;
			const name = decl.id.name;
			// Skip if it's a cell or action (already handled elsewhere)
			if (cellMap.has(name)) continue;
			// Arrow / function expression initializers are treated as actions
			if (
				decl.init &&
				(t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init))
			) {
				continue;
			}

			/** @type {import('roqa/ir').LocalDeclIR} */
			const local = { kind: stmt.kind, name };
			if (decl.init) {
				local.init = convertExpr(decl.init, ctx);
			}
			locals.push(local);
		}
	}

	return locals;
}

/**
 * Extract top-level expression statements from the component body that aren't
 * lifecycle calls. These are emitted at component scope (before the connected
 * callback) so that things like `this.setFoo = ...` are visible to external
 * querySelector callers and other component code.
 *
 * @param {Statement[]} body
 * @param {import('./expressions.js').ExprContext} ctx
 * @returns {import('roqa/ir').ExprIR[]}
 */
function extractTopLevelStatements(body, ctx) {
	/** @type {import('roqa/ir').ExprIR[]} */
	const statements = [];

	for (const stmt of body) {
		if (!t.isExpressionStatement(stmt)) continue;
		const expr = stmt.expression;

		// Skip lifecycle hook calls (handled separately)
		if (
			t.isCallExpression(expr) &&
			t.isMemberExpression(expr.callee) &&
			t.isThisExpression(expr.callee.object) &&
			t.isIdentifier(expr.callee.property) &&
			(expr.callee.property.name === "connected" ||
				expr.callee.property.name === "disconnected")
		) {
			continue;
		}

		// Skip the final defineComponent() call (top of file)
		if (
			t.isCallExpression(expr) &&
			t.isIdentifier(expr.callee) &&
			expr.callee.name === "defineComponent"
		) {
			continue;
		}

		statements.push(convertExpr(expr, ctx));
	}

	return statements;
}

/**
 * Extract lifecycle hooks from the component body.
 *
 * @param {Statement[]} body
 * @param {import('./expressions.js').ExprContext} ctx
 * @returns {LifecycleIR}
 */
function extractLifecycle(body, ctx) {
	/** @type {LifecycleIR} */
	const lifecycle = {};

	for (const stmt of body) {
		if (!t.isExpressionStatement(stmt)) continue;
		if (!t.isCallExpression(stmt.expression)) continue;

		const call = stmt.expression;
		if (!t.isMemberExpression(call.callee)) continue;
		if (!t.isThisExpression(call.callee.object)) continue;
		if (!t.isIdentifier(call.callee.property)) continue;

		const methodName = call.callee.property.name;
		const callbackArg = call.arguments[0];

		if (!callbackArg) continue;
		if (!t.isArrowFunctionExpression(callbackArg) && !t.isFunctionExpression(callbackArg)) {
			continue;
		}

		if (methodName === "connected") {
			lifecycle.onConnect = convertBody(callbackArg.body, ctx);
		} else if (methodName === "disconnected") {
			lifecycle.onDisconnect = convertBody(callbackArg.body, ctx);
		}
	}

	return lifecycle;
}

/**
 * Extract non-Roqa module imports from the AST.
 *
 * @param {File} ast
 * @returns {ImportIR[]}
 */
function extractModuleImports(ast) {
	/** @type {ImportIR[]} */
	const imports = [];

	for (const stmt of ast.program.body) {
		if (!t.isImportDeclaration(stmt)) continue;

		const source = stmt.source.value;

		// Skip type-only imports
		if (stmt.importKind === "type") continue;

		// Roqa runtime imports: hoist user-referenced runtime bindings so the
		// emitted output imports the same set of functions from "roqa".
		if (source === "roqa") {
			const roqaBindings = [];
			for (const spec of stmt.specifiers) {
				if (t.isImportSpecifier(spec) && spec.importKind === "type") continue;
				if (t.isImportSpecifier(spec)) {
					const local = spec.local.name;
					// Most roqa exports are runtime functions the user may call
					// directly (cell, bind, subscribe, etc). Only skip bindings
					// that are pure compile-time markers / never referenced at
					// runtime by user code.
					if (local === "For" || local === "Show") {
						continue;
					}
					roqaBindings.push(local);
				}
			}
			if (roqaBindings.length > 0) {
				imports.push({ kind: "import", source: "roqa", bindings: roqaBindings, sideEffect: false });
			}
			continue;
		}

		// Preserve side-effect imports so Vite can process assets like CSS.
		if (stmt.specifiers.length === 0) {
			imports.push({ kind: "import", source, bindings: [], sideEffect: true });
			continue;
		}

		const bindings = [];
		for (const spec of stmt.specifiers) {
			// Skip type-only specifiers
			if (t.isImportSpecifier(spec) && spec.importKind === "type") continue;
			if (t.isImportDefaultSpecifier(spec)) {
				bindings.push({ local: spec.local.name, kind: "default" });
			} else if (t.isImportSpecifier(spec)) {
				const imported = t.isIdentifier(spec.imported)
					? spec.imported.name
					: spec.imported.value;
				if (imported === spec.local.name) {
					bindings.push(spec.local.name);
				} else {
					bindings.push({ local: spec.local.name, imported, kind: "named" });
				}
			} else if (t.isImportNamespaceSpecifier(spec)) {
				bindings.push({ local: spec.local.name, kind: "namespace" });
			}
		}

		if (bindings.length > 0) {
			imports.push({ kind: "import", source, bindings });
		}
	}

	return imports;
}
