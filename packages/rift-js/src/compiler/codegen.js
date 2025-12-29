import MagicString from "magic-string";
import { CONSTANTS, traverse, escapeStringLiteral } from "./utils.js";
import { isJSXElement, isJSXFragment } from "./parser.js";
import { processBindings, findGetCalls } from "./transforms/bind-detector.js";
import { processEvents, generateEventAssignment } from "./transforms/events.js";
import { extractForInfo, getCallbackPreamble } from "./transforms/for-transform.js";
import {
	TemplateRegistry,
	VariableNameGenerator,
	extractTemplate,
} from "./transforms/jsx-to-template.js";
import { extractShowInfo } from "./transforms/show-transform.js";

/**
 * Code generator using magic-string for efficient string manipulation
 * and source map generation
 */

/**
 * Generate compiled output from analyzed JSX
 * @param {string} code - Original source code
 * @param {import("@babel/types").File} ast - Babel AST
 * @param {string} filename - Source filename
 * @returns {{ code: string, map: object }}
 */
export function generateOutput(code, ast, filename) {
	const s = new MagicString(code);
	const templateRegistry = new TemplateRegistry();
	const nameGen = new VariableNameGenerator();
	const allEventTypes = new Set();

	// Track what framework imports are needed
	const usedImports = new Set(["defineComponent"]);

	// Find all Rift-defined component tag names (from defineComponent calls)
	const riftComponentTags = findRiftComponentTags(ast);

	// Find all component functions with JSX returns
	const componentInfos = [];

	traverse(ast, {
		FunctionDeclaration(path) {
			const jsxReturn = findJSXReturn(path.node.body);
			if (jsxReturn) {
				componentInfos.push({
					type: "declaration",
					node: path.node,
					name: path.node.id.name,
					jsxReturn,
					bodyStart: path.node.body.start,
					bodyEnd: path.node.body.end,
					params: path.node.params,
				});
			}
		},
		FunctionExpression(path) {
			const jsxReturn = findJSXReturn(path.node.body);
			if (jsxReturn) {
				componentInfos.push({
					type: "expression",
					node: path.node,
					jsxReturn,
					bodyStart: path.node.body.start,
					bodyEnd: path.node.body.end,
					params: path.node.params,
				});
			}
		},
		noScope: true,
	});

	if (componentInfos.length === 0) {
		// No JSX found, return as-is
		return {
			code: s.toString(),
			map: s.generateMap({ source: filename, includeContent: true }),
		};
	}

	// Transform all components (process in reverse order to preserve positions)
	for (const componentInfo of componentInfos.slice().reverse()) {
		transformComponent(
			code,
			s,
			ast,
			componentInfo,
			templateRegistry,
			nameGen,
			usedImports,
			allEventTypes,
			riftComponentTags,
		);
	}

	// Collect all needed imports BEFORE calling updateImports
	// Add delegate if we have events
	if (allEventTypes.size > 0) {
		usedImports.add("delegate");
	}

	// Add template if we have templates
	const templateDecls = templateRegistry.getDeclarations();
	if (templateDecls.length > 0) {
		usedImports.add("template");
		// Also add svg_template if any SVG templates are used
		if (templateRegistry.hasSvgTemplates()) {
			usedImports.add("svg_template");
		}
	}

	// NOW update imports with the complete set
	updateImports(s, ast, usedImports);

	// Add delegate call at the end if we have events
	if (allEventTypes.size > 0) {
		const eventTypesArray = Array.from(allEventTypes)
			.map((e) => `"${e}"`)
			.join(", ");
		s.append(`\n\ndelegate([${eventTypesArray}]);`);
	}

	// Prepend template declarations after imports
	if (templateDecls.length > 0) {
		const importEndPos = findImportEndPosition(ast);
		s.appendLeft(importEndPos, "\n\n" + templateDecls.join("\n"));
	}

	return {
		code: s.toString(),
		map: s.generateMap({
			source: filename,
			file: filename + ".map",
			includeContent: true,
		}),
	};
}

/**
 * Check if a node is JSX (element or fragment)
 */
function isJSX(node) {
	return isJSXElement(node) || isJSXFragment(node);
}

/**
 * Find the JSX return statement in a function body
 */
function findJSXReturn(body) {
	if (body.type !== "BlockStatement") return null;

	for (const stmt of body.body) {
		if (stmt.type === "ReturnStatement" && stmt.argument) {
			if (isJSX(stmt.argument)) {
				return stmt;
			}
			// Handle parenthesized: return (<div>...</div>)
			if (stmt.argument.type === "ParenthesizedExpression") {
				if (isJSX(stmt.argument.expression)) {
					return stmt;
				}
			}
		}
	}

	return null;
}

