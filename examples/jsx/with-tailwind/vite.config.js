import roqa from "@roqajs/vite-plugin";
import jsx from "@roqajs/jsx";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [roqa({ frontend: jsx() }), tailwindcss()],
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
