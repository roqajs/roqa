import _traverse from '@babel/traverse';
import { isGetCall, extractGetCellArg } from '../parser.js';

// Handle CJS/ESM interop
const traverse = _traverse.default || _traverse;

/**
 * Auto-detect get() calls in JSX expressions and generate bind() wrappers
 *
 * Input JSX:
 *   <tr class={get(row.is_selected) ? "danger" : ""}>{get(row.label)}</tr>
 *
 * Output:
 *   bind(row.is_selected, (v) => { tr_1.className = v ? "danger" : ""; });
 *   bind(row.label, (v) => { a_1_text.nodeValue = v; });
 */

/**
 * @typedef {Object} BindingInfo
 * @property {import("@babel/types").Node} cellArg - The cell argument (e.g., row.label)
 * @property {import("@babel/types").Node} fullExpression - The complete expression containing get()
 * @property {string} targetVar - Variable name of the DOM element/text node
 * @property {string} targetProperty - Property to update (nodeValue, className, etc.)
 * @property {"text"|"attribute"} bindingType - Type of binding
 * @property {string} attrName - Original attribute name (for attribute bindings)
 */

/**
 * Analyze an expression for get() calls
 * @param {import("@babel/types").Node} expression - The expression to analyze
 * @returns {GetCallInfo[]} - All get() calls found in the expression
 *
 * @typedef {Object} GetCallInfo
 * @property {import("@babel/types").Node} cellArg - The cell reference (e.g., row.label)
 * @property {import("@babel/types").CallExpression} callNode - The get() call node
 * @property {boolean} isOnlyExpression - Whether this get() is the entire expression
 */
export function findGetCalls(expression) {
	const getCalls = [];

	// Simple case: expression IS a get() call
	if (isGetCall(expression)) {
		getCalls.push({
			cellArg: extractGetCellArg(expression),
			callNode: expression,
			isOnlyExpression: true,
		});
		return getCalls;
	}

	// Complex case: get() is somewhere inside the expression
	// Use Babel traverse to find all get() calls
	const visitedNodes = new Set();

	// Create a mini AST wrapper for traverse
	const wrapper = {
		type: 'Program',
		body: [
			{
				type: 'ExpressionStatement',
				expression: expression,
			},
		],
	};

	traverse(wrapper, {
		CallExpression(path) {
			const node = path.node;
			if (visitedNodes.has(node)) return;
			visitedNodes.add(node);

			if (isGetCall(node)) {
				getCalls.push({
					cellArg: extractGetCellArg(node),
					callNode: node,
					isOnlyExpression: false,
				});
			}
		},
		noScope: true,
	});

	return getCalls;
}

/**
 * Process bindings from template extraction and generate bind() info
 * @param {Array} bindings - Bindings from jsx-to-template
 * @param {string} code - Original source code
 * @returns {ProcessedBinding[]}
 *
 * @typedef {Object} ProcessedBinding
 * @property {string} targetVar - Variable name of the target element
 * @property {string} targetProperty - Property to update
 * @property {import("@babel/types").Node} cellArg - Cell to bind to
 * @property {import("@babel/types").Node} fullExpression - Full expression for the update callback
 * @property {boolean} needsTransform - Whether to transform get(cell) to v in callback
 * @property {Array} contentParts - Array of content parts (static/dynamic) for concatenated text
 */