/**
 * Find all Rift-defined component tag names from defineComponent calls
 * @param {import("@babel/types").File} ast - Babel AST
 * @returns {Set<string>} Set of tag names defined via defineComponent
 */
function findRiftComponentTags(ast) {
	const tags = new Set();

	traverse(ast, {
		CallExpression(path) {
			const node = path.node;
			// Check if this is a defineComponent call
			if (
				node.callee &&
				node.callee.type === "Identifier" &&
				node.callee.name === "defineComponent" &&
				node.arguments.length >= 1
			) {
				const firstArg = node.arguments[0];
				// Extract the tag name from the first argument (should be a string literal)
				if (firstArg.type === "StringLiteral") {
					tags.add(firstArg.value);
				}
			}
		},
		noScope: true,
	});

	return tags;
}

/**
 * Transform a component function
 */
function transformComponent(
	code,
	s,
	ast,
	componentInfo,
	templateRegistry,
	nameGen,
	usedImports,
	allEventTypes,
	riftComponentTags,
) {
	const { jsxReturn, bodyStart, bodyEnd, name } = componentInfo;

	// Get the JSX element or fragment
	let jsxNode = isJSX(jsxReturn.argument) ? jsxReturn.argument : jsxReturn.argument.expression;

	// Extract template info (isComponentRoot = true for main component)
	// Pass the fragment flag so extractTemplate can handle it properly
	const isFragment = isJSXFragment(jsxNode);
	const templateResult = extractTemplate(
		jsxNode,
		templateRegistry,
		nameGen,
		true,
		isFragment,
		riftComponentTags,
	);
	const { templateVar, rootVar, traversal, bindings, events, forBlocks, showBlocks } =
		templateResult;

	// Process bindings for bind() calls
	const processedBindings = processBindings(bindings, code);
	for (const b of processedBindings) {
		if (!b.isStatic) {
			usedImports.add("bind");
			usedImports.add("get");
		}
	}

	// Process events
	const processedEvents = processEvents(events);
	for (const e of processedEvents) {
		allEventTypes.add(e.eventName);
	}

	// Extract for_block cell names for variable hoisting
	const forBlockVars = extractForBlockVars(code, forBlocks);

	// Build the connected callback body
	const connectedBody = buildConnectedBody(
		code,
		templateVar,
		rootVar,
		traversal,
		processedBindings,
		processedEvents,
		forBlocks,
		showBlocks,
		nameGen,
		templateRegistry,
		usedImports,
		allEventTypes,
		forBlockVars,
	);

	// Replace the return statement with this.connected()
	const returnStart = jsxReturn.start;
	const returnEnd = jsxReturn.end;

	// Generate variable declarations for for_block captures (hoisted before connected)
	const forBlockDecls = forBlockVars.map((fb) => `let ${fb.varName};`).join("\n  ");
	const forBlockDeclsCode = forBlockDecls ? `${forBlockDecls}\n  ` : "";

	const connectedCode = `${forBlockDeclsCode}this.connected(() => {
${connectedBody}
  });`;

	// Ensure the generated this.connected (which appends the root template)
	// is the first this.connected() call inside the component body. If the
	// original source already contained one or more this.connected() calls
	// earlier in the function, move those after our generated connected.
	const existingConnected = [];

	traverse(ast, {
		CallExpression(path) {
			const node = path.node;
			if (
				node.callee &&
				node.callee.type === "MemberExpression" &&
				node.callee.object &&
				node.callee.object.type === "ThisExpression" &&
				node.callee.property &&
				node.callee.property.type === "Identifier" &&
				node.callee.property.name === "connected" &&
				node.start >= bodyStart &&
				node.end <= bodyEnd
			) {
				existingConnected.push({ start: node.start, end: node.end });
			}
		},
		noScope: true,
	});

	existingConnected.sort((a, b) => a.start - b.start);

	const leadingConnected = existingConnected.filter((c) => c.start < returnStart);

	if (leadingConnected.length > 0) {
		const snippets = leadingConnected.map((c) => code.slice(c.start, c.end));

		for (let i = leadingConnected.length - 1; i >= 0; i--) {
			const c = leadingConnected[i];
			s.remove(c.start, c.end);
		}

		s.overwrite(returnStart, returnEnd, "");

		const insertPos = leadingConnected[0].start;
		const combined = `${connectedCode}\n\n${snippets.join("\n\n")}`;
		s.appendLeft(insertPos, combined);
	} else {
		s.overwrite(returnStart, returnEnd, connectedCode);
	}

	return { componentName: name };
}

