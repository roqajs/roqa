import MagicString from 'magic-string';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

// Handle CJS/ESM interop
const traverse = _traverse.default || _traverse;

/**
 * Inline get(), cell(), put(), and set() calls to direct property/object access
 * Also replaces effect loops with for_block.update() calls when applicable
 * And replaces effect loops with direct DOM updates when cells have refs
 *
 * Transforms:
 *   get(cell) -> cell.v
 *   cell(value) -> { v: value, e: [] }
 *   put(cell, value) -> cell.v = value
 *   set(cell, value) -> (cell.v = value, for loop to notify effects)
 *                    -> cell_for_block.update() (when cell has an associated for_block)
 *                    -> cell.v = value; cell.ref_X.X = cell.v; (when cell has refs)
 *
 * This is a performance optimization that avoids function call overhead
 */

/**
 * Check if a node is a get() call
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
function isGetCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'get'
	);
}

/**
 * Check if a node is a cell() call
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
function isCellCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'cell'
	);
}

/**
 * Check if a node is a put() call
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
function isPutCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'put'
	);
}

/**
 * Check if a node is a set() call
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
function isSetCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'set'
	);
}

/**
 * Find all for_block variable assignments and map cell names to for_block variable names
 * Looks for patterns like: rows_for_block = for_block(container, rows, ...)
 * @param {import("@babel/types").File} ast
 * @param {string} code
 * @returns {Map<string, string>} Map from cell name to for_block variable name
 */
function findForBlockMappings(ast, code) {
	const mappings = new Map();

	traverse(ast, {
		AssignmentExpression(path) {
			const node = path.node;
			// Look for: xxx_for_block = for_block(container, cellExpr, ...)
			if (
				node.left.type === 'Identifier' &&
				node.left.name.endsWith('_for_block') &&
				node.right.type === 'CallExpression' &&
				node.right.callee.type === 'Identifier' &&
				node.right.callee.name === 'for_block' &&
				node.right.arguments.length >= 2
			) {
				const forBlockVarName = node.left.name;
				const cellArg = node.right.arguments[1];
				const cellCode = code.slice(cellArg.start, cellArg.end);
				mappings.set(cellCode, forBlockVarName);
			}
		},
		noScope: true,
	});

	return mappings;
}

/**
 * Find all ref assignments inside for_block callbacks
 * Looks for patterns like:
 *   element.property = cell.v;  (initial assignment)
 *   cell.ref_N = element;       (ref storage)
 *
 * @param {import("@babel/types").File} ast
 * @param {string} code
 * @returns {Map<string, Array<{refProp: string, domProp: string}>>}
 *          Map from cell property name (e.g., 'label') to array of refs
 */
