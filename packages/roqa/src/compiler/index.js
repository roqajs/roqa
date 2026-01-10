import { generateOutput } from "./codegen.js";
import { parse } from "./parser.js";
import { inlineGetCalls } from "./transforms/inline-get.js";
import { validateNoCustomComponents } from "./transforms/validate.js";

/**
 * Main entry point for the Roqa JSX compiler
 *
 * Compilation pipeline:
 * 1. Parse JSX source code into AST
 * 2. Validate (no unsupported PascalCase components)
 * 3. Generate output code with template extraction, event transforms, and bindings
 * 4. Inline get() calls to direct property access (get(x) -> x.v)
 *
 * @param {string} code - Source code to compile
 * @param {string} filename - Source filename for error messages and source maps
 * @returns {{ code: string, map: object }} - Compiled code and source map
 */
export function compile(code, filename) {
	// Step 1: Parse
	const ast = parse(code, filename);

	// Step 2: Validate (after parsing, before transforms)
	// This checks for unsupported PascalCase components
	// Note: <For> is handled specially in codegen, so it won't trigger validation error
	validateNoCustomComponents(ast);

	// Step 3: Generate output
	// This handles:
	// - Template extraction and deduplication
	// - <For> component transformation
	// - Event handler transformation
	// - Reactive binding detection (get() -> bind())
	const result = generateOutput(code, ast, filename);

	// Step 4: Inline get() calls to direct property access
	// This optimizes get(cell) to cell.v, avoiding function call overhead
	const inlined = inlineGetCalls(result.code, filename);

	return inlined;
}

// Re-export for direct usage if needed
export { parse } from "./parser.js";
export { validateNoCustomComponents } from "./transforms/validate.js";
export { generateOutput } from "./codegen.js";
export { inlineGetCalls } from "./transforms/inline-get.js";