/**
 * Extract for_block cell names and generate variable names for capturing returns
 * @param {string} code - Original source code
 * @param {Array} forBlocks - For blocks from template extraction
 * @returns {Array<{cellName: string, varName: string, cellCode: string}>}
 */
function extractForBlockVars(code, forBlocks) {
	const result = [];
	for (const forBlock of forBlocks) {
		const forInfo = extractForInfo(forBlock.node, forBlock.containerVarName);
		const cellCode = code.slice(forInfo.itemsExpression.start, forInfo.itemsExpression.end);
		// Use simple identifier if possible, otherwise generate a name
		const cellName =
			forInfo.itemsExpression.type === "Identifier"
				? forInfo.itemsExpression.name
				: `for_block_${result.length + 1}`;
		result.push({
			cellName,
			varName: `${cellName}_for_block`,
			cellCode,
		});
	}
	return result;
}

/**
 * Collect all variable names that are actually used by bindings, events, for blocks, or show blocks
 */
function collectUsedVars(bindings, events, forBlocks, showBlocks = []) {
	const used = new Set();

	for (const b of bindings) {
		used.add(b.targetVar);
		// If this binding uses a marker, also track the marker variable
		if (b.usesMarker) {
			used.add(`${b.targetVar}_marker`);
		}
	}

	for (const e of events) {
		used.add(e.varName);
	}

	for (const f of forBlocks) {
		used.add(f.containerVarName);
	}

	for (const s of showBlocks) {
		used.add(s.containerVarName);
	}

	return used;
}

/**
 * Filter traversal steps to only include those that are needed
 * A step is needed if:
 * 1. Its variable is directly used by a binding/event/forBlock
 * 2. Its variable is referenced by another needed step's traversal code
 * @param {Array} traversal - Traversal steps
 * @param {Set} usedVars - Variables that are directly used
 * @param {Set} alreadyDeclared - Variables that have already been declared (to avoid duplicates)
 */
function filterTraversalSteps(traversal, usedVars, alreadyDeclared = new Set()) {
	// Start with directly used vars
	const needed = new Set(usedVars);

	// Build a map of varName -> step for quick lookup
	const stepMap = new Map();
	for (const step of traversal) {
		stepMap.set(step.varName, step);
	}

	// Iteratively expand needed set based on dependencies
	// A step depends on another if its code references that var
	let changed = true;
	while (changed) {
		changed = false;
		for (const step of traversal) {
			if (needed.has(step.varName)) {
				// Check what this step depends on
				// e.g., "div_2.firstChild" depends on "div_2"
				for (const [varName] of stepMap) {
					if (step.code.startsWith(varName + ".") && !needed.has(varName)) {
						needed.add(varName);
						changed = true;
					}
				}
			}
		}
	}

	// Filter traversal to only needed steps, excluding already declared vars
	return traversal.filter((step) => needed.has(step.varName) && !alreadyDeclared.has(step.varName));
}

/**
 * Build the body of the connected() callback
 */
