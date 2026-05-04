/** @import {Plugin} from 'vite' */

import { compile } from "roqa/compiler";

/**
 * @typedef {Object} RoqaFrontend
 * @property {(id: string) => boolean} handles - Whether this frontend handles the given file
 * @property {(code: string, id: string) => import("roqa/compiler").ComponentIR | import("roqa/compiler").ComponentIR[]} toMIR - Convert source code to MIR
 */

/**
 * @typedef {Object} RoqaPluginOptions
 * @property {RoqaFrontend} [frontend] - Frontend that converts source files to MIR
 */

/**
 * Vite plugin for the Roqa UI framework.
 *
 * Accepts an optional `frontend` that converts source files to MIR.
 * The MIR is then compiled to optimized JavaScript by the Roqa backend.
 *
 * @param {RoqaPluginOptions} [options]
 * @returns {Plugin}
 */
export default function roqa(options) {
	const frontend = options?.frontend;

	return {
		name: "roqa",
		enforce: "pre",

		config() {
			return {
				esbuild: {
					jsx: "preserve",
				},
			};
		},

		async transform(code, id) {
			// If a frontend is provided, let it decide what to handle
			if (frontend) {
				if (!frontend.handles(id)) return null;

				try {
					const mir = frontend.toMIR(code, id);
					return compile(mir);
				} catch (error) {
					this.error(formatCompileError(error, id));
				}
			}

			// No frontend — check for .mir.json files (direct MIR input)
			if (id.endsWith(".mir.json")) {
				try {
					const mir = JSON.parse(code);
					return compile(mir);
				} catch (error) {
					this.error(formatCompileError(error, id));
				}
			}

			return null;
		},
	};
}

/**
 * @param {any} error
 * @param {string} id
 * @returns {string}
 */
function formatCompileError(error, id) {
	let message = `Roqa compilation failed: ${error.message}`;
	if (id) {
		message += `\n\nFile: ${id}`;
	}
	return message;
}
