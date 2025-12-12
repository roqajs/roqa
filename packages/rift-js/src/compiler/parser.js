import * as parser from '@babel/parser';

/**
 * Parse JSX source code into an AST
 * @param {string} code - Source code to parse
 * @param {string} filename - Source filename for error messages
 * @returns {import("@babel/types").File} - Babel AST
 */
export function parse(code, filename) {
	return parser.parse(code, {
		sourceType: 'module',
		plugins: ['jsx'],
		sourceFilename: filename,
	});
}

/**
 * Check if a JSX element is a control flow component (<For>)
 * @param {import("@babel/types").JSXElement} node
 * @returns {boolean}
 */
export function isControlFlowComponent(node) {
	const name = getJSXElementName(node);
	return name === 'For';
}

/**
 * Check if a JSX element is the <For> component
 * @param {import("@babel/types").JSXElement} node
 * @returns {boolean}
 */
export function isForComponent(node) {
	return getJSXElementName(node) === 'For';
}

/**
 * Check if a string is PascalCase (starts with uppercase)
 * @param {string} name
 * @returns {boolean}
 */
export function isPascalCase(name) {
	return /^[A-Z]/.test(name);
}

/**
 * Get the name of a JSX element
 * @param {import("@babel/types").JSXElement} node
 * @returns {string|null}
 */
export function getJSXElementName(node) {
	const openingElement = node.openingElement;
	if (!openingElement) return null;

	const nameNode = openingElement.name;

	// <div>, <For>, <my-component>
	if (nameNode.type === 'JSXIdentifier') {
		return nameNode.name;
	}

	// <Foo.Bar> - member expression
	if (nameNode.type === 'JSXMemberExpression') {
		return getMemberExpressionName(nameNode);
	}

	return null;
}

/**
 * Get the full name from a JSXMemberExpression (Foo.Bar.Baz)
 * @param {import("@babel/types").JSXMemberExpression} node
 * @returns {string}
 */
function getMemberExpressionName(node) {
	const parts = [];
	let current = node;

	while (current.type === 'JSXMemberExpression') {
		parts.unshift(current.property.name);
		current = current.object;
	}

	if (current.type === 'JSXIdentifier') {
		parts.unshift(current.name);
	}

	return parts.join('.');
}

/**
 * Extract attributes from a JSX opening element
 * @param {import("@babel/types").JSXOpeningElement} openingElement
 * @returns {Map<string, import("@babel/types").Node>}
 */
export function extractJSXAttributes(openingElement) {
	const attrs = new Map();

	for (const attr of openingElement.attributes) {
		if (attr.type === 'JSXAttribute') {
			const name = attr.name.name;
			// Value can be: StringLiteral, JSXExpressionContainer, or null (boolean true)
			attrs.set(name, attr.value);
		} else if (attr.type === 'JSXSpreadAttribute') {
			// Mark spread attributes specially
			attrs.set('...', attr.argument);
		}
	}

	return attrs;
}

/**
 * Check if a node is a JSX element
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
export function isJSXElement(node) {
	return node && node.type === 'JSXElement';
}

/**
 * Check if a node is a JSX fragment
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
export function isJSXFragment(node) {
	return node && node.type === 'JSXFragment';
}

/**
 * Check if a node is JSX text
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
export function isJSXText(node) {
	return node && node.type === 'JSXText';
}

/**
 * Check if a node is a JSX expression container
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
export function isJSXExpressionContainer(node) {
	return node && node.type === 'JSXExpressionContainer';
}

/**
 * Get children of a JSX element, filtering out empty text nodes
 * @param {import("@babel/types").JSXElement} node
 * @returns {import("@babel/types").Node[]}
 */
export function getJSXChildren(node) {
	return node.children.filter((child) => {
		// Filter out whitespace-only text nodes
		if (child.type === 'JSXText') {
			return child.value.trim().length > 0;
		}
		return true;
	});
}

/**
 * Check if a CallExpression is a get() call
 * @param {import("@babel/types").Node} node
 * @returns {boolean}
 */
export function isGetCall(node) {
	return (
		node &&
		node.type === 'CallExpression' &&
		node.callee.type === 'Identifier' &&
		node.callee.name === 'get'
	);
}

/**
 * Extract the cell argument from a get() call
 * @param {import("@babel/types").CallExpression} node
 * @returns {import("@babel/types").Node|null}
 */
export function extractGetCellArg(node) {
	if (!isGetCall(node)) return null;
	return node.arguments[0] || null;
}
