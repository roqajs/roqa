/** @typedef {import("./types.d.ts").ComponentLIR} ComponentLIR */
/** @typedef {import("./types.d.ts").CompileResult} CompileResult */

import { compileExpr } from "./expr-compiler.js";

/**
 * Emit LIR → JavaScript text.
 * @param {ComponentLIR[]} lirs
 * @returns {CompileResult}
 */
export function emit(lirs) {
	const lines = [];

	// Collect all imports across components
	const runtimeImports = new Set();
	/** @type {Map<string, Set<string>>} source → bindings */
	const userImportMap = new Map();
	/** @type {Set<string>} */
	const allDelegatedEvents = new Set();

	for (const lir of lirs) {
		for (const imp of lir.imports) {
			runtimeImports.add(imp);
		}
		for (const uimp of lir.userImports) {
			if (!userImportMap.has(uimp.source)) {
				userImportMap.set(uimp.source, new Set());
			}
			for (const b of uimp.bindings) {
				userImportMap.get(uimp.source).add(b);
			}
		}
		for (const evt of lir.delegatedEvents) {
			allDelegatedEvents.add(evt);
		}
	}

	// Remove delegate from runtime imports if no events
	if (allDelegatedEvents.size === 0) {
		runtimeImports.delete("delegate");
	}

	// 1. Emit runtime import
	const sortedImports = [...runtimeImports].sort();
	lines.push(`import { ${sortedImports.join(", ")} } from "roqa";`);

	// 2. Emit user imports
	for (const [source, bindings] of userImportMap) {
		const sortedBindings = [...bindings].sort();
		lines.push(`import { ${sortedBindings.join(", ")} } from "${source}";`);
	}

	// 3. Emit templates (all, globally renumbered)
	let templateCounter = 0;
	/** @type {Map<string, string>} old id → new id */
	const templateRenames = new Map();

	const allTemplates = [];
	for (const lir of lirs) {
		for (const tmpl of lir.templates) {
			templateCounter++;
			const newId = `$tmpl_${templateCounter}`;
			if (tmpl.id !== newId) {
				templateRenames.set(`${lir.tagName}:${tmpl.id}`, newId);
			}
			allTemplates.push({ ...tmpl, id: newId });
		}
	}

	if (allTemplates.length > 0) {
		lines.push("");
		for (const tmpl of allTemplates) {
			const fn = tmpl.svg ? "svgTemplate" : "template";
			// Use single quotes when HTML contains double quotes, else double quotes
			const quote = tmpl.html.includes('"') ? "'" : '"';
			const escaped = quote === "'"
				? escapeTemplateString(tmpl.html)
				: tmpl.html.replace(/\\/g, "\\\\");
			lines.push(`const ${tmpl.id} = ${fn}(${quote}${escaped}${quote});`);
		}
	}

	// 4. Emit component definitions
	for (const lir of lirs) {
		lines.push("");
		// Renumber template refs if needed
		const renamedLir = renumberTemplates(lir, templateRenames);
		emitComponent(renamedLir, lines);
	}

	// 4. Delegate call
	if (allDelegatedEvents.size > 0) {
		lines.push("");
		const sortedEvents = [...allDelegatedEvents].sort();
		lines.push(`delegate([${sortedEvents.map((e) => `"${e}"`).join(", ")}]);`);
	}

	const code = lines.join("\n") + "\n";
	return { code, map: null };
}

/**
 * @param {ComponentLIR} lir
 * @param {string[]} lines
 */