export function processBindings(bindings, code) {
	const processed = [];

	for (const binding of bindings) {
		const { type, varName } = binding;

		// Handle prop bindings (for custom elements)
		if (type === 'prop') {
			const { propName, expression, isStatic } = binding;

			// Check if expression is a string literal (static prop)
			if (isStatic || expression.type === 'StringLiteral') {
				processed.push({
					type: 'prop',
					targetVar: varName,
					propName,
					expression: expression,
					isStatic: true,
				});
				continue;
			}

			// Find get() calls in the expression
			const getCalls = findGetCalls(expression);

			if (getCalls.length === 0) {
				// No get() calls - static expression
				processed.push({
					type: 'prop',
					targetVar: varName,
					propName,
					fullExpression: expression,
					isStatic: true,
				});
				continue;
			}

			// Reactive prop
			for (const getCall of getCalls) {
				processed.push({
					type: 'prop',
					targetVar: varName,
					propName,
					cellArg: getCall.cellArg,
					fullExpression: expression,
					needsTransform: !getCall.isOnlyExpression,
					isStatic: false,
					getCallNode: getCall.callNode,
				});
			}
			continue;
		}

		// Handle new contentParts format for text bindings
		if (type === 'text' && binding.contentParts) {
			const { textVarName, contentParts } = binding;

			// Collect all get() calls from all dynamic parts
			const allGetCalls = [];
			for (const part of contentParts) {
				if (part.type === 'dynamic') {
					const getCalls = findGetCalls(part.expression);
					for (const getCall of getCalls) {
						allGetCalls.push({
							...getCall,
							partExpression: part.expression,
						});
					}
				}
			}

			if (allGetCalls.length === 0) {
				// All static - shouldn't happen but handle it
				processed.push({
					targetVar: textVarName,
					targetProperty: 'nodeValue',
					cellArg: null,
					fullExpression: null,
					contentParts,
					needsTransform: false,
					isStatic: true,
				});
				continue;
			}

			// Create a binding for each unique cell
			// Track cells we've already created bindings for (by cell code, not position)
			const seenCells = new Set();

			for (const getCall of allGetCalls) {
				// Create a unique key for this cell based on its code representation
				// Use the actual cell code (e.g., "a", "row.label") not position,
				// since the same cell may appear multiple times at different positions
				const cellCode = code.slice(getCall.cellArg.start, getCall.cellArg.end);

				if (seenCells.has(cellCode)) continue;
				seenCells.add(cellCode);

				processed.push({
					targetVar: textVarName,
					targetProperty: 'nodeValue',
					cellArg: getCall.cellArg,
					fullExpression: null, // Not used with contentParts
					contentParts,
					needsTransform: true,
					isStatic: false,
					getCallNode: getCall.callNode,
				});
			}
			continue;
		}

		// Handle legacy single expression format and attribute bindings
		const { expression, staticPrefix, usesMarker } = binding;

		// Find all get() calls in this expression
		const getCalls = findGetCalls(expression);

		if (getCalls.length === 0) {
			// No get() calls - this is a static expression, no binding needed
			// But we still need to set the initial value
			processed.push({
				targetVar: type === 'text' ? binding.textVarName : varName,
				targetProperty: type === 'text' ? 'nodeValue' : binding.attrName,
				cellArg: null,
				fullExpression: expression,
				needsTransform: false,
				isStatic: true,
				staticPrefix: staticPrefix || '',
				usesMarker: usesMarker || false,
				// Pass through SVG flag for proper attribute setting
				isSvg: binding.isSvg || false,
			});
			continue;
		}

		// For each get() call, create a binding
		// Note: Multiple get() calls in one expression will create multiple bindings
		// This might cause redundant updates, but ensures correctness
		for (const getCall of getCalls) {
			const targetProperty =
				type === 'text'
					? 'nodeValue'
					: binding.attrName === 'class' || binding.attrName === 'className'
					? 'className'
					: binding.attrName;

			processed.push({
				targetVar: type === 'text' ? binding.textVarName : varName,
				targetProperty,
				cellArg: getCall.cellArg,
				fullExpression: expression,
				needsTransform: !getCall.isOnlyExpression,
				isStatic: false,
				// Store the get() call node for replacement in codegen
				getCallNode: getCall.callNode,
				// Include static prefix for text bindings
				staticPrefix: staticPrefix || '',
				// Pass through marker flag
				usesMarker: usesMarker || false,
				// Pass through SVG flag for proper attribute setting
				isSvg: binding.isSvg || false,
			});
		}
	}

	return processed;
}
