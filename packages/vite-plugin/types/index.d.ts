import type { Plugin } from "vite";

declare module "roqa-vite-plugin" {
	export function roqa(): Plugin;
}