function emitComponent(lir, lines) {
	const hasProps = lir.props.length > 0;
	const propsParam = hasProps ? formatPropsParam(lir.props) : "";

	// Build defineComponent options
	const hasObservedAttrs = lir.observedAttributes.length > 0;

	lines.push(`defineComponent("${lir.tagName}", function ${lir.name}(${propsParam}) {`);

	// Lifecycle onConnect at the beginning (before cells)
	if (lir.lifecycle.onConnect) {
		// Will be emitted at the start of connected()
	}

	// Cell declarations
	for (const cell of lir.cells) {
		if (cell.inlined) {
			lines.push(`\tconst ${cell.varName} = { v: ${cell.initial}, e: [] };`);
		} else {
			lines.push(`\tconst ${cell.varName} = cell(${cell.initial});`);
		}
	}

	if (lir.cells.length > 0) lines.push("");

	// Block variable declarations (hoisted, before functions)
	for (const bv of lir.blockVars) {
		lines.push(`\tlet ${bv.name};`);
	}
	if (lir.blockVars.length > 0) lines.push("");

	// Function declarations
	for (const fn of lir.functions) {
		emitFunction(fn, lines);
		lines.push("");
	}

	// Connected block
	lines.push("\tthis.connected(() => {");

	// Lifecycle onConnect at beginning of connected()
	if (lir.lifecycle.onConnect) {
		const code = compileExpr(lir.lifecycle.onConnect);
		lines.push(`\t\t${code};`);
		lines.push("");
	}

	// Check for two-phase traversal (setProp)
	const hasPropSets = lir.connected.propSets.length > 0;

	if (hasPropSets) {
		// Phase 1: Clone template, traverse detached for setProp
		lines.push(`\t\tconst $root_1 = ${lir.templates[0].id}();`);
		lines.push("");

		// Emit prop traversals (from $root_1, before mount)
		const propTargetVars = new Set(lir.connected.propSets.map((p) => p.target));
		// Include the root var and prop target vars
		const phase1Vars = new Set();
		for (const t of lir.connected.traversals) {
			if (t.path.startsWith("$root_1") || propTargetVars.has(t.varName)) {
				phase1Vars.add(t.varName);
			}
			// Also include vars that are dependencies of prop target paths
			for (const pv of propTargetVars) {
				const pt = lir.connected.traversals.find((x) => x.varName === pv);
				if (pt && pt.path.includes(t.varName + ".")) {
					phase1Vars.add(t.varName);
				}
			}
		}

		const phase1Traversals = lir.connected.traversals.filter((t) => phase1Vars.has(t.varName));
		const phase2Traversals = lir.connected.traversals.filter((t) => !phase1Vars.has(t.varName));

		for (const t of phase1Traversals) {
			lines.push(`\t\tconst ${t.varName} = ${t.path};`);
		}
		lines.push("");

		// Emit setProp calls
		for (const ps of lir.connected.propSets) {
			lines.push(`\t\tsetProp(${ps.target}, "${ps.propName}", ${ps.value});`);
		}
		lines.push("");

		// appendChild
		lines.push(`\t\tthis.appendChild($root_1);`);

		// Phase 2: Remaining traversals (use live DOM anchors)
		if (phase2Traversals.length > 0) {
			lines.push("");
			for (const t of phase2Traversals) {
				lines.push(`\t\tconst ${t.varName} = ${t.path};`);
			}
		}
	} else if (lir.templates.length > 0) {
		// Normal: clone + mount + traverse
		lines.push(`\t\tconst $root_1 = ${lir.templates[0].id}();`);
		lines.push(`\t\tthis.appendChild($root_1);`);

		// Filter unused traversals
		const filteredTraversals = filterTraversals(lir);
		if (filteredTraversals.length > 0) {
			lines.push("");
			for (const t of filteredTraversals) {
				lines.push(`\t\tconst ${t.varName} = ${t.path};`);
			}
		}
	}

	// Events
	if (lir.connected.events.length > 0) {
		lines.push("");
		for (const evt of lir.connected.events) {
			lines.push(`\t\t${evt.target}.__${evt.event} = ${evt.handler};`);
		}
	}

	// Blocks
	if (lir.connected.blocks.length > 0) {
		lines.push("");
		for (const block of lir.connected.blocks) {
			emitBlock(block, lir, lines);
		}
	}

	// Bindings (initial values + ref storage)
	if (lir.connected.bindings.length > 0) {
		lines.push("");
		for (const binding of lir.connected.bindings) {
			if (binding.inlined) {
				if (binding.isSvgAttr) {
					lines.push(`\t\t${binding.target}.setAttribute("${binding.property}", ${binding.initialValue});`);
				} else {
					lines.push(`\t\t${binding.target}.${binding.property} = ${binding.initialValue};`);
				}
				if (binding.cellName && binding.refName) {
					lines.push(`\t\t${binding.refName} = ${binding.target};`);
				}
			}
		}
	}

	// Attr-read class bindings with attrChanged
	emitAttrChangedBindings(lir, lines);

	lines.push("\t});");
	lines.push("});");

	// DefineComponent options
	if (hasObservedAttrs) {
		// Rewrite the closing
		lines.pop(); // remove "});"
		lines.push("}, {");
		lines.push(`\tobservedAttributes: [${lir.observedAttributes.map((a) => `"${a}"`).join(", ")}]`);
		lines.push("});");
	}
}

/**
 * @param {import("./types.d.ts").FunctionOp} fn
 * @param {string[]} lines
 */
