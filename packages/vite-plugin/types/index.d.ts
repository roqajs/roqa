import type { Plugin } from "vite";

/**
 * Vite plugin for the Roqa UI framework.
 * Compiles Roqa JSX into optimized vanilla JavaScript.
 *
 * @example
 * ```js
 * import { defineConfig } from "vite";
 * import roqa from "@roqajs/vite-plugin";
 *
 * export default defineConfig({
 *   plugins: [roqa()]
 * });
 * ```
 */
export default function roqa(): Plugin;
