import roqa from "@roqajs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [roqa()],
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
