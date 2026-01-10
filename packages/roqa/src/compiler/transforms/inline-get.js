import { parse } from "@babel/parser";
import MagicString from "magic-string";
import { CONSTANTS, traverse } from "../utils.js";

/**
 * Inline get(), cell(), put(), set(), and bind() calls
 *
 * The key optimization is wholesale inlining of bind() callback bodies at set() locations.
 * Instead of using effect loops, we:
 * 1. Find all bind(cell, callback) calls
 * 2. Store refs to DOM elements: cell.ref_N = element
 * 3. At set() locations, inline the callback body with element vars replaced by cell.ref_N
 *
 * Transforms:
 *   get(cell) -> cell.v (or inlined function body for derived cells)
 *   cell(value) -> { v: value, e: [] }
 *   cell(() => expr) -> { v: () => expr, e: [] } (derived cell - function stored)
 *   put(cell, value) -> cell.v = value
 *   set(cell, value) -> { cell.v = value; <inlined callback bodies> }
 *   bind(cell, callback) -> cell.ref_N = element; (callback inlined at set() locations)
 */

/**
 * Pre-compiled regex for property pattern extraction
 * Matches patterns like "row.isSelected" -> prefix="row", pattern="isSelected"
 */
const PROPERTY_PATTERN_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/;

/**
 * Context class that encapsulates mutable state for a single compilation.
 * This eliminates global state and makes the compiler safe for parallel execution.
 */
class InlineContext {
	constructor() {
		/**
		 * Map to track derived cells: cellName -> { body: string, dependencies: string[] }
		 * body is the function body code (with get() already transformed to .v)
		 * dependencies is an array of cell names this derived cell depends on (direct dependencies only)
		 * @type {Map<string, {body: string, dependencies: string[]}>}
		 */
		this.derivedCells = new Map();

		/**
		 * Cache for extractPropertyPattern to avoid repeated regex matching
		 * @type {Map<string, {prefix: string, pattern: string} | null>}
		 */
		this.propertyPatternCache = new Map();
	}

	/**
	 * Register a derived cell
	 * @param {string} cellName - The cell variable name
	 * @param {string} body - The transformed function body
	 * @param {string[]} dependencies - Direct dependencies
	 */
	registerDerivedCell(cellName, body, dependencies) {
		this.derivedCells.set(cellName, { body, dependencies });
	}

	/**
	 * Check if a cell is a derived cell
	 * @param {string} cellName
	 * @returns {boolean}
	 */
	isDerivedCell(cellName) {
		return this.derivedCells.has(cellName);
	}

	/**
	 * Get the body of a derived cell
	 * @param {string} cellName
	 * @returns {{body: string, dependencies: string[]} | undefined}
	 */
	getDerivedCellInfo(cellName) {
		return this.derivedCells.get(cellName);
	}

	/**
	 * Get the fully expanded body for a derived cell, recursively resolving any
	 * references to other derived cells.
	 * @param {string} cellName - The name of the derived cell
	 * @param {Set<string>} visited - Set of already visited cells (to prevent infinite loops)
	 * @returns {string|null} - The fully expanded body, or null if not a derived cell
	 */
	getExpandedDerivedBody(cellName, visited = new Set()) {
		const info = this.derivedCells.get(cellName);
		if (!info) return null;

		// Prevent infinite loops from circular dependencies
		if (visited.has(cellName)) {
			return info.body;
		}
		visited.add(cellName);

		let expandedBody = info.body;

		// Replace any references to other derived cells with their expanded bodies
		for (const otherCellName of this.derivedCells.keys()) {
			if (otherCellName === cellName) continue;

			// Check if this body references the other derived cell
			const cellRefRegex = new RegExp(`\\b${otherCellName}\\.v\\b`, "g");
			if (cellRefRegex.test(expandedBody)) {
				// Recursively get the expanded body for the other cell
				const otherExpandedBody = this.getExpandedDerivedBody(otherCellName, visited);
				if (otherExpandedBody) {
					// Replace references with the expanded body (wrapped in parens for safety)
					expandedBody = expandedBody.replace(
						new RegExp(`\\b${otherCellName}\\.v\\b`, "g"),
						`(${otherExpandedBody})`,
					);
				}
			}
		}

		return expandedBody;
	}