function buildConnectedBody(
	code,
	templateVar,
	rootVar,
	traversal,
	bindings,
	events,
	forBlocks,
	showBlocks,
	nameGen,
	templateRegistry,
	usedImports,
	allEventTypes,
	forBlockVars = [],
) {
	const lines = [];

	// Separate prop bindings (need to be set before appendChild)
	const propBindings = bindings.filter((b) => b.type === "prop");
	const otherBindings = bindings.filter((b) => b.type !== "prop");

	// Template instantiation
	lines.push(`    const ${rootVar} = ${templateVar}();`);

	// If we have prop bindings, we need to set them BEFORE appendChild
	// This requires getting element references from the template fragment
	if (propBindings.length > 0) {
		// Collect used vars for props
		const propUsedVars = new Set(propBindings.map((b) => b.targetVar));
		// Generate traversal that works on the template fragment (before appendChild)
		const propTraversal = filterTraversalSteps(traversal, propUsedVars);

		// Generate traversal code using rootVar instead of this.firstChild
		for (const step of propTraversal) {
			// Replace 'this.firstChild' with rootVar.firstChild for props
			const propCode = step.code.replace("this.firstChild", `${rootVar}.firstChild`);
			lines.push(`    const ${step.varName} = ${propCode};`);
		}

		lines.push("");

		// Set props before appendChild (using WeakMap-based setProp)
		for (const binding of propBindings) {
			const bindCode = generateBinding(code, binding, usedImports, null, false, null);
			lines.push(`    ${bindCode}`);
		}

		lines.push("");
	}

	lines.push(`    this.appendChild(${rootVar});`);
	lines.push("");

	// Track which vars have already been declared (from prop bindings)
	const alreadyDeclared = new Set();
	if (propBindings.length > 0) {
		// Collect all vars that were declared for prop bindings
		const propUsedVars = new Set(propBindings.map((b) => b.targetVar));
		const propTraversalVars = filterTraversalSteps(traversal, propUsedVars);
		for (const step of propTraversalVars) {
			alreadyDeclared.add(step.varName);
		}
	}

	// Filter traversal to only include steps that are actually needed (excluding prop vars already declared)
	const usedVars = collectUsedVars(otherBindings, events, forBlocks, showBlocks);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars, alreadyDeclared);

	// DOM traversal - text nodes are now regular nodes (space placeholders), not markers
	for (const step of filteredTraversal) {
		lines.push(`    const ${step.varName} = ${step.code};`);
	}

	if (filteredTraversal.length > 0) {
		lines.push("");
	}

	// Event handler assignments
	for (const event of events) {
		const assignment = generateEventAssignment(event, (node) => generateExpr(code, node));
		lines.push(`    ${assignment}`);
	}

	if (events.length > 0) {
		lines.push("");
	}

	// Process for blocks
	for (let i = 0; i < forBlocks.length; i++) {
		const forBlock = forBlocks[i];
		const forBlockVar = forBlockVars[i];
		usedImports.add("for_block");
		const forCode = generateForBlock(
			code,
			forBlock,
			nameGen,
			templateRegistry,
			usedImports,
			allEventTypes,
			forBlockVar,
		);
		lines.push(forCode);
		lines.push("");
	}

	// Process show blocks
	for (const showBlock of showBlocks) {
		usedImports.add("show_block");
		const showCode = generateShowBlock(
			code,
			showBlock,
			nameGen,
			templateRegistry,
			usedImports,
			allEventTypes,
		);
		lines.push(showCode);
		lines.push("");
	}

	// Track ref counts per cell for numbered refs (ref_1, ref_2, etc.)
	const cellRefCounts = new Map();

	// Other bindings (non-prop)
	for (const binding of otherBindings) {
		const bindCode = generateBinding(code, binding, usedImports, null, false, cellRefCounts);
		lines.push(`    ${bindCode}`);
	}

	return lines.join("\n");
}

/**
 * Generate code for a for_block
 */
