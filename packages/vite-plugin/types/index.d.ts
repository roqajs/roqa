import type { Plugin } from "vite";

declare module "@roqajs/vite-plugin" {
	export function roqa(): Plugin;
}
