/** @typedef {import("./types.d.ts").ComponentIR} ComponentIR */
/** @typedef {import("./types.d.ts").ComponentLIR} ComponentLIR */
/** @typedef {import("./types.d.ts").TemplateOp} TemplateOp */
/** @typedef {import("./types.d.ts").TraversalOp} TraversalOp */
/** @typedef {import("./types.d.ts").CellOp} CellOp */
/** @typedef {import("./types.d.ts").FunctionOp} FunctionOp */
/** @typedef {import("./types.d.ts").BindingOp} BindingOp */
/** @typedef {import("./types.d.ts").EventOp} EventOp */
/** @typedef {import("./types.d.ts").BlockOp} BlockOp */
/** @typedef {import("./types.d.ts").BlockVar} BlockVar */
/** @typedef {import("./types.d.ts").PropSetOp} PropSetOp */
/** @typedef {import("./types.d.ts").NodeIR} NodeIR */
/** @typedef {import("./types.d.ts").ExprIR} ExprIR */
/** @typedef {import("./types.d.ts").UserImport} UserImport */

import { compileExpr, compileComputedBody, compileExpandedExpr } from "./expr-compiler.js";

const SVG_ELEMENTS = new Set([
	"svg", "circle", "rect", "line", "path", "text", "g", "defs", "use",
	"symbol", "clipPath", "mask", "pattern", "marker", "image",
	"ellipse", "polygon", "polyline", "foreignObject",
	"feGaussianBlur", "feOffset", "feBlend", "feColorMatrix",
	"feComponentTransfer", "feComposite", "feConvolveMatrix",
	"feDiffuseLighting", "feDisplacementMap", "feFlood",
	"feFuncA", "feFuncB", "feFuncG", "feFuncR",
	"feImage", "feMerge", "feMergeNode", "feMorphology",
	"feSpecularLighting", "feTile", "feTurbulence",
	"linearGradient", "radialGradient", "stop",
	"animate", "animateMotion", "animateTransform", "set",
	"desc", "metadata", "title",
	"textPath", "tspan",
	"filter",
]);

/**
 * Lower MIR → LIR.
 * @param {ComponentIR} mir
 * @returns {ComponentLIR}
 */
export function lower(mir) {
	const ctx = new LoweringContext(mir);
	ctx.lowerState();
	ctx.lowerActions();
	ctx.lowerRender();
	return ctx.build();
}

class LoweringContext {
	/** @param {ComponentIR} mir */
	constructor(mir) {
		this.mir = mir;
		/** @type {TemplateOp[]} */
		this.templates = [];
		/** @type {CellOp[]} */
		this.cells = [];
		/** @type {FunctionOp[]} */
		this.functions = [];
		/** @type {TraversalOp[]} */
		this.traversals = [];
		/** @type {BindingOp[]} */
		this.bindings = [];
		/** @type {EventOp[]} */
		this.events = [];
		/** @type {BlockOp[]} */
		this.blocks = [];
		/** @type {BlockVar[]} */
		this.blockVars = [];
		/** @type {PropSetOp[]} */
		this.propSets = [];
		/** @type {string[]} */
		this.delegatedEvents = [];
		/** @type {Set<string>} */
		this.runtimeImports = new Set(["defineComponent"]);
		/** @type {Map<string, UserImport>} */
		this.userImportMap = new Map();
		/** @type {string[]} */
		this.observedAttributes = [];

		this.templateCounter = 0;
		this.eachLiftCounter = 0;
		/** @type {Map<string, number>} tag name → counter */
		this.elementCounters = new Map();
		/** @type {Map<string, number>} cell name → ref counter */
		this.refCounters = new Map();
		/** @type {Set<string>} */
		this.usedBlockVarNames = new Set();

		// State name sets for lookups
		this.stateNames = new Set(mir.state.map((s) => s.name));
		this.computedNames = new Set(
			mir.state.filter((s) => s.kind === "computed").map((s) => s.name),
		);
		/** @type {Map<string, ExprIR>} */
		this.computedBodies = new Map();
		/** @type {Map<string, Set<string>>} computed → direct dependencies */
		this.computedDeps = new Map();
		/** @type {Map<string, string>} state name → collection key field */
		this.collectionKeys = new Map();

		// Track which cells escape (need notify)
		/** @type {Set<string>} */
		this.escapingCells = new Set();

		// Track block associations: cellName → blockVar[]
		/** @type {Map<string, { var: string, type: "show" | "each" | "fallback" }[]>} */
		this.cellBlocks = new Map();

		// Collect imports from metadata
		if (mir.metadata?.imports) {
			for (const imp of mir.metadata.imports) {
				if (imp.source === "roqa") {
					// Absorb roqa runtime imports the user referenced into the
					// component's runtime imports set so the emitted output
					// requires the same exports.
					for (const b of imp.bindings) {
						const name = typeof b === "string" ? b : b.local;
						this.runtimeImports.add(name);
					}
					continue;
				}
				this.userImportMap.set(imp.source, {
					source: imp.source,
					bindings: [...imp.bindings],
					sideEffect: imp.sideEffect,
				});
			}
		}

		// Collect observed attributes from attr-read expressions in render tree
		this.collectObservedAttributes();
	}

	collectObservedAttributes() {
		/** @type {Set<string>} */
		const attrs = new Set();

		/** @param {ExprIR} expr */
		const walkExpr = (expr) => {
			if (!expr || typeof expr !== "object") return;
			if (expr.kind === "attr-read") {
				attrs.add(expr.name);
				return;
			}
			// Walk children
			switch (expr.kind) {
				case "binary":
					walkExpr(expr.left);
					walkExpr(expr.right);
					break;
				case "unary":
					walkExpr(expr.operand);
					break;
				case "conditional":
					walkExpr(expr.test);
					walkExpr(expr.consequent);
					walkExpr(expr.alternate);
					break;
				case "member":
					walkExpr(expr.object);
					break;
				case "call":
					walkExpr(expr.callee);
					expr.args.forEach(walkExpr);
					break;
				case "method-call":
					walkExpr(expr.object);
					expr.args.forEach(walkExpr);
					break;
				case "closure":
					walkExpr(expr.body);
					break;
			}
		};

		/** @param {NodeIR[]} nodes */
		const walkNodes = (nodes) => {
			for (const node of nodes) {
				if (node.kind === "element") {
					if (node.classes && node.classes.kind === "class-list") {
						for (const item of node.classes.items) {
							if (typeof item === "string") continue;
							if ("kind" in item && item.kind === "dynamic") {
								walkExpr(item.value);
							} else {
								walkExpr(item.condition);
							}
						}
					}
					if (node.styles && node.styles.kind === "style-map") {
						for (const prop of node.styles.properties) {
							walkExpr(prop.value);
						}
					}
					for (const [, val] of Object.entries(node.attributes)) {
						walkExpr(val);
					}
					walkNodes(node.children);
				} else if (node.kind === "show") {
					walkNodes(node.render);
					if (node.fallback) walkNodes(node.fallback);
				} else if (node.kind === "each") {
					walkNodes(node.render);
				}
			}
		};

		walkNodes(this.mir.render);
		// Also from attrs declared with reflect
		for (const attr of this.mir.attrs) {
			if (attr.reflect) {
				attrs.add(attr.name);
			}
		}
		this.observedAttributes = [...attrs];
	}

