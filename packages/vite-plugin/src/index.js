/** @import {Plugin} from 'vite' */

import { compile } from "roqa/compiler";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";

/**
 * @typedef {Object} RoqaFrontend
 * @property {(id: string) => boolean} handles - Whether this frontend handles the given file
 * @property {(code: string, id: string) => import("roqa/ir").ComponentIR | import("roqa/ir").ComponentIR[]} toIR - Convert source code to Roqa IR
 */

/**
 * @typedef {Object} RoqaPluginOptions
 * @property {RoqaFrontend} [frontend] - Frontend that converts source files to Roqa IR
 */

/**
 * Vite plugin for the Roqa UI framework.
 *
 * Accepts an optional `frontend` that converts source files to Roqa IR.
 * The IR is then compiled to optimized JavaScript by the Roqa backend.
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

		resolveId(source, importer) {
			if (source.endsWith(".roqa") && importer) {
				return resolve(dirname(importer), source);
			}
			return null;
		},

		async load(id) {
			// Handle .roqa files directly (no frontend needed)
			if (id.endsWith(".roqa")) {
				try {
					const code = readFileSync(id, "utf-8");
					const mir = JSON.parse(code);
					const result = compile(mir);
					return { code: result.code, map: result.map };
				} catch (error) {
					this.error(formatCompileError(error, id));
				}
			}
			return null;
		},

		async transform(code, id) {
			// Handle .roqa files in dev server (transform runs after load)
			if (id.endsWith(".roqa")) {
				try {
					const mir = JSON.parse(code);
					return compile(mir);
				} catch {
					// Already handled by load hook in build mode
					return null;
				}
			}

			if (frontend) {
				if (!frontend.handles(id)) return null;

				try {
					const ir = frontend.toIR(code, id);
					return compile(ir);
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
