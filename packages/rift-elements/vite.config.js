import { resolve } from "path";
import rift from "rift-vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [rift()],
	build: {
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				"switch/index": resolve(__dirname, "src/switch/index.ts"),
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: ["rift-js"],
			output: {
				preserveModules: true,
				preserveModulesRoot: "src",
				entryFileNames: "[name].js",
			},
		},
		minify: false,
		sourcemap: true,
	},
});