	nextTemplateId() {
		return `$tmpl_${++this.templateCounter}`;
	}

	/**
	 * @param {string} tag
	 * @returns {string}
	 */
	nextElementVar(tag) {
		const safeName = tag.replace(/-/g, "_");
		const count = (this.elementCounters.get(safeName) || 0) + 1;
		this.elementCounters.set(safeName, count);
		return `${safeName}_${count}`;
	}

	/** @param {string} cellName */
	nextRefName(cellName) {
		const count = (this.refCounters.get(cellName) || 0) + 1;
		this.refCounters.set(cellName, count);
		return `${cellName}.ref_${count}`;
	}

	/**
	 * Make a block controller variable name unique by appending a numeric
	 * suffix when the same base name has already been used in this component.
	 * @param {string} base
	 */
	uniqueBlockVar(base) {
		if (!this.usedBlockVarNames.has(base)) {
			this.usedBlockVarNames.add(base);
			return base;
		}
		let i = 2;
		while (this.usedBlockVarNames.has(`${base}_${i}`)) i++;
		const name = `${base}_${i}`;
		this.usedBlockVarNames.add(name);
		return name;
	}

	/**
	 * Compile an expression, expanding computed-read references with their bodies.
	 * @param {ExprIR} expr
	 * @param {import("./expr-compiler.js").ExprContext} [ctx]
	 * @returns {string}
	 */
	compileExprExpanded(expr, ctx) {
		return compileExpandedExpr(expr, this.computedBodies);
	}

	/**
	 * Compile an expression with the lowering context's defaults
	 * (collection keys, etc.) merged in. Frontends call collection ops by name
	 * and the compiler honors the declared `key` field via this context.
	 * @param {ExprIR} expr
	 * @param {import("./expr-compiler.js").ExprContext} [extraCtx]
	 * @returns {string}
	 */
	ce(expr, extraCtx) {
		return compileExpr(expr, { collectionKeys: this.collectionKeys, ...(extraCtx || {}) });
	}

	/**
	 * Compile an expression for use in a string-concatenation chain. Wraps
	 * binary/conditional/etc. expressions in parens so they don't get re-parsed
	 * as part of the surrounding `+` chain (e.g. `a + b` would otherwise
	 * coalesce with adjacent string literals into string concatenation).
	 * @param {ExprIR} expr
	 * @returns {string}
	 */
	compileTextRunPart(expr) {
		const code = this.compileExprExpanded(expr);
		if (expr.kind === "binary" || expr.kind === "conditional" || expr.kind === "unary") {
			return `(${code})`;
		}
		return code;
	}

	lowerState() {
		for (const state of this.mir.state) {
			switch (state.kind) {
				case "value": {
					const initial = state.initialExpr ?? serializeInitial(state.initial);
					this.cells.push({
						kind: "cell",
						varName: state.name,
						initial,
						inlined: false, // Set by optimizer
					});
					break;
				}
				case "collection": {
					const initial = serializeInitial(state.initial);
					this.cells.push({
						kind: "cell",
						varName: state.name,
						initial,
						inlined: false,
					});
					if (state.key) {
						this.collectionKeys.set(state.name, state.key);
					}
					break;
				}
				case "computed": {
					this.computedBodies.set(state.name, state.body);
					// Track direct dependencies
					const deps = new Set();
					collectStateDeps(state.body, deps, this.stateNames, this.computedNames);
					this.computedDeps.set(state.name, deps);
					// Use expanded body (replacing computed-read refs with their bodies)
					const expandedBody = compileExpandedExpr(state.body, this.computedBodies);
					const bodyJs = `() => ${expandedBody}`;
					this.cells.push({
						kind: "cell",
						varName: state.name,
						initial: bodyJs,
						inlined: false,
					});
					break;
				}
			}
		}
	}

	lowerActions() {
		for (const action of this.mir.actions) {
			this.lowerAction(action);
		}
	}

	/**
	 * @param {import("./types.d.ts").ActionIR} action
	 */
	lowerAction(action) {
		/** @type {import("./types.d.ts").InlinedSet[]} */
		const inlinedSets = [];
		/** @type {string[]} */
		const bodyParts = [];

		// Process the action body, maintaining order.
		// State-writes/collection-ops become inlinedSets.
		// Other statements become bodyParts that are emitted between inlinedSets.
		this.compileActionBody(action.body, inlinedSets, bodyParts);

		this.functions.push({
			kind: "function",
			varName: action.name,
			params: action.params,
			body: bodyParts.join(";\n"),
			inlinedSets,
			async: !!action.async,
		});
	}

	/**
	 * @param {ExprIR} expr
	 * @param {import("./types.d.ts").InlinedSet[]} inlinedSets
	 * @param {string[]} bodyParts
	 */
	compileActionBody(expr, inlinedSets, bodyParts) {
		if (expr.kind === "block") {
			for (const stmt of expr.body) {
				this.compileActionBody(stmt, inlinedSets, bodyParts);
			}
		} else if (expr.kind === "state-write") {
			const valueExpr = this.ce(expr.value);
			/** @type {import("./types.d.ts").InlinedSet} */
			const set = {
				cellName: expr.name,
				valueExpr,
				updates: [],
				blockUpdates: [],
				notify: false,
			};
			// Capture any pending body parts and run them before this set so the
			// emitted order matches the original action.
			if (bodyParts.length > 0) {
				set.prelude = bodyParts.join(";\n");
				bodyParts.length = 0;
			}
			inlinedSets.push(set);
		} else if (expr.kind === "collection-op") {
			const compiled = this.ce(expr);
			/** @type {import("./types.d.ts").InlinedSet} */
			const set = {
				cellName: expr.name,
				valueExpr: compiled.replace(`${expr.name}.v = `, ""),
				updates: [],
				blockUpdates: [],
				notify: false,
			};
			if (bodyParts.length > 0) {
				set.prelude = bodyParts.join(";\n");
				bodyParts.length = 0;
			}
			inlinedSets.push(set);
		} else {
			bodyParts.push(this.ce(expr));
		}
	}

	lowerRender() {
		if (this.mir.render.length === 0) return;

		// Check if any child elements are custom elements with props
		const hasChildProps = this.checkForChildProps(this.mir.render);

		// Extract template HTML from the render tree
		const templateId = this.nextTemplateId();
		const isSvg = this.mir.render.some((n) => n.kind === "element" && SVG_ELEMENTS.has(n.tag));
		const html = this.extractTemplateHtml(this.mir.render, isSvg);

		this.templates.push({
			kind: "template",
			id: templateId,
			html,
			svg: isSvg,
		});

		if (isSvg) {
			this.runtimeImports.add("svgTemplate");
		} else {
			this.runtimeImports.add("template");
		}

		// Generate traversals, bindings, events, blocks
		this.resetElementCounters();
		this.refCounters.clear();

		// Walk the render tree to generate traversals/bindings/events
		const rootElements = this.mir.render.filter((n) => n.kind === "element");
		if (rootElements.length === 1) {
			const rootEl = /** @type {import("./types.d.ts").ElementIR} */ (rootElements[0]);
			const rootVar = this.nextElementVar(rootEl.tag);

			// Check for two-phase traversal (child props)
			if (hasChildProps) {
				this.lowerElementWithChildProps(rootEl, rootVar, templateId);
			} else {
				this.traversals.push({
					kind: "traversal",
					varName: rootVar,
					path: "this.firstChild",
				});

				this.lowerElementChildren(rootEl, rootVar, false);
			}
		} else if (rootElements.length > 1) {
			this.lowerMultiRootRender(isSvg);
		}
	}

