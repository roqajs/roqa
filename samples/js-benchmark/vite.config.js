import { defineConfig } from 'vite';
import rift from 'rift-vite-plugin';

export default defineConfig({
	plugins: [rift()],
	build: {
		// minify: false,
		modulePreload: false,
		rollupOptions: {
			output: {
				entryFileNames: 'main.js',
			},
		},
	},
});
