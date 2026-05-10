/** @typedef {import("../../types/compiler.d.ts").ComponentIR} ComponentIR */
/** @typedef {import("../../types/compiler.d.ts").CompileResult} CompileResult */
/** @typedef {import("../../types/compiler.d.ts").Diagnostic} Diagnostic */

import { validate } from "./validate.js";
import { lower } from "./lower.js";
import { optimize } from "./optimize.js";
import { emit } from "./emit.js";

export { compileExpr } from "./expr-compiler.js";

/**
 * Compile MIR to JavaScript.
 * @param {ComponentIR | ComponentIR[]} mir
 * @returns {CompileResult}
 */
export function compile(mir) {
	const components = Array.isArray(mir) ? mir : [mir];

	// Phase 1: Validate
	const diagnostics = components.flatMap((c) => validate(c));
	const errors = diagnostics.filter((d) => d.severity === "error");
	if (errors.length > 0) {
		const msg = errors.map((e) => `[${e.code}] ${e.message} (${e.component})`).join("\n");
		throw new Error(`Compilation failed:\n${msg}`);
	}

	// Surface warnings on stderr so frontends fail loudly rather than
	// shipping silently-broken output. (Errors above already throw.)
	const warnings = diagnostics.filter((d) => d.severity === "warning");
	if (warnings.length > 0 && typeof console !== "undefined" && console.warn) {
		for (const w of warnings) {
			console.warn(`[roqa][${w.code}] ${w.message} (${w.component})`);
		}
	}

	// Phase 2: Lower (MIR → LIR)
	const lirs = components.map((c) => lower(c));

	// Phase 3: Optimize
	const optimized = lirs.map((l, i) => optimize(l, components[i]));

	// Phase 4: Emit
	return emit(optimized);
}