	/**
	 * Lower a multi-root render array (fragment with multiple root elements).
	 * Generates traversals, bindings, events for each root and any
	 * interspersed text/reactive-text nodes.
	 * @param {boolean} isSvg
	 */
	lowerMultiRootRender(isSvg) {
		let prevVar = null;
		let childIndex = 0;
		let i = 0;

		while (i < this.mir.render.length) {
			const child = this.mir.render[i];

			if (child.kind === "element") {
				const varName = this.nextElementVar(child.tag);

				let path;
				if (childIndex === 0) {
					path = "this.firstChild";
				} else if (prevVar) {
					path = `${prevVar}.nextSibling`;
				} else {
					path = "this.firstChild";
				}

				this.traversals.push({
					kind: "traversal",
					varName,
					path,
				});

				this.lowerElementChildren(child, varName, isSvg);
				prevVar = varName;
				childIndex++;
				i++;
			} else if (child.kind === "text" || child.kind === "reactive-text") {
				// Handle text/reactive-text runs at root level
				let runStart = i;
				let runHasText = false;
				let runHasReactive = false;
				while (
					i < this.mir.render.length &&
					(this.mir.render[i].kind === "text" || this.mir.render[i].kind === "reactive-text")
				) {
					if (this.mir.render[i].kind === "text") runHasText = true;
					else runHasReactive = true;
					i++;
				}
				let runEnd = i;

				const textVar = `root_text_${childIndex}`;
				let path;
				if (childIndex === 0) {
					path = "this.firstChild";
				} else if (prevVar) {
					path = `${prevVar}.nextSibling`;
				} else {
					path = "this.firstChild";
				}

				this.traversals.push({
					kind: "traversal",
					varName: textVar,
					path,
				});

				if (runHasReactive) {
					/** @type {string[]} */
					const parts = [];
					for (let j = runStart; j < runEnd; j++) {
						const c = this.mir.render[j];
						if (c.kind === "text") {
							parts.push(JSON.stringify(c.value));
						} else if (c.kind === "reactive-text") {
							parts.push(this.compileTextRunPart(c.source));
						}
					}

					const expression = parts.join(" + ");
					const cellName = this.findRunBindingCell(this.mir.render, runStart, runEnd);

					if (cellName) {
						const refName = this.nextRefName(cellName);
						this.bindings.push({
							kind: "binding",
							cellName,
							refName,
							target: textVar,
							property: "nodeValue",
							expression,
							initialValue: expression,
							inlined: false,
						});
					}
				}

				// Advance the traversal anchor past the (possibly coalesced) text
				// node so subsequent root traversals can chain via `.nextSibling`.
				prevVar = textVar;
				childIndex++;
			} else if (child.kind === "show") {
				this.lowerShowBlock(child, prevVar || "this");
				i++;
			} else if (child.kind === "each") {
				this.lowerEachBlock(child, prevVar || "this");
				i++;
			} else {
				i++;
			}
		}
	}

	/**
	 * @param {NodeIR[]} nodes
	 * @returns {boolean}
	 */
	checkForChildProps(nodes) {
		for (const node of nodes) {
			if (node.kind === "element") {
				if (node.tag.includes("-") && Object.keys(node.attributes).length > 0) {
					return true;
				}
				if (this.checkForChildProps(node.children)) return true;
			}
		}
		return false;
	}

	/**
	 * @param {import("./types.d.ts").ElementIR} el
	 * @param {string} rootVar
	 * @param {string} templateId
	 */
	lowerElementWithChildProps(el, rootVar, templateId) {
		this.runtimeImports.add("setProp");

		// Compute traversal to each custom element child from $root_1
		// The root element is $root_1.firstChild (first child of the DocumentFragment)
		const rootPath = "$root_1.firstChild";

		// Track custom element children and their traversal paths
		/** @type {{ varName: string, path: string, propSets: { name: string, value: string }[] }[]} */
		const propTargets = [];

		// Walk the children of the root element to find custom elements
		let prevSiblingPath = null;
		let childIdx = 0;
		for (const child of el.children) {
			if (child.kind !== "element") {
				childIdx++;
				continue;
			}

			let childPath;
			if (childIdx === 0) {
				childPath = `${rootVar}.firstChild`;
			} else if (prevSiblingPath) {
				childPath = `${prevSiblingPath}.nextSibling`;
			} else {
				childPath = `${rootVar}.firstChild`;
				// Need to chain from previous siblings
				for (let j = 0; j < childIdx; j++) {
					if (j === 0) childPath = `${rootVar}.firstChild`;
					else childPath += ".nextSibling";
				}
			}

			if (child.tag.includes("-") && Object.keys(child.attributes).length > 0) {
				const varName = this.nextElementVar(child.tag);

				// Build path from rootVar - compute how to reach this child
				let computedPath;
				if (childIdx === 0) {
					computedPath = `${rootVar}.firstChild`;
				} else {
					// Build a chain: rootVar.firstChild then .nextSibling for each preceding element
					computedPath = `${rootVar}.firstChild`;
					let siblingCount = 0;
					for (let j = 0; j < el.children.indexOf(child); j++) {
						const prev = el.children[j];
						if (prev.kind === "element" || prev.kind === "text" || prev.kind === "reactive-text") {
							siblingCount++;
						}
					}
					// But actually we need to count DOM nodes, not IR nodes
					// Adjacent text/reactive-text creates single text nodes
					// For simplicity, just use firstChild.nextSibling chain
					computedPath = `${rootVar}.firstChild`;
					for (let j = 0; j < childIdx; j++) {
						computedPath += ".nextSibling";
					}
				}

				/** @type {{ name: string, value: string }[]} */
				const propSetsForTarget = [];
				for (const [attrName, attrValue] of Object.entries(child.attributes)) {
					propSetsForTarget.push({
						name: attrName,
						value: this.ce(attrValue),
					});
				}

				propTargets.push({
					varName,
					path: computedPath,
					propSets: propSetsForTarget,
				});

				prevSiblingPath = varName;
			} else {
				prevSiblingPath = null; // Don't track non-custom elements by var
			}
			childIdx++;
		}

		if (propTargets.length > 0) {
			// Add root var traversal (from $root_1, not this)
			this.traversals.push({
				kind: "traversal",
				varName: rootVar,
				path: rootPath,
			});

			// Phase 1 traversals: prop targets from detached fragment
			for (const target of propTargets) {
				this.traversals.push({
					kind: "traversal",
					varName: target.varName,
					path: target.path,
				});

				// Generate setProp calls
				for (const ps of target.propSets) {
					this.propSets.push({
						kind: "prop-set",
						target: target.varName,
						propName: ps.name,
						value: ps.value,
					});
				}
			}

			// Phase 2: remaining children after appendChild
			// Only traverse children that come AFTER prop targets, using prop vars as anchors
			const propVarNames = new Set(propTargets.map((t) => t.varName));
			const propTagNames = new Set(propTargets.map((t) => {
				// Find the child element that this prop target corresponds to
				for (const c of el.children) {
					if (c.kind === "element" && c.tag.includes("-") && Object.keys(c.attributes).length > 0) {
						return c.tag;
					}
				}
				return "";
			}));

			// Walk children: skip elements until we pass all prop targets, then traverse remaining
			let prevAnchor = null;
			let lastPropTarget = propTargets[propTargets.length - 1];
			let pastAllPropTargets = false;

			for (const child of el.children) {
				if (child.kind !== "element") {
					continue;
				}

				if (child.tag.includes("-") && Object.keys(child.attributes).length > 0) {
					// This is a prop target — use its var as anchor
					prevAnchor = propTargets.find((t) => true)?.varName; // Use the prop target var
					for (const pt of propTargets) {
						prevAnchor = pt.varName; // Get last prop target var as anchor
					}
					pastAllPropTargets = true;
					continue;
				}

				if (!pastAllPropTargets) {
					// Before prop targets — skip, but remember as potential sibling
					continue;
				}

				// After all prop targets — traverse from last anchor
				const varName = this.nextElementVar(child.tag);
				this.traversals.push({
					kind: "traversal",
					varName,
					path: prevAnchor ? `${prevAnchor}.nextSibling` : `${rootVar}.firstChild`,
				});
				this.lowerElementChildren(child, varName, false);
				prevAnchor = varName;
			}
		} else {
			this.traversals.push({
				kind: "traversal",
				varName: rootVar,
				path: "this.firstChild",
			});
			this.lowerElementChildren(el, rootVar, false);
		}
	}