function generateForBlock(
	code,
	forBlock,
	nameGen,
	templateRegistry,
	usedImports,
	allEventTypes,
	forBlockVar = null,
) {
	const { containerVarName, node } = forBlock;

	// Extract <For> component info
	const forInfo = extractForInfo(node, containerVarName);
	const { itemsExpression, itemParam, indexParam, bodyJSX, originalCallback } = forInfo;

	// Get preamble code from original callback (variable declarations, etc.)
	const preamble = getCallbackPreamble(originalCallback);
	const preambleCode = preamble
		.map((stmt) => "      " + code.slice(stmt.start, stmt.end))
		.join("\n");

	// Extract template for the loop body (including nested forBlocks and showBlocks)
	const innerTemplate = extractTemplate(bodyJSX, templateRegistry, nameGen);
	const {
		templateVar,
		rootVar,
		traversal,
		bindings,
		events,
		forBlocks: innerForBlocks,
		showBlocks: innerShowBlocks,
	} = innerTemplate;

	// Process inner bindings (these need to reference the item parameter)
	const processedBindings = processBindings(bindings, code);
	for (const b of processedBindings) {
		if (!b.isStatic) {
			usedImports.add("bind");
			usedImports.add("get");
		}
	}

	// Process inner events (may reference item)
	const processedEvents = processEvents(events, itemParam);
	for (const e of processedEvents) {
		allEventTypes.add(e.eventName);
	}

	// Build the for_block callback body
	const indexParamName = indexParam || "index";
	const lines = [];

	// Capture the for_block return value if we have a variable for it
	const forBlockAssignment = forBlockVar ? `${forBlockVar.varName} = ` : "";

	lines.push(
		`    ${forBlockAssignment}for_block(${containerVarName}, ${generateExpr(
			code,
			itemsExpression,
		)}, (anchor, ${itemParam}, ${indexParamName}) => {`,
	);
	lines.push(`      const ${rootVar} = ${templateVar}();`);
	lines.push("");

	// Filter traversal to only include steps that are actually needed
	const usedVars = collectUsedVars(
		processedBindings,
		processedEvents,
		innerForBlocks || [],
		innerShowBlocks || [],
	);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars);

	// Traversal - text nodes are now regular nodes (space placeholders), not markers
	for (const step of filteredTraversal) {
		lines.push(`      const ${step.varName} = ${step.code};`);
	}

	// Get the first element for start/end tracking
	const firstElementVar = filteredTraversal.length > 0 ? filteredTraversal[0].varName : rootVar;

	if (filteredTraversal.length > 0) {
		lines.push("");
	}

	// Events inside for block
	for (const event of processedEvents) {
		const assignment = generateEventAssignment(event, (node) => generateExpr(code, node));
		lines.push(`      ${assignment}`);
	}

	if (processedEvents.length > 0) {
		lines.push("");
	}

	// Process nested for blocks inside for block
	if (innerForBlocks && innerForBlocks.length > 0) {
		for (const nestedForBlock of innerForBlocks) {
			usedImports.add("for_block");
			const nestedForCode = generateForBlock(
				code,
				nestedForBlock,
				nameGen,
				templateRegistry,
				usedImports,
				allEventTypes,
				null, // no variable capture needed inside nested for_block
			);
			// Indent the for_block code by 2 extra spaces (it's inside another for_block callback)
			lines.push(nestedForCode.replace(/^    /gm, "      "));
			lines.push("");
		}
	}

	// Process nested show blocks inside for block
	if (innerShowBlocks && innerShowBlocks.length > 0) {
		for (const nestedShowBlock of innerShowBlocks) {
			usedImports.add("show_block");
			const showCode = generateShowBlock(
				code,
				nestedShowBlock,
				nameGen,
				templateRegistry,
				usedImports,
				allEventTypes,
			);
			// Indent the show_block code by 2 extra spaces (it's inside for_block callback)
			lines.push(showCode.replace(/^    /gm, "      "));
			lines.push("");
		}
	}

	// Preamble (local variables from original callback)
	if (preambleCode) {
		lines.push(preambleCode);
		lines.push("");
	}

	// Track ref counts per cell for numbered refs (ref_1, ref_2, etc.)
	const cellRefCounts = new Map();

	// Bindings inside for block
	for (const binding of processedBindings) {
		const bindCode = generateBinding(code, binding, usedImports, itemParam, true, cellRefCounts);
		lines.push(`      ${bindCode}`);
	}

	// Insert before anchor and return range
	lines.push("");
	lines.push(`      anchor.before(${firstElementVar});`);
	lines.push(`      return { start: ${firstElementVar}, end: ${firstElementVar} };`);
	lines.push(`    });`);

	return lines.join("\n");
}

/**
 * Generate code for a show_block
 */
