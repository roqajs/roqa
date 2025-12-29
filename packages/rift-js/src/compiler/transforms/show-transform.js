import { extractJSXAttributes, getJSXChildren, isJSXExpressionContainer } from "../parser.js";

/**
 * Transform <Show> components into show_block() calls
 *
 * Input:
 *   <Show when={condition}><div>...</div></Show>
 *
 * Output:
 *   show_block(container, condition, (anchor) => {
 *     // template creation and bindings
 *     return { start, end };
 *   });
 */

/**
 * @typedef {Object} ShowTransformResult
 * @property {string} containerVar - Variable name of the container element
 * @property {import("@babel/types").Node} conditionExpression - The `when` prop expression
 * @property {import("@babel/types").JSXElement} bodyJSX - The JSX child to render conditionally
 */

/**
 * Extract information from a <Show> component for transformation
 * @param {import("@babel/types").JSXElement} node - The <Show> JSX element
 * @param {string} containerVar - Variable name of the parent container
 * @returns {ShowTransformResult}
 */
export function extractShowInfo(node, containerVar) {
	const attrs = extractJSXAttributes(node.openingElement);

	// Get the `when` prop
	const whenValue = attrs.get("when");
	if (!whenValue || !isJSXExpressionContainer(whenValue)) {
		throw createShowError(node, "Missing required 'when' prop on <Show> component");
	}
	const conditionExpression = whenValue.expression;

	// Get the children - should have at least one child element
	const children = getJSXChildren(node);
	if (children.length === 0) {
		throw createShowError(node, "<Show> must have at least one child element");
	}

	// Get the first JSX element child
	let bodyJSX = null;
	for (const child of children) {
		if (child.type === "JSXElement") {
			bodyJSX = child;
			break;
		}
		// Support expression container with JSX: {<div>...</div>}
		if (isJSXExpressionContainer(child) && child.expression.type === "JSXElement") {
			bodyJSX = child.expression;
			break;
		}
	}

	if (!bodyJSX) {
		throw createShowError(node, "<Show> must have a JSX element as child");
	}

	return {
		containerVar,
		conditionExpression,
		bodyJSX,
	};
}

/**
 * Create a formatted error for <Show> component issues
 */
function createShowError(node, message) {
	const error = new Error(message);
	error.code = "SHOW_COMPONENT_ERROR";
	error.loc = node.loc;
	return error;
}