	/**
	 * @param {import("./types.d.ts").ElementIR} el
	 * @param {string} basePath
	 * @param {{ varName: string, path: string, attrs: Record<string, ExprIR> }[]} targets
	 */
	findPropTargets(el, basePath, targets) {
		let prevSiblingVar = null;
		let childIndex = 0;

		for (const child of el.children) {
			if (child.kind !== "element") {
				if (child.kind === "text" || child.kind === "reactive-text") {
					childIndex++;
				}
				continue;
			}

			let path;
			if (childIndex === 0) {
				path = basePath.endsWith(".firstChild")
					? basePath
					: `${basePath}.firstChild`;
				if (basePath === "$root_1.firstChild") {
					path = `$root_1.firstChild`;
				} else {
					path = `${basePath}.firstChild`;
				}
			} else if (prevSiblingVar) {
				path = `${prevSiblingVar}.nextSibling`;
			} else {
				path = `${basePath}.firstChild`;
			}

			// If custom element, collect its attrs as prop targets
			if (child.tag.includes("-")) {
				const varName = this.nextElementVar(child.tag);
				// Build traversal path considering earlier siblings
				let traversalPath;
				if (childIndex === 0) {
					traversalPath = `${basePath}.firstChild`;
					if (basePath === "$root_1.firstChild") {
						traversalPath = "$root_1.firstChild.firstChild";
					}
				} else {
					traversalPath = path;
				}
				targets.push({
					varName,
					path: traversalPath,
					attrs: child.attributes,
				});
				prevSiblingVar = varName;
			} else {
				prevSiblingVar = child.tag + "_temp";
			}
			childIndex++;
		}
	}

	resetElementCounters() {
		this.elementCounters.clear();
	}

	/**
	 * Extract HTML from the render tree, replacing reactive content with placeholders.
	 * @param {NodeIR[]} nodes
	 * @param {boolean} isSvg
	 * @returns {string}
	 */
	extractTemplateHtml(nodes, isSvg) {
		let html = "";
		for (const node of nodes) {
			html += this.nodeToHtml(node, isSvg);
		}
		return html;
	}

