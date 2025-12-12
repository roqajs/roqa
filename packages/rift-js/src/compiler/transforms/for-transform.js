import { extractJSXAttributes, getJSXChildren, isJSXExpressionContainer } from '../parser.js';

/**
 * Transform <For> components into for_block() calls
 *
 * Input:
 *   <For each={items}>{(row) => <tr>...</tr>}</For>
 *
 * Output:
 *   for_block(container, items, (anchor, item, index) => {
 *     // template creation and bindings
 *     return { start, end };
 *   });
 */

/**
 * @typedef {Object} ForTransformResult
 * @property {string} containerVar - Variable name of the container element
 * @property {import("@babel/types").Node} itemsExpression - The `each` prop expression
 * @property {string} itemParam - The callback's item parameter name
 * @property {string|null} indexParam - The callback's index parameter name (if present)
 * @property {import("@babel/types").JSXElement} bodyJSX - The JSX returned by the callback
 * @property {import("@babel/types").Node} originalCallback - The original callback for preserving other code
 */

/**
 * Extract information from a <For> component for transformation
 * @param {import("@babel/types").JSXElement} node - The <For> JSX element
 * @param {string} containerVar - Variable name of the parent container
 * @returns {ForTransformResult}
 */
export function extractForInfo(node, containerVar) {
	const attrs = extractJSXAttributes(node.openingElement);

	// Get the `each` prop
	const eachValue = attrs.get('each');
	if (!eachValue || !isJSXExpressionContainer(eachValue)) {
		throw createForError(node, "Missing required 'each' prop on <For> component");
	}
	const itemsExpression = eachValue.expression;

	// Get the children - should be a single expression container with arrow function
	const children = getJSXChildren(node);
	if (children.length !== 1) {
		throw createForError(node, '<For> must have exactly one child (render callback)');
	}

	const child = children[0];
	if (!isJSXExpressionContainer(child)) {
		throw createForError(node, '<For> child must be an expression: {(item) => <element>}');
	}

	const callback = child.expression;
	if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression') {
		throw createForError(node, '<For> child must be an arrow function or function expression');
	}

	// Extract callback parameters
	const params = callback.params;
	if (params.length < 1) {
		throw createForError(node, '<For> callback must have at least one parameter (item)');
	}

	const itemParam = extractParamName(params[0]);
	const indexParam = params.length > 1 ? extractParamName(params[1]) : null;

	// Extract the JSX from the callback body
	const bodyJSX = extractCallbackJSX(callback);
	if (!bodyJSX) {
		throw createForError(node, '<For> callback must return JSX');
	}

	return {
		containerVar,
		itemsExpression,
		itemParam,
		indexParam,
		bodyJSX,
		originalCallback: callback,
	};
}

/**
 * Extract parameter name from various parameter types
 * @param {import("@babel/types").Node} param
 * @returns {string}
 */
function extractParamName(param) {
	if (param.type === 'Identifier') {
		return param.name;
	}
	if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
		return param.left.name;
	}
	throw new Error('Unsupported parameter type in <For> callback');
}

/**
 * Extract JSX from callback body
 * @param {import("@babel/types").ArrowFunctionExpression|import("@babel/types").FunctionExpression} callback
 * @returns {import("@babel/types").JSXElement|null}
 */
function extractCallbackJSX(callback) {
	const body = callback.body;

	// Arrow function with expression body: (item) => <tr>...</tr>
	if (body.type === 'JSXElement') {
		return body;
	}

	// Block body: (item) => { return <tr>...</tr>; }
	if (body.type === 'BlockStatement') {
		// Look for return statement with JSX
		for (const stmt of body.body) {
			if (stmt.type === 'ReturnStatement' && stmt.argument) {
				if (stmt.argument.type === 'JSXElement') {
					return stmt.argument;
				}
				// Handle parenthesized JSX: return (<tr>...</tr>)
				if (stmt.argument.type === 'ParenthesizedExpression') {
					if (stmt.argument.expression.type === 'JSXElement') {
						return stmt.argument.expression;
					}
				}
			}
		}
	}

	return null;
}

/**
 * Get any statements before the return in a callback body
 * These need to be preserved in the generated for_block callback
 * @param {import("@babel/types").ArrowFunctionExpression|import("@babel/types").FunctionExpression} callback
 * @returns {import("@babel/types").Statement[]}
 */
export function getCallbackPreamble(callback) {
	const body = callback.body;

	if (body.type !== 'BlockStatement') {
		return [];
	}

	const preamble = [];
	for (const stmt of body.body) {
		if (stmt.type === 'ReturnStatement') {
			break;
		}
		preamble.push(stmt);
	}

	return preamble;
}

/**
 * Create a formatted error for <For> component issues
 */
function createForError(node, message) {
	const error = new Error(message);
	error.code = 'FOR_COMPONENT_ERROR';
	error.loc = node.loc;
	return error;
}