function findRefAssignments(ast, code) {
	// Map: cellPropertyName -> [{refProp, domProp}]
	// e.g., 'label' -> [{refProp: 'ref_1', domProp: 'nodeValue'}]
	const refMappings = new Map();

	traverse(ast, {
		CallExpression(path) {
			const node = path.node;
			// Find for_block calls
			if (
				node.callee.type === 'Identifier' &&
				node.callee.name === 'for_block' &&
				node.arguments.length >= 3
			) {
				const callbackArg = node.arguments[2];
				// The callback can be ArrowFunctionExpression or FunctionExpression
				if (
					callbackArg.type === 'ArrowFunctionExpression' ||
					callbackArg.type === 'FunctionExpression'
				) {
					// Get the item parameter name (usually 'row' or 'item')
					const itemParam = callbackArg.params[1];
					if (!itemParam || itemParam.type !== 'Identifier') return;
					const itemParamName = itemParam.name;

					// Find ref assignments in the callback body
					const body = callbackArg.body;
					const statements = body.type === 'BlockStatement' ? body.body : [body];

					// Build a map of element variables to their DOM property assignments
					// e.g., 'a_1_text' -> 'nodeValue' (from a_1_text.nodeValue = ...)
					const elementToDomProp = new Map();

					// First pass: find all element.property = cell.v OR element.property = get(cell) assignments
					for (const stmt of statements) {
						if (
							stmt.type === 'ExpressionStatement' &&
							stmt.expression.type === 'AssignmentExpression' &&
							stmt.expression.operator === '='
						) {
							const left = stmt.expression.left;
							const right = stmt.expression.right;

							// Check if left side is element.domProp pattern
							if (
								left.type === 'MemberExpression' &&
								left.object.type === 'Identifier' &&
								left.property.type === 'Identifier'
							) {
								// Check right side for cell.v OR get(cell) pattern
								const isCellV =
									right.type === 'MemberExpression' &&
									right.property.type === 'Identifier' &&
									right.property.name === 'v';

								const isGetCall =
									right.type === 'CallExpression' &&
									right.callee.type === 'Identifier' &&
									right.callee.name === 'get';

								if (isCellV || isGetCall) {
									const elementVar = left.object.name;
									const domProp = left.property.name;
									elementToDomProp.set(elementVar, domProp);
								}
							}
						}
					}

					// Second pass: find ref assignments and match with DOM properties
					for (const stmt of statements) {
						// Look for: itemParam.cellProp.ref_N = element
						if (
							stmt.type === 'ExpressionStatement' &&
							stmt.expression.type === 'AssignmentExpression' &&
							stmt.expression.operator === '='
						) {
							const left = stmt.expression.left;
							const right = stmt.expression.right;

							// Pattern: x.y.ref_N where x is itemParam
							if (
								left.type === 'MemberExpression' &&
								left.object.type === 'MemberExpression' &&
								left.object.object.type === 'Identifier' &&
								left.object.object.name === itemParamName &&
								left.object.property.type === 'Identifier' &&
								left.property.type === 'Identifier' &&
								left.property.name.startsWith('ref_') &&
								right.type === 'Identifier'
							) {
								const cellPropName = left.object.property.name; // e.g., 'label'
								const refPropName = left.property.name; // e.g., 'ref_1'
								const elementVar = right.name; // e.g., 'a_1_text'

								// Look up the DOM property for this element
								const domPropName = elementToDomProp.get(elementVar);
								if (domPropName) {
									if (!refMappings.has(cellPropName)) {
										refMappings.set(cellPropName, []);
									}
									refMappings.get(cellPropName).push({
										refProp: refPropName,
										domProp: domPropName,
									});
								}
							}
						}
					}
				}
			}
		},
		noScope: true,
	});

	return refMappings;
}

/**
 * Check if a cell expression is a property access that has refs
 * e.g., 'row.label' where 'label' has refs
 *
 * @param {string} cellCode - The cell expression code (e.g., 'row.label')
 * @param {Map} refMappings - Map of cell property names to refs
 * @returns {{cellPropName: string, refs: Array} | null}
 */
