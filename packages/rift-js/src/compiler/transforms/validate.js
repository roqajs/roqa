import _traverse from "@babel/traverse";
import { getJSXElementName, isPascalCase, isControlFlowComponent } from "../parser.js";

// Handle CJS/ESM interop
const traverse = _traverse.default || _traverse;

/**
 * Validate that no unsupported PascalCase components remain in the AST
 * This runs AFTER control flow transformers (For, Show, Switch) have processed their nodes
 *
 * Throws helpful error messages with suggestions for alternatives
 */

/**
 * Validate the AST for unsupported components
 * @param {import("@babel/types").File} ast - The Babel AST
 * @throws {Error} If unsupported PascalCase components are found
 */
export function validateNoCustomComponents(ast) {
	const errors = [];

	traverse(ast, {
		JSXElement(path) {
			const node = path.node;
			const name = getJSXElementName(node);

			if (!name) return;

			// Skip control flow components (they should be transformed, but check anyway)
			if (isControlFlowComponent(node)) {
				return;
			}

			// Check for PascalCase (custom component)
			if (isPascalCase(name)) {
				errors.push(createComponentError(name, node));
			}
		},
		noScope: true,
	});

	if (errors.length > 0) {
		// Throw the first error (could aggregate, but one at a time is clearer)
		throw errors[0];
	}
}

/**
 * Create a detailed error for an unsupported component
 * @param {string} name - Component name
 * @param {import("@babel/types").JSXElement} node - The JSX node
 * @returns {Error}
 */
function createComponentError(name, node) {
	const kebabName = toKebabCase(name);

	const error = new Error(
		`Unsupported component '${name}'.\n` + `PascalCase components are not supported in Rift.\n`,
	);

	error.code = "UNSUPPORTED_COMPONENT";
	error.componentName = name;
	error.loc = node.loc;
	error.suggestions = [
		`Use web components: defineComponent("${kebabName}", ${name})`,
		`Use control flow: <For each={items}>`,
		`Use lowercase HTML elements: <div>, <span>, <button>`,
	];

	return error;
}

/**
 * Convert PascalCase to kebab-case
 * @param {string} str
 * @returns {string}
 */
function toKebabCase(str) {
	return str
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}
