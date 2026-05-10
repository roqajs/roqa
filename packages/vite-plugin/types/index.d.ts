import type { Plugin } from "vite";

/**
 * A frontend that converts source files to Roqa IR.
 */
export interface RoqaFrontend {
	/** Whether this frontend handles the given file ID */
	handles(id: string): boolean;
	/** Convert source code to Roqa IR */
	toIR(code: string, id: string): any;
}

/**
 * Options for the Roqa Vite plugin.
 */
export interface RoqaPluginOptions {
	/** Frontend that converts source files to Roqa IR */
	frontend?: RoqaFrontend;
}

/**
 * Vite plugin for the Roqa UI framework.
 *
 * Accepts an optional `frontend` that converts source files to Roqa IR.
 * The IR is then compiled to optimized JavaScript by the Roqa backend.
 * Also handles `.roqa` files directly (no frontend needed).
 *
 * @example
 * ```js
 * import { defineConfig } from "vite";
 * import roqa from "@roqajs/vite-plugin";
 *
 * // With a frontend:
 * export default defineConfig({
 *   plugins: [roqa({ frontend: myJsxFrontend() })]
 * });
 *
 * // Without a frontend (handles .roqa files):
 * export default defineConfig({
 *   plugins: [roqa()]
 * });
 * ```
 */
export default function roqa(options?: RoqaPluginOptions): Plugin;