	/**
	 * Get all cells that transitively depend on a given cell.
	 * This includes direct dependencies and dependencies of dependencies.
	 * @param {string} cellName - The source cell name
	 * @returns {Set<string>} - Set of all derived cell names that depend on this cell
	 */
	getTransitiveDependents(cellName) {
		const dependents = new Set();

		// Find direct dependents
		for (const [derivedCellName, derivedInfo] of this.derivedCells) {
			if (derivedInfo.dependencies.includes(cellName)) {
				dependents.add(derivedCellName);
			}
		}

		// Find transitive dependents (cells that depend on our direct dependents)
		let changed = true;
		while (changed) {
			changed = false;
			for (const [derivedCellName, derivedInfo] of this.derivedCells) {
				if (dependents.has(derivedCellName)) continue;

				// Check if this cell depends on any of our current dependents
				for (const dep of derivedInfo.dependencies) {
					if (dependents.has(dep)) {
						dependents.add(derivedCellName);
						changed = true;
						break;
					}
				}
			}
		}

		return dependents;
	}

	/**
	 * Extract the property pattern from a cell code (with caching)
	 * e.g., "row.isSelected" -> { pattern: "isSelected", prefix: "row" }
	 * e.g., "count" -> null (simple identifier, no pattern)
	 * @param {string} cellCode
	 * @returns {{prefix: string, pattern: string} | null}
	 */
	extractPropertyPattern(cellCode) {
		if (this.propertyPatternCache.has(cellCode)) {
			return this.propertyPatternCache.get(cellCode);
		}
		const match = cellCode.match(PROPERTY_PATTERN_REGEX);
		const result = match ? { prefix: match[1], pattern: match[2] } : null;
		this.propertyPatternCache.set(cellCode, result);
		return result;
	}
}

/**
 * Check if a node is a get() call
 */
function isGetCall(node) {
	return (
		node?.type === "CallExpression" &&
		node.callee?.type === "Identifier" &&
		node.callee.name === "get"
	);
}

/**
 * Check if a node is a cell() call
 */
function isCellCall(node) {
	return (
		node?.type === "CallExpression" &&
		node.callee?.type === "Identifier" &&
		node.callee.name === "cell"
	);
}

/**
 * Check if a node is a put() call
 */
function isPutCall(node) {
	return (
		node?.type === "CallExpression" &&
		node.callee?.type === "Identifier" &&
		node.callee.name === "put"
	);
}

/**
 * Check if a node is a set() call
 */
function isSetCall(node) {
	return (
		node?.type === "CallExpression" &&
		node.callee?.type === "Identifier" &&
		node.callee.name === "set"
	);
}

/**
 * Check if a node is a bind() call
 */
function isBindCall(node) {
	return (
		node?.type === "CallExpression" &&
		node.callee?.type === "Identifier" &&
		node.callee.name === "bind"
	);
}

/**
 * Find ref assignments at the component level (NOT inside bind() callbacks).
 * These are generated by codegen for simple bindings without bind():
 *   element.property = expression;  (where expression contains get(cell))
 *   cell.ref_N = element;
 *
 * Returns a map: cellCode -> [{ refNum, property, updateExpr }]
 */
