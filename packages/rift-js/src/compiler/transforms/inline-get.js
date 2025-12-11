import MagicString from 'magic-string';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

// Handle CJS/ESM interop
const traverse = _traverse.default || _traverse;

/**
 * Inline get(), cell(), put(), and set() calls to direct property/object access
 *
 * Transforms:
 *   get(cell) -> cell.v
 *   cell(value) -> { v: value, e: [] }
 *   put(cell, value) -> cell.v = value
 *   set(cell, value) -> (cell.v = value, for loop to notify effects)
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
					setCalls.push({
						start: path.node.start,
						end: path.node.end,
						cellStart: cellArg.start,
						cellEnd: cellArg.end,
						valueStart: valueArg?.start,
						valueEnd: valueArg?.end,
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
			// Replace set(cell, value) with inline assignment + effect loop
			// { cell.v = value; for (let i = 0; i < cell.e.length; i++) cell.e[i](cell.v); }
			const c = s.slice(call.cellStart, call.cellEnd);
			const v = call.valueStart != null ? s.slice(call.valueStart, call.valueEnd) : 'undefined';
			s.overwrite(
				call.start,
				call.end,
				`{ ${c}.v = ${v}; for (let i = 0; i < ${c}.e.length; i++) ${c}.e[i](${c}.v); }`
			);
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
