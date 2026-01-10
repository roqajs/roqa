import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "unit",
					include: ["tests/compiler/**/*.test.js", "tests/integration/**/*.test.js"],
					environment: "node",
				},
			},
			{
				test: {
					name: "browser",
					include: ["tests/runtime/**/*.test.js"],
					browser: {
						enabled: true,
						provider: "playwright",
						headless: true,
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