function findRefAssignmentsWithoutBind(ast, code) {
	// Map: cellCode -> [{ refNum, property, updateExpr }]
	const refMappings = new Map();

	// Helper to process statements from a callback body
	function processStatements(statements) {
		// Build a map: elementVar -> { property, updateExpr, cellCodes }
		// from element.property = expression assignments
		const elementAssignments = new Map();

		// First pass: find element.property = expression (with get(cell) calls)
		for (const stmt of statements) {
			if (
				stmt.type === "ExpressionStatement" &&
				stmt.expression.type === "AssignmentExpression" &&
				stmt.expression.operator === "=" &&
				stmt.expression.left.type === "MemberExpression" &&
				stmt.expression.left.object.type === "Identifier" &&
				stmt.expression.left.property.type === "Identifier"
			) {
				const elementVar = stmt.expression.left.object.name;
				const property = stmt.expression.left.property.name;
				const rightExpr = stmt.expression.right;

				// Check if the expression contains get() calls
				const cellCodes = findGetCallCells(rightExpr, code);
				if (cellCodes.length > 0) {
					// Get the full expression and transform get(x) to x.v
					let updateExpr = code.slice(rightExpr.start, rightExpr.end);
					updateExpr = updateExpr.replace(/\bget\(([^)]+)\)/g, "$1.v");

					elementAssignments.set(elementVar, {
						property,
						updateExpr,
						cellCodes,
					});
				}
			}
		}

		// Second pass: find cell.ref_N = element assignments
		// Handle both simple identifiers (count.ref_1) and member expressions (row.label.ref_1)
		for (const stmt of statements) {
			if (
				stmt.type === "ExpressionStatement" &&
				stmt.expression.type === "AssignmentExpression" &&
				stmt.expression.operator === "=" &&
				stmt.expression.right.type === "Identifier"
			) {
				const left = stmt.expression.left;
				let cellCode = null;
				let refProp = null;

				// Pattern 1: cell.ref_N (simple identifier)
				if (
					left.type === "MemberExpression" &&
					left.object.type === "Identifier" &&
					left.property.type === "Identifier" &&
					left.property.name.startsWith(CONSTANTS.REF_PREFIX)
				) {
					cellCode = left.object.name;
					refProp = left.property.name;
				}
				// Pattern 2: obj.cell.ref_N (member expression like row.label.ref_1)
				else if (
					left.type === "MemberExpression" &&
					left.object.type === "MemberExpression" &&
					left.property.type === "Identifier" &&
					left.property.name.startsWith(CONSTANTS.REF_PREFIX)
				) {
					cellCode = code.slice(left.object.start, left.object.end);
					refProp = left.property.name;
				}

				if (cellCode && refProp) {
					const refNum = parseInt(refProp.replace(CONSTANTS.REF_PREFIX, ""), 10);
					const elementVar = stmt.expression.right.name;

					// Look up the element assignment
					const elemInfo = elementAssignments.get(elementVar);
					if (elemInfo && elemInfo.cellCodes.includes(cellCode)) {
						if (!refMappings.has(cellCode)) {
							refMappings.set(cellCode, []);
						}
						refMappings.get(cellCode).push({
							refNum,
							property: elemInfo.property,
							updateExpr: elemInfo.updateExpr,
						});
					}
				}
			}
		}
	}

	traverse(ast, {
		CallExpression(path) {
			const node = path.node;

			// Find this.connected() calls
			if (
				node.callee?.type === "MemberExpression" &&
				node.callee.object?.type === "ThisExpression" &&
				node.callee.property?.type === "Identifier" &&
				node.callee.property.name === "connected" &&
				node.arguments.length >= 1
			) {
				const callbackArg = node.arguments[0];
				if (
					callbackArg.type !== "ArrowFunctionExpression" &&
					callbackArg.type !== "FunctionExpression"
				) {
					return;
				}

				const body = callbackArg.body;
				const statements = body.type === "BlockStatement" ? body.body : [body];
				processStatements(statements);
			}

			// Find forBlock() calls and process their render callbacks
			if (
				node.callee?.type === "Identifier" &&
				node.callee.name === "forBlock" &&
				node.arguments.length >= 3
			) {
				const callbackArg = node.arguments[2];
				if (
					callbackArg.type !== "ArrowFunctionExpression" &&
					callbackArg.type !== "FunctionExpression"
				) {
					return;
				}

				const body = callbackArg.body;
				const statements = body.type === "BlockStatement" ? body.body : [body];
				processStatements(statements);
			}
		},
		noScope: true,
	});

	return refMappings;
}

/**
 * Find all cell codes referenced by get() calls in an expression
 */
function findGetCallCells(node, code) {
	const cellCodes = [];

	function visit(n) {
		if (!n) return;
		if (isGetCall(n) && n.arguments[0]) {
			cellCodes.push(code.slice(n.arguments[0].start, n.arguments[0].end));
			return;
		}
		for (const key of Object.keys(n)) {
			const child = n[key];
			if (child && typeof child === "object") {
				if (Array.isArray(child)) {
					child.forEach(visit);
				} else if (child.type) {
					visit(child);
				}
			}
		}
	}

	visit(node);
	return cellCodes;
}

/**
 * Find all forBlock and showBlock calls and collect:
 * 1. Cells that are sources for forBlock/showBlock (need effect loop at set() if no explicit .update())
 * 2. Variable assignments for forBlock/showBlock calls (for explicit .update() calls)
 *
 * Returns { sourceCells: Set<string>, variableMappings: Map<string, string> }
 */
function findBlockInfo(ast, code) {
	const sourceCells = new Set();
	const variableMappings = new Map();

	traverse(ast, {
		CallExpression(path) {
			const node = path.node;
			const isForBlock =
				node.callee?.type === "Identifier" &&
				node.callee.name === "forBlock" &&
				node.arguments.length >= 2;
			const isShowBlock =
				node.callee?.type === "Identifier" &&
				node.callee.name === "showBlock" &&
				node.arguments.length >= 2;

			if (isForBlock || isShowBlock) {
				// Always track the source cell (argument index 1 for both)
				const cellArg = node.arguments[1];
				const cellCode = code.slice(cellArg.start, cellArg.end);
				sourceCells.add(cellCode);

				// Check if this is an assignment: xxx_forBlock = forBlock(...) or xxx_showBlock = showBlock(...)
				const parent = path.parent;
				if (
					parent?.type === "AssignmentExpression" &&
					parent.left?.type === "Identifier" &&
					(parent.left.name.endsWith("_forBlock") || parent.left.name.endsWith("_showBlock"))
				) {
					variableMappings.set(cellCode, parent.left.name);
				}
			}
		},
		noScope: true,
	});

	return { sourceCells, variableMappings };
}

/**
 * Find all bind() calls and extract callback info for inlining
 * Returns a map from cell code -> array of callback info
 */