function getCellRefInfo(cellCode, refMappings) {
	// Match pattern: anything.propertyName (e.g., row.label, item.is_selected)
	const match = cellCode.match(/^(.+)\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
	if (!match) return null;

	const [, , cellPropName] = match;
	const refs = refMappings.get(cellPropName);
	if (!refs || refs.length === 0) return null;

	return { cellPropName, refs };
}

/**
 * Transform all get(), cell(), put(), and set() calls in code to direct access/objects
 * Also removes those imports from rift-js since they're no longer needed
 *
 * @param {string} code - The code to transform
 * @param {string} filename - Source filename for source maps
 * @returns {{ code: string, map: object }}
 */
export function inlineGetCalls(code, filename) {
	// Parse the code
	const ast = parse(code, {
		sourceType: 'module',
		plugins: ['jsx'],
	});

	const s = new MagicString(code);

	// Find for_block mappings (cell name -> for_block variable name)
	const forBlockMappings = findForBlockMappings(ast, code);

	// Find ref assignments in for_block callbacks (cell property -> refs)
	const refMappings = findRefAssignments(ast, code);

	// Track all calls to inline
	const getCalls = [];
	const cellCalls = [];
	const putCalls = [];
	const setCalls = [];

	// Track rift-js imports for removal
	const importsToRemove = [];

	traverse(ast, {
		CallExpression(path) {
			if (isGetCall(path.node)) {
				const arg = path.node.arguments[0];
				if (arg) {
					getCalls.push({
						start: path.node.start,
						end: path.node.end,
						argCode: code.slice(arg.start, arg.end),
					});
				}
			} else if (isCellCall(path.node)) {
				const arg = path.node.arguments[0];
				// Use source slice - we'll update with MagicString which tracks changes
				const argCode = arg ? code.slice(arg.start, arg.end) : 'undefined';
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
						// Check if this cell has an associated for_block
						forBlockVar: forBlockMappings.get(cellCode) || null,
					});
				}
			}
		},
		ImportDeclaration(path) {
			const source = path.node.source.value;
			if (source === 'rift-js') {
				for (const specifier of path.node.specifiers) {
					if (specifier.type === 'ImportSpecifier') {
						const name = specifier.imported.name;
						if (name === 'get' || name === 'cell' || name === 'put' || name === 'set') {
							importsToRemove.push({
								name,
								specifier,
							});
						}
					}
				}
			}
		},
		noScope: true,
	});

	// Combine all calls and sort by start position descending
	// to apply transformations in reverse order (preserves positions)
	// This ensures nested calls (e.g., get() inside set()) are transformed first
	const allCalls = [
		...getCalls.map((c) => ({ ...c, type: 'get' })),
		...cellCalls.map((c) => ({ ...c, type: 'cell' })),
		...putCalls.map((c) => ({ ...c, type: 'put' })),
		...setCalls.map((c) => ({ ...c, type: 'set' })),
	].sort((a, b) => b.start - a.start);

	for (const call of allCalls) {
		if (call.type === 'get') {
			// Replace get(x) with x.v
			s.overwrite(call.start, call.end, `${call.argCode}.v`);
		} else if (call.type === 'cell') {
			// Replace cell(x) with { v: x, e: [] }
			// Use s.slice to get potentially transformed content
			const argCode = call.argStart != null ? s.slice(call.argStart, call.argEnd) : 'undefined';
			s.overwrite(call.start, call.end, `{ v: ${argCode}, e: [] }`);
		} else if (call.type === 'put') {
			// Replace put(cell, value) with (cell.v = value)
			const cellCode = s.slice(call.cellStart, call.cellEnd);
			const valueCode =
				call.valueStart != null ? s.slice(call.valueStart, call.valueEnd) : 'undefined';
			s.overwrite(call.start, call.end, `(${cellCode}.v = ${valueCode})`);
		} else if (call.type === 'set') {
			const c = s.slice(call.cellStart, call.cellEnd);
			const v = call.valueStart != null ? s.slice(call.valueStart, call.valueEnd) : 'undefined';

			if (call.forBlockVar) {
				// Cell has an associated for_block - use .update() instead of effect loop
				// { cell.v = value; cell_for_block.update(); }
				s.overwrite(call.start, call.end, `{ ${c}.v = ${v}; ${call.forBlockVar}.update(); }`);
			} else {
				// Check if this cell has refs for direct DOM updates
				const refInfo = getCellRefInfo(c, refMappings);

				if (refInfo && refInfo.refs.length > 0) {
					// Cell has refs - use direct DOM updates instead of effect loop
					// { cell.v = value; cell.ref_X.X = cell.v; }
					const directUpdates = refInfo.refs
						.map((ref) => `${c}.${ref.refProp}.${ref.domProp} = ${c}.v;`)
						.join(' ');
					s.overwrite(call.start, call.end, `{ ${c}.v = ${v}; ${directUpdates} }`);
				} else {
					// No for_block and no refs - use the generic effect loop
					// { cell.v = value; for (let i = 0; i < cell.e.length; i++) cell.e[i](cell.v); }
					s.overwrite(
						call.start,
						call.end,
						`{ ${c}.v = ${v}; for (let i = 0; i < ${c}.e.length; i++) ${c}.e[i](${c}.v); }`
					);
				}
			}
		}
	}

	// Remove imports that are no longer needed
	for (const { name, specifier } of importsToRemove) {
		const shouldRemove =
			(name === 'get' && getCalls.length > 0) ||
			(name === 'cell' && cellCalls.length > 0) ||
			(name === 'put' && putCalls.length > 0) ||
			(name === 'set' && setCalls.length > 0);

		if (shouldRemove) {
			removeImportSpecifier(s, code, specifier);
		}
	}

	return {
		code: s.toString(),
		map: s.generateMap({
			source: filename,
			file: filename + '.map',
			includeContent: true,
		}),
	};
}

/**
 * Remove an import specifier from the source, handling commas properly
 * @param {MagicString} s - The MagicString instance
 * @param {string} code - The original code
 * @param {object} specifier - The import specifier node
 */
function removeImportSpecifier(s, code, specifier) {
	const importStart = specifier.start;
	const importEnd = specifier.end;

	// Check for trailing comma/space
	let endPos = importEnd;
	const afterImport = code.slice(importEnd, importEnd + 3);
	if (afterImport.startsWith(', ')) {
		endPos = importEnd + 2;
	} else if (afterImport.startsWith(',')) {
		endPos = importEnd + 1;
	}

	// Check for leading comma/space (if not the first import)
	let startPos = importStart;
	const beforeImport = code.slice(Math.max(0, importStart - 2), importStart);
	if (beforeImport.endsWith(', ')) {
		startPos = importStart - 2;
		endPos = importEnd; // Don't remove trailing comma if we're removing leading
	}

	s.remove(startPos, endPos);
}
