import type { Plugin } from "vite";

/**
 * A frontend that converts source files to Roqa MIR.
 */
export interface RoqaFrontend {
	/** Whether this frontend handles the given file ID */
	handles(id: string): boolean;
	/** Convert source code to MIR */
	toMIR(code: string, id: string): any;
}

/**
 * Options for the Roqa Vite plugin.
 */
export interface RoqaPluginOptions {
	/** Frontend that converts source files to MIR */
	frontend?: RoqaFrontend;
}

/**
 * Vite plugin for the Roqa UI framework.
 *
 * Accepts an optional `frontend` that converts source files to MIR.
 * The MIR is then compiled to optimized JavaScript by the Roqa backend.
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
 * // Without a frontend (handles .mir.json files):
 * export default defineConfig({
 *   plugins: [roqa()]
 * });
 * ```
 */
export default function roqa(options?: RoqaPluginOptions): Plugin;
