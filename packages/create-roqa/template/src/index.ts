import type { RoqaFrontend } from "../types/index.d.ts";

export default function my_frontend(): RoqaFrontend {
	return {
		handles(id) {
			return id.endsWith(".example");
		},

		toIR(_code, id) {
			return `TODO: Implement ${id} frontend to Roqa IR transformation.`;
		},
	};
}
