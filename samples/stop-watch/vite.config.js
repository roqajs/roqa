import rift from "rift-vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [rift()],
	build: {
		minify: false,
		modulePreload: false,
		rollupOptions: {
			output: {
				entryFileNames: "main.js",
			},
		},
	},
});