	/**
	 * @param {NodeIR} node
	 * @param {boolean} isSvg
	 * @returns {string}
	 */
	nodeToHtml(node, isSvg) {
		switch (node.kind) {
			case "text":
				return escapeHtml(node.value);

			case "reactive-text":
				return " "; // Single space placeholder for text node

			case "element": {
				const childSvg = isSvg || SVG_ELEMENTS.has(node.tag);
				let html = `<${node.tag}`;

				// Static attributes
				for (const [name, expr] of Object.entries(node.attributes)) {
					if (expr.kind === "literal") {
						// For custom elements, omit — they become setProp
						if (node.tag.includes("-")) continue;
						html += ` ${name}="${escapeAttr(String(expr.value))}"`;
					}
					// Dynamic attributes are omitted from template
				}

				// Static classes
				if (node.classes) {
					if (node.classes.kind === "static-class") {
						html += ` class="${escapeAttr(node.classes.value)}"`;
					}
					// class-list with conditional items: omit class from template
				}

				// Static styles
				if (node.styles) {
					if (node.styles.kind === "static-style") {
						html += ` style="${escapeAttr(node.styles.value)}"`;
					} else if (node.styles.kind === "style-map") {
						// Fold literal-valued style properties into the
						// inline style attribute. Reactive properties are
						// emitted as runtime bindings.
						const staticParts = [];
						for (const prop of node.styles.properties) {
							if (prop.value.kind === "literal") {
								staticParts.push(`${prop.property}: ${String(prop.value.value)}`);
							}
						}
						if (staticParts.length > 0) {
							html += ` style="${escapeAttr(staticParts.join("; "))}"`;
						}
					}
				}

				html += ">";

				// Generate children HTML, coalescing text+reactive runs
				const hasCoalescedText = this.hasAdjacentTextAndReactive(node.children);

				if (hasCoalescedText) {
					html += " ";
				} else {
					html += this.generateChildrenHtml(node.children, childSvg);
				}

				// Self-closing elements
				const voidElements = new Set(["input", "br", "hr", "img", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"]);
				if (!voidElements.has(node.tag)) {
					html += `</${node.tag}>`;
				}

				return html;
			}

			case "show":
			case "each":
				// These don't produce template HTML
				return "";

			default:
				return "";
		}
	}

	/**
	 * Check if ALL children are text/reactive-text (pure text coalescing).
	 * @param {NodeIR[]} children
	 * @returns {boolean}
	 */
	hasAdjacentTextAndReactive(children) {
		if (children.length === 0) return false;
		let hasText = false;
		let hasReactive = false;
		for (const child of children) {
			if (child.kind === "text") hasText = true;
			else if (child.kind === "reactive-text") hasReactive = true;
			else return false; // Element/show/each breaks coalescing
		}
		return hasText && hasReactive;
	}

	/**
	 * Generate HTML for children, coalescing runs of text+reactive into single spaces.
	 * @param {NodeIR[]} children
	 * @param {boolean} isSvg
	 * @returns {string}
	 */
	generateChildrenHtml(children, isSvg) {
		let html = "";
		let i = 0;
		while (i < children.length) {
			const child = children[i];
			if (child.kind === "show" || child.kind === "each") {
				i++;
				continue;
			}
			if (child.kind === "text" || child.kind === "reactive-text") {
				// Check if this starts a run of text+reactive
				let hasText = child.kind === "text";
				let hasReactive = child.kind === "reactive-text";
				let j = i + 1;
				while (j < children.length && (children[j].kind === "text" || children[j].kind === "reactive-text")) {
					if (children[j].kind === "text") hasText = true;
					else hasReactive = true;
					j++;
				}
				if (hasText && hasReactive) {
					html += " ";
				} else if (hasReactive && !hasText) {
					html += " ";
				} else {
					// All static text
					for (let k = i; k < j; k++) {
						html += this.nodeToHtml(children[k], isSvg);
					}
				}
				i = j;
			} else {
				html += this.nodeToHtml(child, isSvg);
				i++;
			}
		}
		return html;
	}

	/**
	 * Lower children of an element, generating traversals, bindings, events, blocks.
	 * @param {import("./types.d.ts").ElementIR} el
	 * @param {string} parentVar
	 * @param {boolean} isSvg
	 * @param {Set<string>} [skipVars] - Vars already declared in phase 1
	 */
	lowerElementChildren(el, parentVar, isSvg, skipVars) {
		const childSvg = isSvg || SVG_ELEMENTS.has(el.tag);

		// Process events on this element
		for (const evt of el.events) {
			this.lowerEvent(evt, parentVar);
		}

		// Process reactive attributes on this element
		for (const [name, expr] of Object.entries(el.attributes)) {
			if (expr.kind !== "literal") {
				// Skip custom element children — handled via setProp
				if (el.tag.includes("-")) continue;

				const compiled = this.ce(expr);
				const refName = this.nextRefName(this.findBindingCell(expr));
				const cellName = this.findBindingCell(expr);

				if (cellName && this.stateNames.has(cellName)) {
					const isSvgAttr = childSvg && name !== "className" && name !== "nodeValue";
					this.bindings.push({
						kind: "binding",
						cellName,
						refName,
						target: parentVar,
						property: name,
						expression: compiled,
						initialValue: compiled,
						inlined: false,
						isSvgAttr,
					});
				}
			}
		}

		// Process classes
		if (el.classes && el.classes.kind === "class-list") {
			this.lowerClassList(el.classes, parentVar);
		}

		// Process reactive style-map properties
		if (el.styles && el.styles.kind === "style-map") {
			for (const prop of el.styles.properties) {
				if (prop.value.kind === "literal") continue;
				const compiled = this.ce(prop.value);
				const cellName = this.findBindingCell(prop.value);
				const refName = this.nextRefName(cellName || parentVar.replace(/[^a-zA-Z0-9_]/g, "_"));
				this.bindings.push({
					kind: "binding",
					cellName: cellName && this.stateNames.has(cellName) ? cellName : "",
					refName: cellName && this.stateNames.has(cellName) ? refName : "",
					target: parentVar,
					property: prop.property,
					expression: compiled,
					initialValue: compiled,
					inlined: false,
					isStyleProp: true,
				});
			}
		}

		// Check for coalesced text
		const hasCoalescedText = this.hasAdjacentTextAndReactive(el.children);

		if (hasCoalescedText) {
			this.lowerCoalescedText(el.children, parentVar, childSvg);
			return;
		}

		// Process children, detecting text+reactive runs
		let prevVar = null;
		let childIndex = 0;
		let i = 0;

		while (i < el.children.length) {
			const child = el.children[i];

			if (child.kind === "element") {
				// Check if this element is already handled in phase 1
				if (skipVars && child.tag.includes("-")) {
					const safeName = child.tag.replace(/-/g, "_");
					const nextCount = (this.elementCounters.get(safeName) || 0) + 1;
					const peekVar = `${safeName}_${nextCount}`;
					if (skipVars.has(peekVar)) {
						// Already declared in phase 1 — just advance counters
						this.elementCounters.set(safeName, nextCount);
						prevVar = peekVar;
						childIndex++;
						i++;
						continue;
					}
				}

				const varName = this.nextElementVar(child.tag);
				if (skipVars && skipVars.has(varName)) {
					prevVar = varName;
					childIndex++;
					i++;
					continue;
				}

				let path;
				if (childIndex === 0) {
					path = `${parentVar}.firstChild`;
				} else if (prevVar) {
					path = `${prevVar}.nextSibling`;
				} else {
					path = `${parentVar}.firstChild`;
				}

				this.traversals.push({
					kind: "traversal",
					varName,
					path,
				});

				this.lowerElementChildren(child, varName, childSvg);
				prevVar = varName;
				childIndex++;
				i++;
			} else if (child.kind === "text" || child.kind === "reactive-text") {
				// Detect a run of text/reactive-text
				let runStart = i;
				let runHasText = false;
				let runHasReactive = false;
				while (i < el.children.length && (el.children[i].kind === "text" || el.children[i].kind === "reactive-text")) {
					if (el.children[i].kind === "text") runHasText = true;
					else runHasReactive = true;
					i++;
				}
				let runEnd = i;

				if (runHasReactive) {
					// Create a coalesced text node binding for this run
					const textVar = `${parentVar}_text`;
					let path;
					if (childIndex === 0) {
						path = `${parentVar}.firstChild`;
					} else if (prevVar) {
						path = `${prevVar}.nextSibling`;
					} else {
						path = `${parentVar}.firstChild`;
					}

					this.traversals.push({
						kind: "traversal",
						varName: textVar,
						path,
					});

					// Build expression from all parts in the run
					/** @type {string[]} */
					const parts = [];
					for (let j = runStart; j < runEnd; j++) {
						const c = el.children[j];
						if (c.kind === "text") {
							parts.push(JSON.stringify(c.value));
						} else if (c.kind === "reactive-text") {
							parts.push(this.compileTextRunPart(c.source));
						}
					}

					const expression = parts.join(" + ");
					const cellName = this.findRunBindingCell(el.children, runStart, runEnd);

					if (cellName) {
						const refName = this.nextRefName(cellName);
						this.bindings.push({
							kind: "binding",
							cellName,
							refName,
							target: textVar,
							property: "nodeValue",
							expression,
							initialValue: expression,
							inlined: false,
						});
					} else {
						this.bindings.push({
							kind: "binding",
							cellName: "",
							refName: "",
							target: textVar,
							property: "nodeValue",
							expression,
							initialValue: expression,
							inlined: false,
						});
					}

					prevVar = textVar;
					childIndex++;
				} else {
					// All static text - no binding needed, just increment index
					childIndex += (runEnd - runStart);
				}
			} else if (child.kind === "show") {
				this.lowerShowBlock(child, parentVar);
				i++;
			} else if (child.kind === "each") {
				this.lowerEachBlock(child, parentVar);
				i++;
			} else {
				i++;
			}
		}
	}

	/**
	 * Lower coalesced text (adjacent text + reactive-text).
	 * @param {NodeIR[]} children
	 * @param {string} parentVar
	 * @param {boolean} isSvg
	 */
	lowerCoalescedText(children, parentVar, isSvg) {
		// Collect all adjacent text/reactive parts, stopping at elements
		/** @type {{ kind: "static" | "reactive", value: string, expr?: ExprIR }[]} */
		let parts = [];
		let elementChildren = [];
		let textStarted = false;

		for (const child of children) {
			if (child.kind === "text") {
				parts.push({ kind: "static", value: JSON.stringify(child.value) });
				textStarted = true;
			} else if (child.kind === "reactive-text") {
				parts.push({ kind: "reactive", value: this.compileTextRunPart(child.source), expr: child.source });
				textStarted = true;
			} else if (child.kind === "element") {
				elementChildren.push(child);
			} else if (child.kind === "show") {
				// Show blocks inside coalesced text parents
				this.lowerShowBlock(child, parentVar);
			} else if (child.kind === "each") {
				this.lowerEachBlock(child, parentVar);
			}
		}

		if (parts.length > 0) {
			// Create a text node traversal
			const textVar = `${parentVar}_text`;
			this.traversals.push({
				kind: "traversal",
				varName: textVar,
				path: `${parentVar}.firstChild`,
			});

			// Build concatenated expression
			const expression = parts.map((p) => p.value).join(" + ");

			// Find the primary binding cell(s)
			const reactiveParts = parts.filter((p) => p.kind === "reactive" && p.expr);
			const cells = new Set();
			for (const part of reactiveParts) {
				const cell = this.findBindingCell(/** @type {ExprIR} */(part.expr));
				if (cell) cells.add(cell);
			}

			if (cells.size > 0) {
				// Use the first cell as the primary binding cell
				const primaryCell = [...cells][0];
				const refName = this.nextRefName(primaryCell);

				this.bindings.push({
					kind: "binding",
					cellName: primaryCell,
					refName,
					target: textVar,
					property: "nodeValue",
					expression,
					initialValue: expression,
					inlined: false,
				});
			}

			// Process element children with traversals after the text node
			let prevVar = textVar;
			for (const child of elementChildren) {
				const varName = this.nextElementVar(child.tag);
				this.traversals.push({
					kind: "traversal",
					varName,
					path: `${prevVar}.nextSibling`,
				});
				this.lowerElementChildren(child, varName, isSvg);
				prevVar = varName;
			}
		}
	}

	/**
	 * @param {import("./types.d.ts").ClassListIR} classList
	 * @param {string} targetVar
	 */
	lowerClassList(classList, targetVar) {
		// Build className expression
		const parts = classList.items.map((item) => {
			if (typeof item === "string") {
				return JSON.stringify(item);
			}
			if ("kind" in item && item.kind === "dynamic") {
				// Wrap in helper to prepend a leading space when non-empty.
				const inner = this.ce(item.value);
				return `((__c) => __c ? " " + __c : "")(${inner})`;
			}
			return `(${this.ce(item.condition)} ? " ${item.name}" : "")`;
		});

		const expression = parts.join(" + ");

		// Find the binding cell
		const cells = new Set();
		for (const item of classList.items) {
			if (typeof item === "string") continue;
			const expr = "kind" in item && item.kind === "dynamic" ? item.value : item.condition;
			const cell = this.findBindingCell(expr);
			if (cell) cells.add(cell);
		}

		if (cells.size > 0) {
			const primaryCell = [...cells][0];
			const refName = this.nextRefName(primaryCell);
			this.bindings.push({
				kind: "binding",
				cellName: primaryCell,
				refName,
				target: targetVar,
				property: "className",
				expression,
				initialValue: expression,
				inlined: false,
			});
		} else {
			// No reactive state cell, but may have attr-read conditions
			// Still need a className binding for initial value + attrChanged
			const hasAttrRead = classList.items.some((item) => {
				if (typeof item === "string") return false;
				const expr = "kind" in item && item.kind === "dynamic" ? item.value : item.condition;
				return this.hasAttrRead(expr);
			});
			if (hasAttrRead) {
				this.bindings.push({
					kind: "binding",
					cellName: "",
					refName: "",
					target: targetVar,
					property: "className",
					expression,
					initialValue: expression,
					inlined: false,
				});
			}
		}
	}

	/**
	 * Check if an expression contains an attr-read.
	 * @param {ExprIR} expr
	 * @returns {boolean}
	 */
	hasAttrRead(expr) {
		if (!expr || typeof expr !== "object") return false;
		if (expr.kind === "attr-read") return true;
		switch (expr.kind) {
			case "binary":
				return this.hasAttrRead(expr.left) || this.hasAttrRead(expr.right);
			case "unary":
				return this.hasAttrRead(expr.operand);
			default:
				return false;
		}
	}

	/**
	 * @param {import("./types.d.ts").EventBindingIR} evt
	 * @param {string} targetVar
	 */
	lowerEvent(evt, targetVar) {
		const eventName = evt.event;
		let handler;
		let delegated = true;

		if (evt.handler.kind === "action-call") {
			if (evt.handler.args.length === 0) {
				handler = evt.handler.name;
			} else {
				const args = evt.handler.args.map((a) => this.ce(a));
				handler = `[${evt.handler.name}, ${args.join(", ")}]`;
			}
		} else if (evt.handler.kind === "closure") {
			handler = this.ce(evt.handler, { isInlineHandler: true });
			delegated = true;
		} else {
			handler = this.ce(evt.handler);
		}

		this.events.push({
			kind: "event",
			target: targetVar,
			event: eventName,
			handler,
			delegated,
		});

		if (delegated && !this.delegatedEvents.includes(eventName)) {
			this.delegatedEvents.push(eventName);
		}
	}

	/**
	 * @param {import("./types.d.ts").ShowIR} show
	 * @param {string} containerVar
	 */
	lowerShowBlock(show, containerVar) {
		this.runtimeImports.add("showBlock");

		const cellName = show.condition.name;
		const controllerVar = this.uniqueBlockVar(`${cellName}_showBlock`);

		this.blockVars.push({ name: controllerVar, blockType: "show" });

		// Register block for the cell
		if (!this.cellBlocks.has(cellName)) {
			this.cellBlocks.set(cellName, []);
		}
		this.cellBlocks.get(cellName).push({ var: controllerVar, type: "show" });

		// Create template for the show content
		const showTemplateId = this.nextTemplateId();
		const showHtml = this.extractTemplateHtml(show.render, false);
		this.templates.push({
			kind: "template",
			id: showTemplateId,
			html: showHtml,
			svg: false,
		});

		// Build render body ops
		const renderBody = this.buildBlockRenderBody(show.render, showTemplateId);

		/** @type {BlockOp} */
		const blockOp = {
			kind: "block",
			blockType: "show",
			container: containerVar,
			source: cellName,
			controllerVar,
			templateId: showTemplateId,
			renderBody,
		};

		// Handle fallback
		if (show.fallback) {
			const fallbackControllerVar = `${cellName}_fallbackBlock`;
			this.blockVars.push({ name: fallbackControllerVar, blockType: "fallback" });

			if (!this.cellBlocks.has(cellName)) {
				this.cellBlocks.set(cellName, []);
			}
			this.cellBlocks.get(cellName).push({ var: fallbackControllerVar, type: "fallback" });

			const fallbackTemplateId = this.nextTemplateId();
			const fallbackHtml = this.extractTemplateHtml(show.fallback, false);
			this.templates.push({
				kind: "template",
				id: fallbackTemplateId,
				html: fallbackHtml,
				svg: false,
			});

			const fallbackBody = this.buildBlockRenderBody(show.fallback, fallbackTemplateId);
			blockOp.fallbackBody = fallbackBody;
			blockOp.fallbackControllerVar = fallbackControllerVar;
		}

		this.blocks.push(blockOp);
	}

	/**
	 * @param {import("./types.d.ts").EachIR} each
	 * @param {string} containerVar
	 */
	lowerEachBlock(each, containerVar) {
		this.runtimeImports.add("forBlock");

		// Auto-lift non-cell-ref sources (e.g., constant arrays, prop reads,
		// arbitrary expressions) into a synthetic computed cell so the same
		// forBlock() call shape works regardless of frontend choice.
		const sourceCellName = this.resolveEachSource(each.source);

		const controllerVar = this.uniqueBlockVar(`${sourceCellName}_forBlock`);

		this.blockVars.push({ name: controllerVar, blockType: "each" });

		if (!this.cellBlocks.has(sourceCellName)) {
			this.cellBlocks.set(sourceCellName, []);
		}
		this.cellBlocks.get(sourceCellName).push({ var: controllerVar, type: "each" });

		// Create template for each item
		const eachTemplateId = this.nextTemplateId();
		const eachHtml = this.extractTemplateHtml(each.render, false);
		this.templates.push({
			kind: "template",
			id: eachTemplateId,
			html: eachHtml,
			svg: false,
		});

		const renderBody = this.buildBlockRenderBody(each.render, eachTemplateId, each.itemAlias);

		this.blocks.push({
			kind: "block",
			blockType: "each",
			container: containerVar,
			source: sourceCellName,
			controllerVar,
			templateId: eachTemplateId,
			renderBody,
			key: each.key || undefined,
			itemAlias: each.itemAlias,
		});
	}

	/**
	 * Resolve an `EachIR.source` to a cell name. If the source is already a
	 * `cell-ref`, use it directly; otherwise synthesize a computed cell whose
	 * body is the source expression.
	 * @param {import("./types.d.ts").EachSourceIR} source
	 * @returns {string} the cell name to use as the forBlock source
	 */
	resolveEachSource(source) {
		if (source.kind === "cell-ref") {
			return source.name;
		}
		// Synthesize a computed cell. Name it `$each_<n>` so it doesn't
		// collide with user state.
		const name = `$each_${++this.eachLiftCounter}`;
		this.computedBodies.set(name, source);
		this.stateNames.add(name);
		this.computedNames.add(name);
		const deps = new Set();
		collectStateDeps(source, deps, this.stateNames, this.computedNames);
		this.computedDeps.set(name, deps);
		const expandedBody = compileExpandedExpr(source, this.computedBodies);
		this.cells.push({
			kind: "cell",
			varName: name,
			initial: `() => ${expandedBody}`,
			inlined: false,
		});
		// Inject a synthetic computed StateIR record into mir so the optimizer
		// (which reads `mir.state`) picks up the synthesized computed.
		this.mir.state.push({
			kind: "computed",
			name,
			body: source,
		});
		return name;
	}

	/**
	 * Build a render body for a block (show/each).
	 * @param {NodeIR[]} renderNodes
	 * @param {string} templateId
	 * @param {string} [itemAlias]
	 * @returns {import("./types.d.ts").BlockRenderBody}
	 */
	buildBlockRenderBody(renderNodes, templateId, itemAlias) {
		// Save and reset counters
		const savedElementCounters = new Map(this.elementCounters);
		this.elementCounters.clear();

		/** @type {TraversalOp[]} */
		const traversals = [];
		/** @type {EventOp[]} */
		const events = [];
		/** @type {BindingOp[]} */
		const bindings = [];
		/** @type {import("./types.d.ts").ClassBinding[]} */
		const classBindings = [];

		// Walk the render nodes for the block
		if (renderNodes.length === 1 && renderNodes[0].kind === "element") {
			const el = /** @type {import("./types.d.ts").ElementIR} */ (renderNodes[0]);
			const rootVar = this.nextElementVar(el.tag);

			this.processBlockElement(
				el,
				rootVar,
				itemAlias,
				traversals,
				events,
				bindings,
				classBindings,
				/* isRoot */ true,
			);

			// Restore counters
			this.elementCounters = savedElementCounters;

			return {
				templateId,
				rootElement: rootVar,
				traversals,
				events,
				bindings,
				classBindings,
			};
		}

		// Restore counters
		this.elementCounters = savedElementCounters;

		return {
			templateId,
			rootElement: "root",
			traversals: [],
			events: [],
			bindings: [],
			classBindings: [],
		};
	}

	/**
	 * Recursively walk an element inside a block render body, generating
	 * traversals/events/bindings/classes for it and its descendants.
	 *
	 * @param {import("./types.d.ts").ElementIR} el
	 * @param {string} elVar
	 * @param {string | undefined} itemAlias
	 * @param {TraversalOp[]} traversals
	 * @param {EventOp[]} events
	 * @param {BindingOp[]} bindings
	 * @param {import("./types.d.ts").ClassBinding[]} classBindings
	 * @param {boolean} isRoot
	 */
	processBlockElement(el, elVar, itemAlias, traversals, events, bindings, classBindings, isRoot) {
		// Events on this element
		for (const evt of el.events) {
			const eventName = evt.event;
			let handler;
			if (evt.handler.kind === "action-call") {
				if (evt.handler.args.length === 0) {
					handler = evt.handler.name;
				} else {
					const ctx = { itemAlias };
					const args = evt.handler.args.map((a) => this.ce(a, ctx));
					handler = `[${evt.handler.name}, ${args.join(", ")}]`;
				}
			} else if (evt.handler.kind === "closure") {
				handler = this.ce(evt.handler, { isInlineHandler: true, itemAlias });
			} else {
				handler = this.ce(evt.handler, { itemAlias });
			}
			events.push({
				kind: "event",
				target: elVar,
				event: eventName,
				handler,
				delegated: true,
			});
			if (!this.delegatedEvents.includes(eventName)) {
				this.delegatedEvents.push(eventName);
			}
		}

		// Reactive attributes
		for (const [name, expr] of Object.entries(el.attributes)) {
			if (expr.kind === "literal") continue;
			const isSvgAttr = SVG_ELEMENTS.has(el.tag) && name !== "className";
			bindings.push({
				kind: "binding",
				cellName: "",
				refName: "",
				target: elVar,
				property: name,
				expression: this.ce(expr, { itemAlias }),
				initialValue: this.ce(expr, { itemAlias }),
				inlined: false,
				isSvgAttr,
			});
		}

		// Classes
		if (el.classes && el.classes.kind === "class-list") {
			const parts = el.classes.items.map((item) => {
				if (typeof item === "string") return JSON.stringify(item);
				if ("kind" in item && item.kind === "dynamic") {
					const inner = this.ce(item.value, { itemAlias });
					return `((__c) => __c ? " " + __c : "")(${inner})`;
				}
				return `(${this.ce(item.condition, { itemAlias })} ? " ${item.name}" : "")`;
			});
			classBindings.push({
				target: elVar,
				expression: parts.join(" + "),
			});
		}

		// Reactive style-map properties
		if (el.styles && el.styles.kind === "style-map") {
			for (const prop of el.styles.properties) {
				if (prop.value.kind === "literal") continue;
				bindings.push({
					kind: "binding",
					cellName: "",
					refName: "",
					target: elVar,
					property: prop.property,
					expression: this.ce(prop.value, { itemAlias }),
					initialValue: this.ce(prop.value, { itemAlias }),
					inlined: false,
					isStyleProp: true,
				});
			}
		}

		// Children
		const hasCoalescedText = this.hasAdjacentTextAndReactive(el.children);
		if (hasCoalescedText) {
			const textVar = `${elVar}_text`;
			traversals.push({
				kind: "traversal",
				varName: textVar,
				path: `${elVar}.firstChild`,
			});
			const parts = [];
			for (const child of el.children) {
				if (child.kind === "text") {
					parts.push(JSON.stringify(child.value));
				} else if (child.kind === "reactive-text") {
					parts.push(this.ce(child.source, { itemAlias }));
				}
			}
			bindings.push({
				kind: "binding",
				cellName: "",
				refName: "",
				target: textVar,
				property: "nodeValue",
				expression: parts.join(" + "),
				initialValue: parts.join(" + "),
				inlined: false,
			});
			return;
		}

		// Walk children: traverse each element child + bind text children
		let prevSiblingVar = null;
		let domChildIdx = 0;
		for (const child of el.children) {
			if (child.kind === "element") {
				const childVar = this.nextElementVar(child.tag);
				let path;
				if (domChildIdx === 0) path = `${elVar}.firstChild`;
				else if (prevSiblingVar) path = `${prevSiblingVar}.nextSibling`;
				else path = `${elVar}.firstChild`;
				traversals.push({ kind: "traversal", varName: childVar, path });
				this.processBlockElement(
					child,
					childVar,
					itemAlias,
					traversals,
					events,
					bindings,
					classBindings,
					false,
				);
				prevSiblingVar = childVar;
				domChildIdx++;
			} else if (child.kind === "reactive-text") {
				const textVar = `${elVar}_text${domChildIdx === 0 ? "" : "_" + domChildIdx}`;
				let path;
				if (domChildIdx === 0) path = `${elVar}.firstChild`;
				else if (prevSiblingVar) path = `${prevSiblingVar}.nextSibling`;
				else path = `${elVar}.firstChild`;
				traversals.push({ kind: "traversal", varName: textVar, path });
				bindings.push({
					kind: "binding",
					cellName: "",
					refName: "",
					target: textVar,
					property: "nodeValue",
					expression: this.ce(child.source, { itemAlias }),
					initialValue: this.ce(child.source, { itemAlias }),
					inlined: false,
				});
				prevSiblingVar = textVar;
				domChildIdx++;
			} else if (child.kind === "text") {
				domChildIdx++;
				prevSiblingVar = null;
			}
		}
	}

	/**
	 * Find the binding cell for a run of text/reactive-text children.
	 * @param {NodeIR[]} children
	 * @param {number} start
	 * @param {number} end
	 * @returns {string | null}
	 */
	findRunBindingCell(children, start, end) {
		for (let i = start; i < end; i++) {
			const child = children[i];
			if (child.kind === "reactive-text") {
				const cell = this.findBindingCell(child.source);
				if (cell) return cell;
			}
		}
		return null;
	}

	/**
	 * Find the state/computed cell name that an expression depends on.
	 * Returns the first state/computed cell found, or null.
	 * @param {ExprIR} expr
	 * @returns {string | null}
	 */
	findBindingCell(expr) {
		switch (expr.kind) {
			case "state-read":
				return expr.name;
			case "computed-read":
				return expr.name;
			case "binary":
				return this.findBindingCell(expr.left) || this.findBindingCell(expr.right);
			case "unary":
				return this.findBindingCell(expr.operand);
			case "conditional":
				return this.findBindingCell(expr.test) || this.findBindingCell(expr.consequent);
			case "call":
				return this.findBindingCell(expr.callee) || (expr.args.length > 0 ? this.findBindingCell(expr.args[0]) : null);
			case "method-call":
				return this.findBindingCell(expr.object);
			case "member":
				return this.findBindingCell(expr.object);
			case "template-literal":
				for (const part of expr.parts) {
					if (typeof part !== "string") {
						const cell = this.findBindingCell(part);
						if (cell) return cell;
					}
				}
				return null;
			default:
				return null;
		}
	}

	/**
	 * @returns {ComponentLIR}
	 */
	build() {
		if (this.delegatedEvents.length > 0) {
			this.runtimeImports.add("delegate");
		}

		// Don't sort — maintain first-encountered order
		return {
			tagName: this.mir.tagName,
			name: this.mir.name,
			props: this.mir.props,
			attrs: this.mir.attrs,
			templates: this.templates,
			cells: this.cells,
			functions: this.functions,
			blockVars: this.blockVars,
			connected: {
				traversals: this.traversals,
				bindings: this.bindings,
				events: this.events,
				blocks: this.blocks,
				propSets: this.propSets,
			},
			delegatedEvents: this.delegatedEvents,
			imports: [...this.runtimeImports].sort(),
			userImports: [...this.userImportMap.values()],
			observedAttributes: this.observedAttributes,
			lifecycle: this.mir.lifecycle,
			locals: this.mir.locals || [],
			preamble: this.mir.preamble || [],
			moduleCode: this.mir.metadata?.moduleCode,
		};
	}
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @param {unknown} value
 * @returns {string}
 */
function serializeInitial(value) {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value);
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Collect all state names that an expression reads.
 * @param {ExprIR} expr
 * @param {Set<string>} deps
 * @param {Set<string>} stateNames
 * @param {Set<string>} computedNames
 */
function collectStateDeps(expr, deps, stateNames, computedNames) {
	if (!expr || typeof expr !== "object") return;
	switch (expr.kind) {
		case "state-read":
			if (stateNames.has(expr.name)) deps.add(expr.name);
			break;
		case "computed-read":
			if (computedNames.has(expr.name)) deps.add(expr.name);
			break;
		case "binary":
			collectStateDeps(expr.left, deps, stateNames, computedNames);
			collectStateDeps(expr.right, deps, stateNames, computedNames);
			break;
		case "unary":
			collectStateDeps(expr.operand, deps, stateNames, computedNames);
			break;
		case "call":
			collectStateDeps(expr.callee, deps, stateNames, computedNames);
			for (const arg of expr.args) collectStateDeps(arg, deps, stateNames, computedNames);
			break;
		case "method-call":
			collectStateDeps(expr.object, deps, stateNames, computedNames);
			for (const arg of expr.args) collectStateDeps(arg, deps, stateNames, computedNames);
			break;
		case "member":
			collectStateDeps(expr.object, deps, stateNames, computedNames);
			break;
		case "closure":
			collectStateDeps(expr.body, deps, stateNames, computedNames);
			break;
		case "conditional":
			collectStateDeps(expr.test, deps, stateNames, computedNames);
			collectStateDeps(expr.consequent, deps, stateNames, computedNames);
			collectStateDeps(expr.alternate, deps, stateNames, computedNames);
			break;
	}
}

/**
 * @param {ExprIR} expr
 * @returns {string[]}
 */
function collectStateWrites(expr) {
	/** @type {string[]} */
	const writes = [];
	if (!expr) return writes;
	if (expr.kind === "state-write") {
		writes.push(expr.name);
	} else if (expr.kind === "block") {
		for (const stmt of expr.body) {
			writes.push(...collectStateWrites(stmt));
		}
	} else if (expr.kind === "collection-op") {
		writes.push(expr.name);
	}
	return writes;
}

/**
 * @param {ExprIR} expr
 * @returns {import("./types.d.ts").EmitExpr[]}
 */
function collectEmits(expr) {
	/** @type {import("./types.d.ts").EmitExpr[]} */
	const emits = [];
	if (!expr) return emits;
	if (expr.kind === "emit") {
		emits.push(expr);
	} else if (expr.kind === "block") {
		for (const stmt of expr.body) {
			emits.push(...collectEmits(stmt));
		}
	}
	return emits;
}