function findBindCallbacks(ast, code) {
	// Map: cellCode -> [{ callbackBody, elementVars, refNum, paramName, statementStart, statementEnd, hasClosureVars }]
	const bindCallbacks = new Map();
	// Track ref numbers per cell
	const refCounters = new Map();

	traverse(ast, {
		ExpressionStatement(path) {
			const expr = path.node.expression;
			if (!isBindCall(expr)) return;

			const cellArg = expr.arguments[0];
			const callbackArg = expr.arguments[1];
			if (!cellArg || !callbackArg) return;

			// Get callback info
			if (
				callbackArg.type !== "ArrowFunctionExpression" &&
				callbackArg.type !== "FunctionExpression"
			) {
				return;
			}

			const cellCode = code.slice(cellArg.start, cellArg.end);
			const paramName = callbackArg.params[0]?.name || "v";

			// Get the callback body
			const body = callbackArg.body;
			let bodyCode;
			if (body.type === "BlockStatement") {
				// Extract statements from block, removing braces
				bodyCode = code.slice(body.start + 1, body.end - 1).trim();
			} else {
				// Expression body
				bodyCode = code.slice(body.start, body.end);
			}

			// Find element variables used in the callback (e.g., p_1_text, tr_1)
			// Also detect closure variables that would prevent inlining
			const { elementVars, closureVars } = findElementVariables(body, code, paramName, cellCode);
			const hasClosureVars = closureVars.size > 0;

			// Get or create ref number for this cell
			const currentRef = refCounters.get(cellCode) || 0;
			const refNum = currentRef + 1;
			refCounters.set(cellCode, refNum);

			// Store bind callback info
			if (!bindCallbacks.has(cellCode)) {
				bindCallbacks.set(cellCode, []);
			}

			bindCallbacks.get(cellCode).push({
				callbackBody: bodyCode,
				elementVars,
				refNum,
				paramName,
				statementStart: path.node.start,
				statementEnd: path.node.end,
				hasClosureVars,
			});
		},
		noScope: true,
	});

	return bindCallbacks;
}

/**
 * Find element variables used in a callback body
 * Looks for element.property = ... patterns
 * Also returns closure variables that would prevent inlining
 */
function findElementVariables(body, code, paramName, cellCode) {
	const elementVars = [];
	const closureVars = new Set();
	const seen = new Set();

	// Extract the cell's base identifier (e.g., "selected" from "selected" or "row.label" from "row.label")
	const cellBaseMatch = cellCode.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
	const cellBase = cellBaseMatch ? cellBaseMatch[1] : cellCode;

	// Track identifiers that are used as property names (not variables)
	const propertyNames = new Set();

	// First pass: identify property names in member expressions
	function findPropertyNames(node) {
		if (!node) return;
		if (node.type === "MemberExpression" && node.property.type === "Identifier" && !node.computed) {
			// The property is accessed with dot notation, so it's not a variable reference
			propertyNames.add(node.property);
		}
		for (const key of Object.keys(node)) {
			const child = node[key];
			if (child && typeof child === "object") {
				if (Array.isArray(child)) {
					child.forEach(findPropertyNames);
				} else if (child.type) {
					findPropertyNames(child);
				}
			}
		}
	}
	findPropertyNames(body);

	function visit(node) {
		if (!node) return;

		// Look for element.property = ... patterns (element variable assignments)
		if (
			node.type === "AssignmentExpression" &&
			node.left.type === "MemberExpression" &&
			node.left.object.type === "Identifier"
		) {
			const varName = node.left.object.name;
			if (!seen.has(varName)) {
				seen.add(varName);
				elementVars.push({ varName });
			}
		}

		// Look for identifier.property patterns (potential closure variables)
		// e.g., row.id, item.name - these are closure variables from forBlock
		if (node.type === "MemberExpression" && node.object.type === "Identifier") {
			const varName = node.object.name;
			// Skip if it's the callback parameter, the cell, or an already identified element var
			if (varName !== paramName && varName !== cellBase && !seen.has(varName)) {
				// This could be a closure variable - mark it
				closureVars.add(varName);
			}
		}

		// Also check for standalone identifiers that could be closure variables
		// But skip identifiers that are property names in member expressions
		if (node.type === "Identifier" && !propertyNames.has(node)) {
			const varName = node.name;
			// Skip common globals and the callback parameter
			const knownGlobals = new Set([
				"undefined",
				"null",
				"true",
				"false",
				"NaN",
				"Infinity",
				"console",
				"window",
				"document",
				"Math",
				"JSON",
				"Array",
				"Object",
				"String",
				"Number",
				"Boolean",
				"Date",
				"RegExp",
				"Error",
				"Promise",
				"Map",
				"Set",
			]);
			if (
				varName !== paramName &&
				varName !== cellBase &&
				!seen.has(varName) &&
				!knownGlobals.has(varName)
			) {
				// Could be a closure variable
				closureVars.add(varName);
			}
		}

		// Recurse into child nodes
		for (const key of Object.keys(node)) {
			const child = node[key];
			if (child && typeof child === "object") {
				if (Array.isArray(child)) {
					child.forEach(visit);
				} else if (child.type) {
					visit(child);
				}
			}
		}
	}

	visit(body);

	// Remove element vars from closure vars (they're defined in the same scope level)
	for (const { varName } of elementVars) {
		closureVars.delete(varName);
	}

	return { elementVars, closureVars };
}

