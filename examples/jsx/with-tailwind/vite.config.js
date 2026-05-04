import roqa from "@roqajs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [roqa(), tailwindcss()],
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
