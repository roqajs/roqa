/** @import {File} from '@babel/types' */

import { parse as babelParse } from "@babel/parser";

/**
 * Parse JSX/TSX source code into a Babel AST.
 * TypeScript annotations are stripped during parsing.
 *
 * @param {string} code - Source code
 * @param {string} id - File path (used to detect .tsx vs .jsx)
 * @returns {File}
 */
export function parse(code, id) {
	const isTypeScript = /\.tsx?$/.test(id);
	return babelParse(code, {
		sourceType: "module",
		plugins: [
			"jsx",
			...(isTypeScript ? [/** @type {const} */ ("typescript")] : []),
		],
	});
}
