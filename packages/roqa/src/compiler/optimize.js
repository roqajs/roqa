/** @typedef {import("../../types/compiler.d.ts").ComponentLIR} ComponentLIR */
/** @typedef {import("../../types/compiler.d.ts").ComponentIR} ComponentIR */
/** @typedef {import("../../types/compiler.d.ts").ExprIR} ExprIR */

import { compileExpr, compileExpandedExpr } from "./expr-compiler.js";

/**
 * Run optimization passes on a ComponentLIR.
 * @param {ComponentLIR} lir
 * @param {ComponentIR} mir - Original MIR for computed body access
 * @returns {ComponentLIR}
 */
export function optimize(lir, mir) {
	let result = lir;
	result = inlineCells(result);
	result = inlineBindings(result, mir);
	return result;
}

/**
 * Pass 1: Inline cells.
 * Sets CellOp.inlined = true for all cells.
 * @param {ComponentLIR} lir
 * @returns {ComponentLIR}
 */
function inlineCells(lir) {
	return {
		...lir,
		cells: lir.cells.map((cell) => ({
			...cell,
			inlined: true,
		})),
	};
}

/**
 * Pass 2: Inline bindings.
 * Sets BindingOp.inlined = true and populates FunctionOp.inlinedSets.
 * @param {ComponentLIR} lir
 * @param {ComponentIR} mir
 * @returns {ComponentLIR}
 */
function inlineBindings(lir, mir) {
	// Build computed dependency map
	/** @type {Map<string, ExprIR>} */
	const computedBodies = new Map();
	/** @type {Map<string, Set<string>>} computed name → state cells it reads */
	const computedDeps = new Map();

	for (const state of mir.state) {
		if (state.kind === "computed") {
			computedBodies.set(state.name, state.body);
			const deps = new Set();
			collectDeps(state.body, deps);
			computedDeps.set(state.name, deps);
		}
	}

	// Build a map: cellName → bindings that reference it
	/** @type {Map<string, import("../../types/compiler.d.ts").BindingOp[]>} */
	const cellBindings = new Map();
	for (const binding of lir.connected.bindings) {
		if (!binding.cellName) continue;
		if (!cellBindings.has(binding.cellName)) {
			cellBindings.set(binding.cellName, []);
		}
		cellBindings.get(binding.cellName).push(binding);
	}

	// Build block controller map: cellName → block controller updates
	/** @type {Map<string, import("../../types/compiler.d.ts").InlinedBlockUpdate[]>} */
	const cellBlockUpdates = new Map();
	for (const block of lir.connected.blocks) {
		// For switch blocks, register the controller against every dep cell
		// so any state-write that touches a dep triggers `controller.update()`.
		if (block.blockType === "switch") {
			const deps = block.switchDeps || [];
			for (const cellName of deps) {
				if (!cellBlockUpdates.has(cellName)) {
					cellBlockUpdates.set(cellName, []);
				}
				cellBlockUpdates.get(cellName).push({
					blockVar: block.controllerVar,
					method: "update",
				});
			}
			continue;
		}

		if (!cellBlockUpdates.has(block.source)) {
			cellBlockUpdates.set(block.source, []);
		}
		cellBlockUpdates.get(block.source).push({
			blockVar: block.controllerVar,
			method: "update",
		});
		if (block.fallbackControllerVar) {
			cellBlockUpdates.get(block.source).push({
				blockVar: block.fallbackControllerVar,
				method: "update",
			});
		}
		if (block.emptyControllerVar) {
			cellBlockUpdates.get(block.source).push({
				blockVar: block.emptyControllerVar,
				method: "update",
			});
		}
	}

	// Get transitive dependents: which computed cells depend on a state cell
	/**
	 * @param {string} cellName
	 * @returns {string[]} computed names that depend on cellName
	 */
	function getTransitiveDependents(cellName) {
		const dependents = [];
		for (const [computedName, deps] of computedDeps) {
			if (deps.has(cellName) || hasTransitiveDep(computedName, cellName, computedDeps)) {
				dependents.push(computedName);
			}
		}
		return dependents;
	}

	// Now populate inlinedSets for each function
	const functions = lir.functions.map((fn) => {
		const inlinedSets = fn.inlinedSets.map((set) => {
			/** @type {import("../../types/compiler.d.ts").InlinedUpdate[]} */
			const updates = [];
			/** @type {import("../../types/compiler.d.ts").InlinedBlockUpdate[]} */
			const blockUpdates = [];

			// Direct bindings for this cell
			const directBindings = cellBindings.get(set.cellName) || [];
			for (const binding of directBindings) {
				let target;
				if (binding.isSvgAttr) {
					target = `__svg:${binding.refName}:${binding.property}`;
				} else if (binding.isStyleProp) {
					target = `__style:${binding.refName}:${binding.property}`;
				} else {
					target = binding.refName + "." + binding.property;
				}
				updates.push({
					target,
					expression: binding.expression,
				});
			}

			// Block controller updates for this cell
			const blocks = cellBlockUpdates.get(set.cellName) || [];
			for (const block of blocks) {
				blockUpdates.push(block);
			}

			// Transitive computed dependents
			const dependents = getTransitiveDependents(set.cellName);
			for (const computedName of dependents) {
				const computedBindings = cellBindings.get(computedName) || [];
				for (const binding of computedBindings) {
					// Expand the binding expression with computed bodies
					const expandedExpr = expandBindingExpression(
						binding.expression,
						computedName,
						computedBodies,
					);
					updates.push({
						target: binding.refName + "." + binding.property,
						expression: expandedExpr,
					});
				}

				// Block updates for computed cell dependents
				const computedBlocks = cellBlockUpdates.get(computedName) || [];
				for (const block of computedBlocks) {
					blockUpdates.push(block);
				}
			}

			return {
				...set,
				updates,
				blockUpdates,
				notify: false,
			};
		});

		return { ...fn, inlinedSets };
	});

	// Mark all bindings as inlined
	const bindings = lir.connected.bindings.map((b) => ({
		...b,
		inlined: true,
	}));

	return {
		...lir,
		functions,
		connected: {
			...lir.connected,
			bindings,
		},
	};
}

