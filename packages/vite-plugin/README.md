# Roqa Vite Plugin

Vite plugin that powers the [Roqa](https://roqa.dev).

## Usage

Add the following to a `vite.config.js` file, where `jsx` can be replaced with any Roqa-based authoring format that ships a Vite plugin.

```js
import { defineConfig } from "vite";
import roqa from "@roqajs/vite-plugin";
import jsx from "@roqajs/jsx";

export default defineConfig({
	plugins: [roqa({ frontend: jsx() })]
});
```