function generateShowBlock(code, showBlock, nameGen, templateRegistry, usedImports, allEventTypes) {
	const { containerVarName, node } = showBlock;

	// Extract <Show> component info
	const showInfo = extractShowInfo(node, containerVarName);
	const { conditionExpression, bodyJSX } = showInfo;

	// Detect get() calls in the condition to determine if it's simple or complex
	const getCalls = findGetCalls(conditionExpression);
	const isSimpleCell = getCalls.length === 1 && getCalls[0].isOnlyExpression;

	// Extract template for the show body (including nested forBlocks and showBlocks)
	const innerTemplate = extractTemplate(bodyJSX, templateRegistry, nameGen);
	const {
		templateVar,
		rootVar,
		traversal,
		bindings,
		events,
		forBlocks: innerForBlocks,
		showBlocks: innerShowBlocks,
	} = innerTemplate;

	// Process inner bindings
	const processedBindings = processBindings(bindings, code);
	for (const b of processedBindings) {
		if (!b.isStatic) {
			usedImports.add("bind");
			usedImports.add("get");
		}
	}

	// Process inner events
	const processedEvents = processEvents(events);
	for (const e of processedEvents) {
		allEventTypes.add(e.eventName);
	}

	// Build the show_block callback body
	const lines = [];

	// Generate the condition and dependencies based on complexity
	let conditionCode;
	let depsCode = "";

	if (isSimpleCell) {
		// Simple case: just pass the cell directly
		conditionCode = generateExpr(code, getCalls[0].cellArg);
	} else if (getCalls.length > 0) {
		// Complex expression with get() calls - pass a getter function and deps array
		conditionCode = `() => ${generateExpr(code, conditionExpression)}`;
		const deps = getCalls.map((gc) => generateExpr(code, gc.cellArg));
		depsCode = `, [${deps.join(", ")}]`;
		usedImports.add("get");
	} else {
		// Static expression (no get() calls) - pass the value directly
		conditionCode = generateExpr(code, conditionExpression);
	}

	lines.push(`    show_block(${containerVarName}, ${conditionCode}, (anchor) => {`);
	lines.push(`      const ${rootVar} = ${templateVar}();`);

	// Filter traversal to only include steps that are actually needed
	const usedVars = collectUsedVars(
		processedBindings,
		processedEvents,
		innerForBlocks || [],
		innerShowBlocks || [],
	);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars);

	// For start/end tracking, we need the actual first DOM element, not the fragment
	// If there's no traversal, we need to grab firstChild before inserting
	let firstElementVar;
	if (filteredTraversal.length > 0) {
		firstElementVar = filteredTraversal[0].varName;
	} else {
		// No traversal - get firstChild from the fragment before it's emptied by insertion
		firstElementVar = `${rootVar}_first`;
		lines.push(`      const ${firstElementVar} = ${rootVar}.firstChild;`);
	}
	lines.push("");

	// Traversal
	for (const step of filteredTraversal) {
		lines.push(`      const ${step.varName} = ${step.code};`);
	}

	if (filteredTraversal.length > 0) {
		lines.push("");
	}

	// Events inside show block
	for (const event of processedEvents) {
		const assignment = generateEventAssignment(event, (node) => generateExpr(code, node));
		lines.push(`      ${assignment}`);
	}

	if (processedEvents.length > 0) {
		lines.push("");
	}

	// Process nested for blocks inside show block
	if (innerForBlocks && innerForBlocks.length > 0) {
		for (const forBlock of innerForBlocks) {
			usedImports.add("for_block");
			const forCode = generateForBlock(
				code,
				forBlock,
				nameGen,
				templateRegistry,
				usedImports,
				allEventTypes,
				null, // no variable capture needed inside show_block
			);
			// Indent the for_block code by 2 extra spaces (it's inside show_block callback)
			lines.push(forCode.replace(/^    /gm, "      "));
			lines.push("");
		}
	}

	// Process nested show blocks inside show block
	if (innerShowBlocks && innerShowBlocks.length > 0) {
		for (const nestedShowBlock of innerShowBlocks) {
			usedImports.add("show_block");
			const showCode = generateShowBlock(
				code,
				nestedShowBlock,
				nameGen,
				templateRegistry,
				usedImports,
				allEventTypes,
			);
			// Indent the show_block code by 2 extra spaces (it's inside show_block callback)
			lines.push(showCode.replace(/^    /gm, "      "));
			lines.push("");
		}
	}

	// Track ref counts per cell for numbered refs (ref_1, ref_2, etc.)
	const cellRefCounts = new Map();

	// Bindings inside show block
	for (const binding of processedBindings) {
		const bindCode = generateBinding(code, binding, usedImports, null, true, cellRefCounts);
		lines.push(`      ${bindCode}`);
	}

	// Insert before anchor and return range
	lines.push("");
	lines.push(`      anchor.before(${firstElementVar});`);
	lines.push(`      return { start: ${firstElementVar}, end: ${firstElementVar} };`);
	lines.push(`    }${depsCode});`);

	return lines.join("\n");
}

/**
 * Check if a binding is a simple direct mapping (v maps directly to property)
 * Simple: get(cell) with no transform -> element.property = v
 * Not simple: get(cell) ? 'a' : 'b' -> requires transform
 */
function isSimpleDirectBinding(binding) {
	const { needsTransform, staticPrefix, fullExpression, getCallNode } = binding;

	// If there's a static prefix, it's not simple
	if (staticPrefix) return false;

	// If no transform needed, the entire expression is get(cell)
	if (!needsTransform) return true;

	// If transform is needed, check if it's just get(cell) with no surrounding expression
	// The fullExpression should be the same as the getCallNode
	if (
		getCallNode &&
		fullExpression.start === getCallNode.start &&
		fullExpression.end === getCallNode.end
	) {
		return true;
	}

	return false;
}

/**
 * Generate code for a binding
 * @param {string} code - Original source code
 * @param {object} binding - Binding info
 * @param {Set} usedImports - Set of imports to track
 * @param {string} itemParam - Item parameter name (for for_block context)
 * @param {boolean} insideForBlock - Whether we're inside a for_block callback
 * @param {Map} cellRefCounts - Map to track ref counts per cell (for numbered refs)
 */
