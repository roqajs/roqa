import { parse } from "./parse.js";
import { extractComponents } from "./extract.js";

/**
 * Create a JSX frontend for the Roqa Vite plugin.
 *
 * @returns {{ handles: (id: string) => boolean, toMIR: (code: string, id: string) => import("roqa/ir").ComponentIR | import("roqa/ir").ComponentIR[] }}
 */
export default function jsx() {
	return {
		handles(id) {
			return /\.[jt]sx$/.test(id);
		},

		toMIR(code, id) {
			const ast = parse(code, id);
			const components = extractComponents(ast, id, code);
			return components.length === 1 ? components[0] : components;
		},
	};
}