/**
 * Transform a callback body for inlining at a set() location
 * - Replace element variables with cell.ref_N
 * - Replace callback parameter (v) with cell.v
 * - Transform get() calls to .v access
 */
function transformCallbackBody(bodyCode, cellCode, elementVars, paramName, refNum) {
	let transformed = bodyCode;

	// Replace the callback parameter (v) with cell.v
	const paramRegex = new RegExp(`\\b${paramName}\\b`, "g");
	transformed = transformed.replace(paramRegex, `${cellCode}.v`);

	// Replace element variables with cell.ref_N
	for (const { varName } of elementVars) {
		const varRegex = new RegExp(`\\b${varName}\\b`, "g");
		transformed = transformed.replace(varRegex, `${cellCode}.${CONSTANTS.REF_PREFIX}${refNum}`);
	}

	// Transform any remaining get() calls to .v access
	transformed = transformed.replace(/\bget\(([^)]+)\)/g, "$1.v");

	return transformed;
}

/**
 * Generate ref assignment code: cell.ref_N = elementVar
 */
function generateRefAssignment(cellCode, elementVar, refNum) {
	return `${cellCode}.${CONSTANTS.REF_PREFIX}${refNum} = ${elementVar};`;
}

/**
 * Transform all get(), cell(), put(), set(), and bind() calls
 */
