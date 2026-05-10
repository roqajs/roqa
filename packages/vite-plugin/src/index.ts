import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { compile } from "roqa/compiler";
import type { ComponentIR } from "roqa/ir";
import type { Plugin } from "vite";

export interface RoqaFrontend {
	handles(id: string): boolean;
	toIR(code: string, id: string): ComponentIR | ComponentIR[];
}

export interface RoqaPluginOptions {
	frontend?: RoqaFrontend;
}

export default function roqa(options: RoqaPluginOptions = {}): Plugin {
	const { frontend } = options;

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
			if (!id.endsWith(".roqa")) {
				return null;
			}

			try {
				const code = readFileSync(id, "utf-8");
				const ir = JSON.parse(code) as ComponentIR | ComponentIR[];
				const result = compile(ir);
				return { code: result.code, map: result.map };
			} catch (error) {
				this.error(formatCompileError(error, id));
			}
		},

		async transform(code, id) {
			if (id.endsWith(".roqa")) {
				try {
					const ir = JSON.parse(code) as ComponentIR | ComponentIR[];
					return compile(ir);
				} catch {
					return null;
				}
			}

			if (!frontend || !frontend.handles(id)) {
				return null;
			}

			try {
				const ir = frontend.toIR(code, id);
				return compile(ir);
			} catch (error) {
				this.error(formatCompileError(error, id));
			}

			return null;
		},
	};
}

function formatCompileError(error: unknown, id: string): string {
	const detail = error instanceof Error ? error.message : String(error);
	let message = `Roqa compilation failed: ${detail}`;

	if (id) {
		message += `\n\nFile: ${id}`;
	}

	return message;
}