/**
 * Expand a binding expression by replacing computed references with expanded bodies.
 * @param {string} expression
 * @param {string} computedName
 * @param {Map<string, ExprIR>} computedBodies
 * @returns {string}
 */
function expandBindingExpression(expression, computedName, computedBodies) {
	const body = computedBodies.get(computedName);
	if (!body) return expression;

	// Replace computedName.v with the expanded body
	const expandedBody = compileExpandedExpr(body, computedBodies);
	return expression.replace(new RegExp(`${computedName}\\.v`, "g"), expandedBody);
}

/**
 * Check if computedName transitively depends on targetCell.
 * @param {string} computedName
 * @param {string} targetCell
 * @param {Map<string, Set<string>>} computedDeps
 * @param {Set<string>} [visited]
 * @returns {boolean}
 */
function hasTransitiveDep(computedName, targetCell, computedDeps, visited = new Set()) {
	if (visited.has(computedName)) return false;
	visited.add(computedName);

	const deps = computedDeps.get(computedName);
	if (!deps) return false;

	for (const dep of deps) {
		if (dep === targetCell) return true;
		if (computedDeps.has(dep) && hasTransitiveDep(dep, targetCell, computedDeps, visited)) {
			return true;
		}
	}
	return false;
}

/**
 * Collect all state and computed cell names an expression reads.
 * @param {ExprIR} expr
 * @param {Set<string>} deps
 */
function collectDeps(expr, deps) {
	if (!expr || typeof expr !== "object") return;
	switch (expr.kind) {
		case "state-read":
		case "computed-read":
			deps.add(expr.name);
			break;
		case "binary":
			collectDeps(expr.left, deps);
			collectDeps(expr.right, deps);
			break;
		case "unary":
			collectDeps(expr.operand, deps);
			break;
		case "call":
			collectDeps(expr.callee, deps);
			for (const a of expr.args) collectDeps(a, deps);
			break;
		case "method-call":
			collectDeps(expr.object, deps);
			for (const a of expr.args) collectDeps(a, deps);
			break;
		case "member":
			collectDeps(expr.object, deps);
			break;
		case "closure":
			collectDeps(expr.body, deps);
			break;
		case "conditional":
			collectDeps(expr.test, deps);
			collectDeps(expr.consequent, deps);
			collectDeps(expr.alternate, deps);
			break;
	}
}