export function inlineGetCalls(code, filename) {
	// Create a fresh context for this compilation
	const ctx = new InlineContext();

	const isTypeScript = filename && (filename.endsWith(".tsx") || filename.endsWith(".ts"));
	const plugins = isTypeScript ? ["jsx", "typescript"] : ["jsx"];

	const ast = parse(code, {
		sourceType: "module",
		plugins,
	});

	const s = new MagicString(code);

	// Find forBlock and showBlock info (source cells and variable mappings)
	const { sourceCells: blockSourceCells, variableMappings: blockMappings } = findBlockInfo(
		ast,
		code,
		ctx,
	);

	// Find all bind() callbacks for inlining
	const bindCallbacks = findBindCallbacks(ast, code);

	// Find ref assignments without bind() (from codegen's direct ref approach)
	const refWithoutBind = findRefAssignmentsWithoutBind(ast, code, ctx);

	// Track all calls to transform
	const getCalls = [];
	const cellCalls = [];
	const putCalls = [];
	const setCalls = [];

	// Track bind statements to remove
	const bindStatementsToRemove = [];

	// Track roqa imports for removal
	const importsToRemove = [];

	// Collect bind statements to remove
	for (const [cellCode, callbacks] of bindCallbacks) {
		for (const cb of callbacks) {
			bindStatementsToRemove.push({
				start: cb.statementStart,
				end: cb.statementEnd,
				cellCode,
				callback: cb,
			});
		}
	}

	// First pass: identify derived cells (cells with arrow function arguments)
	traverse(ast, {
		VariableDeclarator(path) {
			if (path.node.id.type === "Identifier" && path.node.init && isCellCall(path.node.init)) {
				const cellName = path.node.id.name;
				const arg = path.node.init.arguments[0];

				// Check if the argument is an arrow function or function expression
				if (arg && (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression")) {
					// Extract the function body and transform get() calls to .v
					const body = arg.body;
					let bodyCode;
					if (body.type === "BlockStatement") {
						// For block bodies, we'd need to handle return statements
						// For now, skip these complex cases
						return;
					} else {
						// Expression body - inline it directly
						bodyCode = code.slice(body.start, body.end);
					}

					// Extract dependencies from get() calls
					const dependencies = [];
					const getCallRegex = /\bget\(([^)]+)\)/g;
					let match;
					while ((match = getCallRegex.exec(bodyCode)) !== null) {
						dependencies.push(match[1].trim());
					}

					// Transform get() calls in the body to .v access
					const transformedBody = bodyCode.replace(/\bget\(([^)]+)\)/g, "$1.v");
					ctx.registerDerivedCell(cellName, transformedBody, dependencies);
				}
			}
		},
		noScope: true,
	});

	// Second pass: collect all calls to transform
	traverse(ast, {
		CallExpression(path) {
			if (isGetCall(path.node)) {
				const arg = path.node.arguments[0];
				if (arg) {
					const argCode = code.slice(arg.start, arg.end);
					const derivedInfo = ctx.getDerivedCellInfo(argCode);
					getCalls.push({
						start: path.node.start,
						end: path.node.end,
						argCode,
						// Check if this is a derived cell
						isDerived: !!derivedInfo,
						derivedBody: derivedInfo?.body || null,
					});
				}
			} else if (isCellCall(path.node)) {
				const arg = path.node.arguments[0];
				cellCalls.push({
					start: path.node.start,
					end: path.node.end,
					argStart: arg?.start,
					argEnd: arg?.end,
				});
			} else if (isPutCall(path.node)) {
				const cellArg = path.node.arguments[0];
				const valueArg = path.node.arguments[1];
				if (cellArg) {
					putCalls.push({
						start: path.node.start,
						end: path.node.end,
						cellStart: cellArg.start,
						cellEnd: cellArg.end,
						valueStart: valueArg?.start,
						valueEnd: valueArg?.end,
					});
				}
			} else if (isSetCall(path.node)) {
				const cellArg = path.node.arguments[0];
				const valueArg = path.node.arguments[1];
				if (cellArg) {
					const cellCode = code.slice(cellArg.start, cellArg.end);
					setCalls.push({
						start: path.node.start,
						end: path.node.end,
						cellStart: cellArg.start,
						cellEnd: cellArg.end,
						cellCode,
						valueStart: valueArg?.start,
						valueEnd: valueArg?.end,
						blockVar: blockMappings.get(cellCode) || null,
					});
				}
			}
		},
		ImportDeclaration(path) {
			const source = path.node.source.value;
			if (source === "roqa") {
				for (const specifier of path.node.specifiers) {
					if (specifier.type === "ImportSpecifier") {
						const name = specifier.imported.name;
						if (["get", "cell", "put", "set", "bind"].includes(name)) {
							importsToRemove.push({ name, specifier });
						}
					}
				}
			}
		},
		noScope: true,
	});

	// Sort all calls by position descending (process from end to start)
	const allCalls = [
		...getCalls.map((c) => ({ ...c, type: "get" })),
		...cellCalls.map((c) => ({ ...c, type: "cell" })),
		...putCalls.map((c) => ({ ...c, type: "put" })),
		...setCalls.map((c) => ({ ...c, type: "set" })),
	].sort((a, b) => b.start - a.start);

	// Process calls
	for (const call of allCalls) {
		if (call.type === "get") {
			// If this is a derived cell, inline the fully expanded function body
			if (call.isDerived) {
				const expandedBody = ctx.getExpandedDerivedBody(call.argCode);
				s.overwrite(call.start, call.end, `(${expandedBody})`);
			} else {
				s.overwrite(call.start, call.end, `${call.argCode}.v`);
			}
		} else if (call.type === "cell") {
			const argCode = call.argStart != null ? s.slice(call.argStart, call.argEnd) : "undefined";
			s.overwrite(call.start, call.end, `{ v: ${argCode}, e: [] }`);
		} else if (call.type === "put") {
			const cellCode = s.slice(call.cellStart, call.cellEnd);
			const valueCode =
				call.valueStart != null ? s.slice(call.valueStart, call.valueEnd) : "undefined";
			s.overwrite(call.start, call.end, `(${cellCode}.v = ${valueCode})`);
		} else if (call.type === "set") {
			const c = s.slice(call.cellStart, call.cellEnd);
			const v = call.valueStart != null ? s.slice(call.valueStart, call.valueEnd) : "undefined";

			// Helper to generate inlined updates from bind callbacks
			// Only include callbacks that were fully inlined (have element vars)
			const generateBindCallbackUpdates = () => {
				let callbacks = bindCallbacks.get(call.cellCode);
				let callbackCellCode = call.cellCode;

				// If no exact match, try pattern match (e.g., "prev.isSelected" matches "row.isSelected")
				if ((!callbacks || callbacks.length === 0) && call.cellCode.includes(".")) {
					const patternInfo = ctx.extractPropertyPattern(call.cellCode);
					if (patternInfo) {
						for (const [existingCellCode, existingCallbacks] of bindCallbacks) {
							const existingPattern = ctx.extractPropertyPattern(existingCellCode);
							if (existingPattern && existingPattern.pattern === patternInfo.pattern) {
								callbacks = existingCallbacks;
								callbackCellCode = existingCellCode;
								break;
							}
						}
					}
				}

				if (callbacks && callbacks.length > 0) {
					// Filter to only include callbacks that:
					// 1. Have element vars (can update DOM elements)
					// 2. Don't have closure vars (can be inlined at set() call sites)
					const inlinableCallbacks = callbacks.filter(
						(cb) => cb.elementVars.length > 0 && !cb.hasClosureVars,
					);
					return inlinableCallbacks
						.map((cb) => {
							let body = transformCallbackBody(
								cb.callbackBody,
								callbackCellCode,
								cb.elementVars,
								cb.paramName,
								cb.refNum,
							);
							if (callbackCellCode !== call.cellCode) {
								const originalPattern = ctx.extractPropertyPattern(callbackCellCode);
								const actualPattern = ctx.extractPropertyPattern(call.cellCode);
								if (originalPattern && actualPattern) {
									const regex = new RegExp(
										`\\b${originalPattern.prefix}\\.${originalPattern.pattern}\\b`,
										"g",
									);
									body = body.replace(regex, `${actualPattern.prefix}.${actualPattern.pattern}`);
								}
							}
							return body;
						})
						.join(" ");
				}
				return "";
			};

			// Helper to generate updates from ref assignments without bind()
			const generateRefUpdates = () => {
				let refInfos = refWithoutBind.get(call.cellCode);
				let refCellCode = call.cellCode;

				if ((!refInfos || refInfos.length === 0) && call.cellCode.includes(".")) {
					const patternInfo = ctx.extractPropertyPattern(call.cellCode);
					if (patternInfo) {
						for (const [existingCellCode, existingRefInfos] of refWithoutBind) {
							const existingPattern = ctx.extractPropertyPattern(existingCellCode);
							if (existingPattern && existingPattern.pattern === patternInfo.pattern) {
								refInfos = existingRefInfos;
								refCellCode = existingCellCode;
								break;
							}
						}
					}
				}

				if (refInfos && refInfos.length > 0) {
					return refInfos
						.map((info) => {
							let update = `${refCellCode}.${CONSTANTS.REF_PREFIX}${info.refNum}.${info.property} = ${info.updateExpr};`;
							if (refCellCode !== call.cellCode) {
								const originalPattern = ctx.extractPropertyPattern(refCellCode);
								const actualPattern = ctx.extractPropertyPattern(call.cellCode);
								if (originalPattern && actualPattern) {
									const regex = new RegExp(
										`\\b${originalPattern.prefix}\\.${originalPattern.pattern}\\b`,
										"g",
									);
									update = update.replace(
										regex,
										`${actualPattern.prefix}.${actualPattern.pattern}`,
									);
								}
							}
							return update;
						})
						.join(" ");
				}
				return "";
			};

			// Helper to generate updates for derived cells that depend on this cell (transitively)
			const generateDerivedCellUpdates = () => {
				const updates = [];
				const seenUpdates = new Set(); // Deduplicate updates

				// Get ALL cells that transitively depend on the cell being set
				const transitiveDependents = ctx.getTransitiveDependents(call.cellCode);

				for (const derivedCellName of transitiveDependents) {
					// Find refs for the derived cell to update them
					const derivedRefInfos = refWithoutBind.get(derivedCellName);
					if (derivedRefInfos && derivedRefInfos.length > 0) {
						// Get the fully expanded body for this derived cell
						const expandedBody = ctx.getExpandedDerivedBody(derivedCellName);

						for (const info of derivedRefInfos) {
							// Replace references to the derived cell with its fully expanded body
							// e.g., "Doubled: " + doubled.v -> "Doubled: " + count.v * 2
							// e.g., "Quadrupled: " + quadrupled.v -> "Quadrupled: " + count.v * 2 * 2
							let updateExpr = info.updateExpr.replace(
								new RegExp(`\\b${derivedCellName}\\.v\\b`, "g"),
								`(${expandedBody})`,
							);
							const updateCode = `${derivedCellName}.${CONSTANTS.REF_PREFIX}${info.refNum}.${info.property} = ${updateExpr};`;

							// Deduplicate
							if (!seenUpdates.has(updateCode)) {
								seenUpdates.add(updateCode);
								updates.push(updateCode);
							}
						}
					}
				}
				return updates.join(" ");
			};

			// Collect all updates
			const bindUpdates = generateBindCallbackUpdates();
			const refUpdates = generateRefUpdates();
			const derivedUpdates = generateDerivedCellUpdates();
			const blockUpdate = call.blockVar ? `${call.blockVar}.update();` : "";

			// Check if there are non-inlined bind callbacks for this cell
			// These are callbacks that:
			// 1. Have no element vars (can't update DOM), OR
			// 2. Have closure vars (can't be inlined at set() call sites)
			let hasNonInlinedBinds = false;
			const cellCallbacks = bindCallbacks.get(call.cellCode);
			if (cellCallbacks) {
				hasNonInlinedBinds = cellCallbacks.some(
					(cb) => cb.elementVars.length === 0 || cb.hasClosureVars,
				);
			}

			// Check if this cell is a source for forBlock/showBlock
			// First check exact match
			let isBlockSource = blockSourceCells.has(call.cellCode);

			// If not an exact match and this is a member expression (foo.bar), check if any
			// block source has the same property name (pattern matching)
			// e.g., todoColumn.tasks should match column.tasks
			if (!isBlockSource && call.cellCode.includes(".")) {
				const callPattern = ctx.extractPropertyPattern(call.cellCode);
				if (callPattern) {
					for (const sourceCell of blockSourceCells) {
						const sourcePattern = ctx.extractPropertyPattern(sourceCell);
						if (sourcePattern && sourcePattern.pattern === callPattern.pattern) {
							isBlockSource = true;
							break;
						}
					}
				}
			}

			// Effect loop needed for:
			// 1. Non-inlined bind() callbacks
			// 2. Cells that are sources for forBlock/showBlock WITHOUT an explicit .update() call
			//    (if we have blockVar, we call .update() directly, so no need for effect loop)
			const needsEffectLoop = hasNonInlinedBinds || (isBlockSource && !call.blockVar);
			const effectLoop = needsEffectLoop
				? `for (let i = 0; i < ${c}.e.length; i++) ${c}.e[i](${c}.v);`
				: "";

			// Combine all updates
			const allUpdates = [blockUpdate, bindUpdates, refUpdates, derivedUpdates, effectLoop]
				.filter(Boolean)
				.join(" ");

			// Always wrap in block with effect loop to support runtime bindings
			s.overwrite(call.start, call.end, `{ ${c}.v = ${v}; ${allUpdates} }`);
		}
	}

	// Remove bind statements and add ref assignments in their place
	// Sort by position descending
	bindStatementsToRemove.sort((a, b) => b.start - a.start);

	for (const { start, end, cellCode, callback } of bindStatementsToRemove) {
		// Don't inline bind() calls that have closure variables (e.g., from forBlock item parameter)
		// These callbacks capture variables like `row` that won't be in scope at set() call sites
		if (callback.hasClosureVars) {
			// Keep the bind() call - runtime handles execution
			continue;
		}

		// Generate ref assignment for each element variable
		let refAssignment = "";
		for (const { varName } of callback.elementVars) {
			refAssignment += generateRefAssignment(cellCode, varName, callback.refNum);
		}

		// Replace bind() call with ref assignment(s)
		if (refAssignment) {
			s.overwrite(start, end, refAssignment);
		} else {
			// No element vars found - bind() can't be fully inlined
			// Keep the bind() call but wrap it to run immediately AND register for updates
			// This handles complex callbacks like d3.select().call() patterns
			// Don't remove - leave bind() in place (runtime handles immediate execution)
		}
	}

	// Remove imports that are no longer needed
	// Collect all imports to remove first
	// Only remove bind import if ALL bind calls were fully inlined (had element vars and no closure vars)
	const allBindsInlined = bindStatementsToRemove.every(
		(b) => b.callback.elementVars.length > 0 && !b.callback.hasClosureVars,
	);
	const shouldRemoveBind = bindStatementsToRemove.length > 0 && allBindsInlined;
	const importsToActuallyRemove = importsToRemove.filter(({ name }) => {
		return (
			(name === "get" && getCalls.length > 0) ||
			(name === "cell" && cellCalls.length > 0) ||
			(name === "put" && putCalls.length > 0) ||
			(name === "set" && setCalls.length > 0) ||
			(name === "bind" && shouldRemoveBind)
		);
	});

	// Sort by position
	importsToActuallyRemove.sort((a, b) => a.specifier.start - b.specifier.start);

	// Remove from right to left to preserve positions
	for (let i = importsToActuallyRemove.length - 1; i >= 0; i--) {
		const { specifier } = importsToActuallyRemove[i];

		// Check if this is the first import (after opening brace)
		const beforeSpecifier = code.slice(Math.max(0, specifier.start - 2), specifier.start);
		const afterSpecifier = code.slice(specifier.end, specifier.end + 2);

		let startPos = specifier.start;
		let endPos = specifier.end;

		if (afterSpecifier.startsWith(", ")) {
			// Remove trailing ", "
			endPos = specifier.end + 2;
		} else if (afterSpecifier.startsWith(",")) {
			// Remove trailing ","
			endPos = specifier.end + 1;
		} else if (beforeSpecifier.endsWith(", ")) {
			// No trailing comma - remove leading ", "
			startPos = specifier.start - 2;
		}

		s.remove(startPos, endPos);
	}

	return {
		code: s.toString(),
		map: s.generateMap({
			source: filename,
			file: filename + ".map",
			includeContent: true,
		}),
	};
}
