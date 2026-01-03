# Rift Vite Plugin

Vite plugin that powers the Rift web UI framework.

## Usage

Add the following to a `vite.config.js` file:

```js
import { defineConfig } from "vite";
import rift from "rift-vite-plugin";

export default defineConfig({
	plugins: [rift()]
});
```