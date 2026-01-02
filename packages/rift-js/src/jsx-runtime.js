/**
 * Rift JSX Runtime
 *
 * This module provides JSX runtime functions for TypeScript/tooling compatibility.
 *
 * IMPORTANT: Rift compiles JSX at build time into optimized template cloning and
 * DOM manipulation code. This runtime is NOT used in production - JSX is transformed
 * by the Rift compiler before it ever reaches the browser.
 *
 * This file exists for:
 * 1. TypeScript type checking with jsxImportSource
 * 2. IDE intellisense and autocompletion
 * 3. Development-time error messages if uncompiled JSX somehow runs
 *
 * @see packages/rift-js/src/compiler for the actual JSX transformation
 */

/**
 * Create a JSX element
 * @param {string | Function} type - Element type (tag name or component function)
 * @param {object} props - Element properties including children
 * @param {string} [key] - Element key (unused in Rift)
 * @returns {void}
 */
export function jsx(type, _props, _key) {
	throw new Error(
		`[Rift] Uncompiled JSX detected: <${
			typeof type === "function" ? type.name || "Component" : type
		}>. ` +
			`Rift requires JSX to be compiled at build time. ` +
			`Make sure you're using the Rift Vite plugin or compiler.`,
	);
}

/**
 * Create a JSX element with static children
 * @param {string | Function} type - Element type (tag name or component function)
 * @param {object} props - Element properties including children
 * @param {string} [key] - Element key (unused in Rift)
 * @returns {void}
 */
export function jsxs(type, props, key) {
	return jsx(type, props, key);
}

/**
 * JSX Fragment - groups multiple elements without a wrapper
 * @param {{ children?: any }} props - Fragment props
 * @returns {void}
 */
export function Fragment(_props) {
	throw new Error(
		`[Rift] Uncompiled JSX Fragment detected. ` +
			`Rift requires JSX to be compiled at build time. ` +
			`Make sure you're using the Rift Vite plugin or compiler.`,
	);
}

/**
 * For component - renders a list of items reactively
 * Used as: <For each={items}>{(item) => <div>{item}</div>}</For>
 *
 * This is compiled into forBlock() calls by the Rift compiler.
 * @param {{ each: any, children: Function }} props
 * @returns {void}
 */
export function For(_props) {
	throw new Error(
		`[Rift] Uncompiled <For> component detected. ` +
			`Rift requires JSX to be compiled at build time. ` +
			`Make sure you're using the Rift Vite plugin or compiler.`,
	);
}