function generateBinding(
	code,
	binding,
	usedImports,
	itemParam = null,
	insideForBlock = false,
	cellRefCounts = null,
) {
	// Handle prop bindings (for custom elements)
	if (binding.type === "prop") {
		return generatePropBinding(code, binding, usedImports, insideForBlock);
	}

	const {
		targetVar,
		targetProperty,
		cellArg,
		fullExpression,
		isStatic,
		needsTransform,
		getCallNode,
		staticPrefix,
		contentParts,
		isSvg,
	} = binding;

	// Handle new contentParts format (concatenated text content)
	if (contentParts) {
		return generateContentPartsBinding(code, binding, usedImports, insideForBlock, cellRefCounts);
	}

	// Build prefix string if we have static text before the dynamic expression
	const prefixCode = staticPrefix ? `"${escapeStringLiteral(staticPrefix)}" + ` : "";

	// For SVG elements, use setAttribute instead of property assignment
	// (except for className which works as a property)
	const useSvgSetAttribute =
		isSvg && targetProperty !== "className" && targetProperty !== "nodeValue";

	if (isStatic) {
		// Static assignment
		const exprCode = generateExpr(code, fullExpression);
		if (useSvgSetAttribute) {
			return `${targetVar}.setAttribute("${targetProperty}", ${prefixCode}${exprCode});`;
		}
		return `${targetVar}.${targetProperty} = ${prefixCode}${exprCode};`;
	}

	// Generate the cell argument code
	const cellCode = generateExpr(code, cellArg);

	// Generate the expression code for initial value (using original get() calls)
	const initialExprCode = generateExpr(code, fullExpression);

	// Check if this is a simple direct binding (works for both for_block and component level)
	// If so, we can use ref-based direct DOM updates instead of bind()
	// Note: For SVG we skip ref optimization since setAttribute needs different handling
	if (isSimpleDirectBinding(binding) && cellRefCounts && !useSvgSetAttribute) {
		// Get or initialize the ref count for this cell
		const currentCount = cellRefCounts.get(cellCode) || 0;
		const refNum = currentCount + 1;
		cellRefCounts.set(cellCode, refNum);

		// Determine indentation based on context
		const indent = insideForBlock ? "      " : "    ";

		// Emit: initial value assignment + ref storage on cell
		// cell.ref_N = element;
		return `${targetVar}.${targetProperty} = ${initialExprCode};
${indent}${cellCode}.${CONSTANTS.REF_PREFIX}${refNum} = ${targetVar};`;
	}

	// Fall back to bind() for complex bindings (or SVG attributes)
	usedImports.add("bind");
	usedImports.add("get");

	// Generate the expression code for bind callback, replacing get(cell) with v
	let bindExprCode;
	if (needsTransform && getCallNode) {
		// Replace the specific get() call with 'v'
		bindExprCode = generateExprWithReplacement(code, fullExpression, getCallNode, "v");
	} else {
		// Simple case: entire expression is get(cell), so just use v
		bindExprCode = "v";
	}

	// Set initial value AND bind for updates
	if (useSvgSetAttribute) {
		return `${targetVar}.setAttribute("${targetProperty}", ${prefixCode}${initialExprCode});
    bind(${cellCode}, (v) => {
      ${targetVar}.setAttribute("${targetProperty}", ${prefixCode}${bindExprCode});
    });`;
	}

	return `${targetVar}.${targetProperty} = ${prefixCode}${initialExprCode};
    bind(${cellCode}, (v) => {
      ${targetVar}.${targetProperty} = ${prefixCode}${bindExprCode};
    });`;
}

/**
 * Generate binding code for contentParts format (concatenated text)
 */
function generateContentPartsBinding(
	code,
	binding,
	usedImports,
	insideForBlock = false,
	cellRefCounts = null,
) {
	const { targetVar, targetProperty, cellArg, contentParts, isStatic } = binding;

	// Build the concatenated expression from content parts
	const buildConcatExpr = (useOriginalCode = true) => {
		const parts = [];
		for (const part of contentParts) {
			if (part.type === "static") {
				// Keep whitespace as-is to preserve spacing between static/dynamic parts
				const text = part.value;
				// Only skip if completely empty
				if (text) {
					parts.push(`"${escapeStringLiteral(text)}"`);
				}
			} else if (part.type === "dynamic") {
				const exprCode = generateExpr(code, part.expression);
				// Wrap in parentheses if the expression contains binary operators that could
				// cause precedence issues when concatenated with strings (e.g., "a + b = " + (get(a) + get(b)))
				// We check for common arithmetic operators: +, -, *, /, %
				const needsParens =
					/[+\-*/%]/.test(exprCode) && !/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(exprCode);
				if (useOriginalCode) {
					parts.push(needsParens ? `(${exprCode})` : exprCode);
				} else {
					// For bind callback, we keep the original expression
					// (the bind will just re-evaluate the whole thing)
					parts.push(needsParens ? `(${exprCode})` : exprCode);
				}
			}
		}
		return parts.join(" + ");
	};

	const initialExpr = buildConcatExpr(true);

	if (isStatic) {
		return `${targetVar}.${targetProperty} = ${initialExpr};`;
	}

	// For reactive bindings, use ref-based updates
	const cellCode = generateExpr(code, cellArg);

	if (cellRefCounts) {
		// Get or initialize the ref count for this cell
		const currentCount = cellRefCounts.get(cellCode) || 0;
		const refNum = currentCount + 1;
		cellRefCounts.set(cellCode, refNum);

		// Determine indentation based on context
		const indent = insideForBlock ? "      " : "    ";

		// Store ref on cell for direct DOM updates
		// The setter will recompute the full expression using the ref
		return `${targetVar}.${targetProperty} = ${initialExpr};
${indent}${cellCode}.${CONSTANTS.REF_PREFIX}${refNum} = ${targetVar};`;
	}

	// Fallback if no cellRefCounts provided (shouldn't happen in practice)
	usedImports.add("bind");
	usedImports.add("get");

	const indent = insideForBlock ? "      " : "    ";

	// Set initial value AND bind for updates
	return `${targetVar}.${targetProperty} = ${initialExpr};
${indent}bind(${cellCode}, (v) => {
${indent}  ${targetVar}.${targetProperty} = ${initialExpr};
${indent}});`;
}