function emitFunction(fn, lines) {
	const params = fn.params.join(", ");

	if (fn.inlinedSets.length === 0 && fn.body) {
		lines.push(`\tconst ${fn.varName} = (${params}) => {`);
		for (const line of fn.body.split("\n")) {
			lines.push(`\t\t${line};`);
		}
		lines.push(`\t};`);
		return;
	}

	lines.push(`\tconst ${fn.varName} = (${params}) => {`);

	// Emit inlined sets first
	for (const set of fn.inlinedSets) {
		lines.push(`\t\t${set.cellName}.v = ${set.valueExpr};`);
		// Block updates first (forBlock.update, showBlock.update)
		for (const blockUpdate of set.blockUpdates) {
			lines.push(`\t\t${blockUpdate.blockVar}.${blockUpdate.method}();`);
		}
		// Then DOM binding updates
		for (const update of set.updates) {
			if (update.target.startsWith("__svg:")) {
				const parts = update.target.split(":");
				const refName = parts[1];
				const attrName = parts[2];
				lines.push(`\t\t${refName}.setAttribute("${attrName}", ${update.expression});`);
			} else {
				lines.push(`\t\t${update.target} = ${update.expression};`);
			}
		}
		if (set.notify) {
			lines.push(`\t\tfor (let i = 0; i < ${set.cellName}.e.length; i++) ${set.cellName}.e[i](${set.cellName}.v);`);
		}
	}

	// Emit body parts after inlined sets
	if (fn.body) {
		for (const line of fn.body.split("\n")) {
			if (line.trim()) {
				lines.push(`\t\t${line};`);
			}
		}
	}

	lines.push(`\t};`);
}

/**
 * @param {import("./types.d.ts").BlockOp} block
 * @param {ComponentLIR} lir
 * @param {string[]} lines
 */
function emitBlock(block, lir, lines) {
	if (block.blockType === "show") {
		emitShowBlock(block, lir, lines);
	} else if (block.blockType === "each") {
		emitEachBlock(block, lir, lines);
	}
}

/**
 * @param {import("./types.d.ts").BlockOp} block
 * @param {ComponentLIR} lir
 * @param {string[]} lines
 */
function emitShowBlock(block, lir, lines) {
	lines.push(`\t\t${block.controllerVar} = showBlock(${block.container}, ${block.source}, (anchor) => {`);

	const rb = block.renderBody;
	lines.push(`\t\t\tconst ${rb.rootElement} = ${rb.templateId}().firstChild;`);

	for (const t of rb.traversals) {
		lines.push(`\t\t\tconst ${t.varName} = ${t.path};`);
	}

	if (rb.events.length > 0) {
		lines.push("");
		for (const evt of rb.events) {
			lines.push(`\t\t\t${evt.target}.__${evt.event} = ${evt.handler};`);
		}
	}

	lines.push(`\t\t\tanchor.before(${rb.rootElement});`);
	lines.push(`\t\t\treturn { start: ${rb.rootElement}, end: ${rb.rootElement} };`);
	lines.push(`\t\t});`);

	if (block.fallbackBody && block.fallbackControllerVar) {
		lines.push("");
		lines.push(`\t\t${block.fallbackControllerVar} = showBlock(${block.container}, () => !${block.source}.v, (anchor) => {`);

		const fb = block.fallbackBody;
		lines.push(`\t\t\tconst ${fb.rootElement} = ${fb.templateId}().firstChild;`);

		for (const t of fb.traversals) {
			lines.push(`\t\t\tconst ${t.varName} = ${t.path};`);
		}

		if (fb.events.length > 0) {
			lines.push("");
			for (const evt of fb.events) {
				lines.push(`\t\t\t${evt.target}.__${evt.event} = ${evt.handler};`);
			}
		}

		lines.push("");
		lines.push(`\t\t\tanchor.before(${fb.rootElement});`);
		lines.push(`\t\t\treturn { start: ${fb.rootElement}, end: ${fb.rootElement} };`);
		lines.push(`\t\t}, [${block.source}]);`);
	}
}

/**
 * @param {import("./types.d.ts").BlockOp} block
 * @param {ComponentLIR} lir
 * @param {string[]} lines
 */
function emitEachBlock(block, lir, lines) {
	const alias = block.itemAlias || "item";
	lines.push(`\t\t${block.controllerVar} = forBlock(${block.container}, ${block.source}, (anchor, ${alias}, index) => {`);

	const rb = block.renderBody;
	lines.push(`\t\t\tconst ${rb.rootElement} = ${rb.templateId}().firstChild;`);

	// Traversals
	for (const t of rb.traversals) {
		lines.push(`\t\t\tconst ${t.varName} = ${t.path};`);
	}

	if (rb.events.length > 0 || rb.classBindings.length > 0 || rb.bindings.length > 0) {
		lines.push("");
	}

	// Events
	for (const evt of rb.events) {
		lines.push(`\t\t\t${evt.target}.__${evt.event} = ${evt.handler};`);
	}

	// Class bindings
	for (const cb of rb.classBindings) {
		lines.push(`\t\t\t${cb.target}.className = ${cb.expression};`);
	}

	// Bindings
	for (const b of rb.bindings) {
		lines.push(`\t\t\t${b.target}.${b.property} = ${b.expression};`);
	}

	// Mount
	lines.push("");
	lines.push(`\t\t\tanchor.before(${rb.rootElement});`);
	lines.push(`\t\t\treturn { start: ${rb.rootElement}, end: ${rb.rootElement} };`);
	lines.push(`\t\t});`);
}

