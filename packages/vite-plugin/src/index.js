/** @import {Plugin} from 'vite' */

import { compile } from "rift-js/compiler";

/**
 * @returns {Plugin}
 */
export default function rift() {
	return {
		name: "rift-jsx-compiler",
		enforce: "pre",

		config() {
			return {
				esbuild: {
					jsx: "preserve",
				},
				optimizeDeps: {
					entries: ["!**/*.jsx", "!**/*.tsx"],
				},
			};
		},

		transform(code, id) {
			if (!id.endsWith(".jsx") && !id.endsWith(".tsx")) return null;
			try {
				const result = compile(code, id);
				return {
					code: result.code,
					map: result.map,
				};
			} catch (error) {
				const message = formatCompileError(error);
				this.error(message, error.loc?.start?.line);
			}
		},
	};
}

function formatCompileError(error) {
	let message = `Rift JSX compilation failed: ${error.message}`;

	// Add suggestions for common errors
	if (error.code === "UNSUPPORTED_COMPONENT") {
		const name = error.componentName;
		message += `\n\nSuggestions:`;
		message += `\n  - Use web components: defineComponent("${toKebabCase(name)}", ${name})`;
		message += `\n  - Use control flow: <For each={items}>`;
		message += `\n  - Use lowercase HTML: <div>, <span>, <button>`;
	}

	if (error.loc && error.loc.start) {
		message += `\n\nLocation: line ${error.loc.start.line}, column ${error.loc.start.column}`;
	} else if (error.loc && typeof error.loc.line === "number") {
		// Handle Babel-style loc format
		message += `\n\nLocation: line ${error.loc.line}, column ${error.loc.column}`;
	}

	return message;
}

function toKebabCase(str) {
	return str
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}