/**
 * Generate code for a prop binding (for custom elements)
 */
function generatePropBinding(code, binding, usedImports) {
	const {
		targetVar,
		propName,
		expression,
		fullExpression,
		isStatic,
		isThirdParty,
	} = binding;

	// For third-party web components, set property directly on the element
	// For Rift components, use setProp() with WeakMap for pre-upgrade storage
	if (isThirdParty) {
		// Handle string literal props
		if (expression && expression.type === "StringLiteral") {
			return `${targetVar}.${propName} = "${escapeStringLiteral(expression.value)}";`;
		}
		const expr = fullExpression || expression;
		const exprCode = generateExpr(code, expr);
		return `${targetVar}.${propName} = ${exprCode};`;
	}

	// Mark that we need setProp import
	usedImports.add("setProp");

	// Handle string literal props
	if (expression && expression.type === "StringLiteral") {
		return `setProp(${targetVar}, "${propName}", "${escapeStringLiteral(expression.value)}");`;
	}

	// Get the expression to use
	const expr = fullExpression || expression;

	if (isStatic) {
		// Static expression (no get() calls)
		const exprCode = generateExpr(code, expr);
		return `setProp(${targetVar}, "${propName}", ${exprCode});`;
	}

	// Reactive prop - set initial value
	// Note: Props are passed at connection time, so we just need the initial value
	const exprCode = generateExpr(code, expr);
	return `setProp(${targetVar}, "${propName}", ${exprCode});`;
}

/**
 * Generate expression code from AST node using original source
 */
function generateExpr(code, node) {
	if (!node) return "undefined";
	return code.slice(node.start, node.end);
}

/**
 * Generate expression code with a specific node replaced
 */
function generateExprWithReplacement(code, expr, nodeToReplace, replacement) {
	// Get the full expression code
	const fullCode = code.slice(expr.start, expr.end);

	// Calculate relative positions
	const replaceStart = nodeToReplace.start - expr.start;
	const replaceEnd = nodeToReplace.end - expr.start;

	// Replace
	return fullCode.slice(0, replaceStart) + replacement + fullCode.slice(replaceEnd);
}

/**
 * Update the imports at the top of the file
 */
function updateImports(s, ast, usedImports) {
	// Find existing import from rift-js
	let riftImport = null;

	traverse(ast, {
		ImportDeclaration(path) {
			const source = path.node.source.value;
			if (source === "rift-js") {
				riftImport = path.node;
				path.stop();
			}
		},
		noScope: true,
	});

	// Preserve existing imports from the original import statement
	if (riftImport) {
		for (const specifier of riftImport.specifiers) {
			if (specifier.type === "ImportSpecifier") {
				const importedName = specifier.imported.name;
				usedImports.add(importedName);
			}
		}
	}

	// Build the new import statement
	const imports = Array.from(usedImports).sort();
	const newImport = `import { ${imports.join(", ")} } from "rift-js";`;

	if (riftImport) {
		// Replace existing import
		s.overwrite(riftImport.start, riftImport.end, newImport);
	} else {
		// No existing import found, prepend import from rift-js
		s.prepend(`${newImport}\n\n`);
	}
}

/**
 * Find the position after all imports
 */
function findImportEndPosition(ast) {
	let lastImportEnd = 0;

	traverse(ast, {
		ImportDeclaration(path) {
			if (path.node.end > lastImportEnd) {
				lastImportEnd = path.node.end;
			}
		},
		noScope: true,
	});

	return lastImportEnd;
}