/**
 * Emit attrChanged bindings for class bindings that use attr-read.
 * @param {ComponentLIR} lir
 * @param {string[]} lines
 */
function emitAttrChangedBindings(lir, lines) {
	// Find bindings that have attr-read in their expressions
	for (const binding of lir.connected.bindings) {
		if (binding.property === "className" && binding.expression.includes("this.getAttribute")) {
			lines.push(`\t\tthis.attrChanged(${extractAttrName(binding.expression)}, () => {`);
			lines.push(`\t\t\t${binding.target}.${binding.property} = ${binding.expression};`);
			lines.push(`\t\t});`);
		}
	}
}

/**
 * Extract attribute name from getAttribute expression.
 * @param {string} expr
 * @returns {string}
 */
function extractAttrName(expr) {
	const match = expr.match(/this\.getAttribute\("([^"]+)"\)/);
	if (match) return `"${match[1]}"`;
	return '""';
}

/**
 * @param {import("./types.d.ts").PropIR[]} props
 * @returns {string}
 */
function formatPropsParam(props) {
	const params = props.map((p) => {
		if (p.default !== undefined) {
			return `${p.name} = ${JSON.stringify(p.default)}`;
		}
		return p.name;
	});
	return `{ ${params.join(", ")} }`;
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeTemplateString(str) {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'");
}

/**
 * Renumber template IDs in a LIR for multi-component files.
 * @param {ComponentLIR} lir
 * @param {Map<string, string>} renames
 * @returns {ComponentLIR}
 */
function renumberTemplates(lir, renames) {
	if (renames.size === 0) return lir;

	// Build local rename map for this component
	/** @type {Map<string, string>} */
	const localRenames = new Map();
	for (const tmpl of lir.templates) {
		const key = `${lir.tagName}:${tmpl.id}`;
		const newId = renames.get(key);
		if (newId) {
			localRenames.set(tmpl.id, newId);
		}
	}

	if (localRenames.size === 0) return lir;

	// Rename template refs in the LIR
	const templates = lir.templates.map((t) => ({
		...t,
		id: localRenames.get(t.id) || t.id,
	}));

	const blocks = lir.connected.blocks.map((b) => ({
		...b,
		templateId: b.templateId ? (localRenames.get(b.templateId) || b.templateId) : b.templateId,
		renderBody: {
			...b.renderBody,
			templateId: localRenames.get(b.renderBody.templateId) || b.renderBody.templateId,
		},
		fallbackBody: b.fallbackBody ? {
			...b.fallbackBody,
			templateId: localRenames.get(b.fallbackBody.templateId) || b.fallbackBody.templateId,
		} : undefined,
	}));

	return {
		...lir,
		templates,
		connected: {
			...lir.connected,
			blocks,
		},
	};
}

/**
 * Filter traversals to only include vars that are actually used by
 * bindings, events, blocks, propSets, or are dependencies of used vars.
 * @param {ComponentLIR} lir
 * @returns {import("./types.d.ts").TraversalOp[]}
 */
function filterTraversals(lir) {
	// Collect directly used vars
	const usedVars = new Set();

	for (const b of lir.connected.bindings) {
		usedVars.add(b.target);
	}
	for (const e of lir.connected.events) {
		usedVars.add(e.target);
	}
	for (const block of lir.connected.blocks) {
		usedVars.add(block.container);
	}
	for (const ps of lir.connected.propSets) {
		usedVars.add(ps.target);
	}

	if (usedVars.size === 0) return [];

	// Build dependency graph: which vars reference which other vars in their path
	const traversalMap = new Map();
	for (const t of lir.connected.traversals) {
		traversalMap.set(t.varName, t);
	}

	// Iterative expansion: if a var is needed, its path dependencies are also needed
	let changed = true;
	while (changed) {
		changed = false;
		for (const varName of usedVars) {
			const t = traversalMap.get(varName);
			if (!t) continue;
			// Extract the base variable from the path
			const match = t.path.match(/^(\w+)\./);
			if (match && match[1] !== "this") {
				if (!usedVars.has(match[1])) {
					usedVars.add(match[1]);
					changed = true;
				}
			}
		}
	}

	return lir.connected.traversals.filter((t) => usedVars.has(t.varName));
}
