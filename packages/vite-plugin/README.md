# Roqa Vite Plugin

Vite plugin that powers the [Roqa UI framework](https://roqa.dev).

## Usage

Add the following to a `vite.config.js` file:

```js
import { defineConfig } from "vite";
import roqa from "roqa-vite-plugin";

export default defineConfig({
	plugins: [roqa()]
});
```