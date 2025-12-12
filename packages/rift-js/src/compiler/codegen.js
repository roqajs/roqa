import MagicString from 'magic-string';
import _generate from '@babel/generator';
import _traverse from '@babel/traverse';

// Handle CJS/ESM interop
const traverse = _traverse.default || _traverse;
import {
	TemplateRegistry,
	VariableNameGenerator,
	extractTemplate,
} from './transforms/jsx-to-template.js';
import { extractForInfo, getCallbackPreamble } from './transforms/for-transform.js';
import { processBindings } from './transforms/bind-detector.js';
import { processEvents, generateEventAssignment } from './transforms/events.js';
import {
	isJSXElement,
	isJSXFragment
} from './parser.js';

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
	const usedImports = new Set(['defineComponent']);

	// Find the component function and its JSX return
	let componentInfo = null;

	traverse(ast, {
		FunctionDeclaration(path) {
			const jsxReturn = findJSXReturn(path.node.body);
			if (jsxReturn) {
				componentInfo = {
					type: 'declaration',
					node: path.node,
					name: path.node.id.name,
					jsxReturn,
					bodyStart: path.node.body.start,
					bodyEnd: path.node.body.end,
				};
				path.stop();
			}
		},
		FunctionExpression(path) {
			if (componentInfo) return;
			const jsxReturn = findJSXReturn(path.node.body);
			if (jsxReturn) {
				componentInfo = {
					type: 'expression',
					node: path.node,
					jsxReturn,
					bodyStart: path.node.body.start,
					bodyEnd: path.node.body.end,
				};
			}
		},
		noScope: true,
	});

	if (!componentInfo) {
		// No JSX found, return as-is
		return {
			code: s.toString(),
			map: s.generateMap({ source: filename, includeContent: true }),
		};
	}

	// Generate the transformed code
	const result = transformComponent(
		code,
		s,
		ast,
		componentInfo,
		templateRegistry,
		nameGen,
		usedImports,
		allEventTypes
	);

	// Collect all needed imports BEFORE calling updateImports
	// Add delegate if we have events
	if (allEventTypes.size > 0) {
		usedImports.add('delegate');
	}

	// Add template if we have templates
	const templateDecls = templateRegistry.getDeclarations();
	if (templateDecls.length > 0) {
		usedImports.add('template');
	}

	// NOW update imports with the complete set
	updateImports(s, ast, usedImports);

	// Add delegate call at the end if we have events
	if (allEventTypes.size > 0) {
		const eventTypesArray = Array.from(allEventTypes)
			.map((e) => `"${e}"`)
			.join(', ');
		s.append(`\n\ndelegate([${eventTypesArray}]);`);
	}

	// Prepend template declarations after imports
	if (templateDecls.length > 0) {
		const importEndPos = findImportEndPosition(ast);
		s.appendLeft(importEndPos, '\n\n' + templateDecls.join('\n'));
	}

	return {
		code: s.toString(),
		map: s.generateMap({
			source: filename,
			file: filename + '.map',
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
	if (body.type !== 'BlockStatement') return null;

	for (const stmt of body.body) {
		if (stmt.type === 'ReturnStatement' && stmt.argument) {
			if (isJSX(stmt.argument)) {
				return stmt;
			}
			// Handle parenthesized: return (<div>...</div>)
			if (stmt.argument.type === 'ParenthesizedExpression') {
				if (isJSX(stmt.argument.expression)) {
					return stmt;
				}
			}
		}
	}

	return null;
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
	allEventTypes
) {
	const { jsxReturn, bodyStart, bodyEnd, name } = componentInfo;

	// Get the JSX element or fragment
	let jsxNode = isJSX(jsxReturn.argument) ? jsxReturn.argument : jsxReturn.argument.expression;

	// Extract template info (isComponentRoot = true for main component)
	// Pass the fragment flag so extractTemplate can handle it properly
	const isFragment = isJSXFragment(jsxNode);
	const templateResult = extractTemplate(jsxNode, templateRegistry, nameGen, true, isFragment);
	const { templateVar, rootVar, traversal, bindings, events, forBlocks } = templateResult;

	// Process bindings for bind() calls
	const processedBindings = processBindings(bindings);
	for (const b of processedBindings) {
		if (!b.isStatic) {
			usedImports.add('bind');
			usedImports.add('get');
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
		nameGen,
		templateRegistry,
		usedImports,
		allEventTypes,
		forBlockVars
	);

	// Replace the return statement with this.connected()
	const returnStart = jsxReturn.start;
	const returnEnd = jsxReturn.end;

	// Generate variable declarations for for_block captures (hoisted before connected)
	const forBlockDecls = forBlockVars.map((fb) => `let ${fb.varName};`).join('\n  ');
	const forBlockDeclsCode = forBlockDecls ? `${forBlockDecls}\n  ` : '';

	const connectedCode = `${forBlockDeclsCode}this.connected(() => {
${connectedBody}
  });`;

	s.overwrite(returnStart, returnEnd, connectedCode);

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
			forInfo.itemsExpression.type === 'Identifier'
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
 * Collect all variable names that are actually used by bindings, events, or for blocks
 */
function collectUsedVars(bindings, events, forBlocks) {
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

	return used;
}

/**
 * Filter traversal steps to only include those that are needed
 * A step is needed if:
 * 1. Its variable is directly used by a binding/event/forBlock
 * 2. Its variable is referenced by another needed step's traversal code
 */
function filterTraversalSteps(traversal, usedVars) {
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
					if (step.code.startsWith(varName + '.') && !needed.has(varName)) {
						needed.add(varName);
						changed = true;
					}
				}
			}
		}
	}

	// Filter traversal to only needed steps
	return traversal.filter((step) => needed.has(step.varName));
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
	nameGen,
	templateRegistry,
	usedImports,
	allEventTypes,
	forBlockVars = []
) {
	const lines = [];

	// Template instantiation
	lines.push(`    const ${rootVar} = ${templateVar}();`);
	lines.push(`    this.appendChild(${rootVar});`);
	lines.push('');

	// Filter traversal to only include steps that are actually needed
	const usedVars = collectUsedVars(bindings, events, forBlocks);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars);

	// DOM traversal - text nodes are now regular nodes (space placeholders), not markers
	for (const step of filteredTraversal) {
		lines.push(`    const ${step.varName} = ${step.code};`);
	}

	if (filteredTraversal.length > 0) {
		lines.push('');
	}

	// Event handler assignments
	for (const event of events) {
		const assignment = generateEventAssignment(event, (node) => generateExpr(code, node));
		lines.push(`    ${assignment}`);
	}

	if (events.length > 0) {
		lines.push('');
	}

	// Process for blocks
	for (let i = 0; i < forBlocks.length; i++) {
		const forBlock = forBlocks[i];
		const forBlockVar = forBlockVars[i];
		usedImports.add('for_block');
		const forCode = generateForBlock(
			code,
			forBlock,
			nameGen,
			templateRegistry,
			usedImports,
			allEventTypes,
			forBlockVar
		);
		lines.push(forCode);
		lines.push('');
	}

	// Track ref counts per cell for numbered refs (ref_1, ref_2, etc.)
	const cellRefCounts = new Map();

	// Bindings
	for (const binding of bindings) {
		const bindCode = generateBinding(code, binding, usedImports, null, false, cellRefCounts);
		lines.push(`    ${bindCode}`);
	}

	return lines.join('\n');
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
	forBlockVar = null
) {
	const { containerVarName, node } = forBlock;

	// Extract <For> component info
	const forInfo = extractForInfo(node, containerVarName);
	const { itemsExpression, itemParam, indexParam, bodyJSX, originalCallback } = forInfo;

	// Get preamble code from original callback (variable declarations, etc.)
	const preamble = getCallbackPreamble(originalCallback);
	const preambleCode = preamble
		.map((stmt) => '      ' + code.slice(stmt.start, stmt.end))
		.join('\n');

	// Extract template for the loop body
	const innerTemplate = extractTemplate(bodyJSX, templateRegistry, nameGen);
	const { templateVar, rootVar, traversal, bindings, events } = innerTemplate;

	// Process inner bindings (these need to reference the item parameter)
	const processedBindings = processBindings(bindings);
	for (const b of processedBindings) {
		if (!b.isStatic) {
			usedImports.add('bind');
			usedImports.add('get');
		}
	}

	// Process inner events (may reference item)
	const processedEvents = processEvents(events, itemParam);
	for (const e of processedEvents) {
		allEventTypes.add(e.eventName);
	}

	// Build the for_block callback body
	const indexParamName = indexParam || 'index';
	const lines = [];

	// Capture the for_block return value if we have a variable for it
	const forBlockAssignment = forBlockVar ? `${forBlockVar.varName} = ` : '';

	lines.push(
		`    ${forBlockAssignment}for_block(${containerVarName}, ${generateExpr(
			code,
			itemsExpression
		)}, (anchor, ${itemParam}, ${indexParamName}) => {`
	);
	lines.push(`      const ${rootVar} = ${templateVar}();`);
	lines.push('');

	// Filter traversal to only include steps that are actually needed
	const usedVars = collectUsedVars(processedBindings, processedEvents, []);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars);

	// Traversal - text nodes are now regular nodes (space placeholders), not markers
	for (const step of filteredTraversal) {
		lines.push(`      const ${step.varName} = ${step.code};`);
	}

	// Get the first element for start/end tracking
	const firstElementVar = filteredTraversal.length > 0 ? filteredTraversal[0].varName : rootVar;

	if (filteredTraversal.length > 0) {
		lines.push('');
	}

	// Events inside for block
	for (const event of processedEvents) {
		const assignment = generateEventAssignment(event, (node) => generateExpr(code, node));
		lines.push(`      ${assignment}`);
	}

	if (processedEvents.length > 0) {
		lines.push('');
	}

	// Preamble (local variables from original callback)
	if (preambleCode) {
		lines.push(preambleCode);
		lines.push('');
	}

	// Track ref counts per cell for numbered refs (ref_1, ref_2, etc.)
	const cellRefCounts = new Map();

	// Bindings inside for block
	for (const binding of processedBindings) {
		const bindCode = generateBinding(code, binding, usedImports, itemParam, true, cellRefCounts);
		lines.push(`      ${bindCode}`);
	}

	// Insert before anchor and return range
	lines.push('');
	lines.push(`      anchor.before(${firstElementVar});`);
	lines.push(`      return { start: ${firstElementVar}, end: ${firstElementVar} };`);
	lines.push(`    });`);

	return lines.join('\n');
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
	cellRefCounts = null
) {
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
	} = binding;

	// Handle new contentParts format (concatenated text content)
	if (contentParts) {
		return generateContentPartsBinding(code, binding, usedImports, insideForBlock, cellRefCounts);
	}

	// Build prefix string if we have static text before the dynamic expression
	const prefixCode = staticPrefix ? `"${escapeStringLiteral(staticPrefix)}" + ` : '';

	if (isStatic) {
		// Static assignment
		const exprCode = generateExpr(code, fullExpression);
		return `${targetVar}.${targetProperty} = ${prefixCode}${exprCode};`;
	}

	// Generate the cell argument code
	const cellCode = generateExpr(code, cellArg);

	// Generate the expression code for initial value (using original get() calls)
	const initialExprCode = generateExpr(code, fullExpression);

	// Check if this is a simple direct binding (works for both for_block and component level)
	// If so, we can use ref-based direct DOM updates instead of bind()
	if (isSimpleDirectBinding(binding) && cellRefCounts) {
		// Get or initialize the ref count for this cell
		const currentCount = cellRefCounts.get(cellCode) || 0;
		const refNum = currentCount + 1;
		cellRefCounts.set(cellCode, refNum);

		// Determine indentation based on context
		const indent = insideForBlock ? '      ' : '    ';

		// Emit: initial value assignment + ref storage on cell
		// cell.ref_N = element;
		return `${targetVar}.${targetProperty} = ${initialExprCode};
${indent}${cellCode}.ref_${refNum} = ${targetVar};`;
	}

	// Fall back to bind() for complex bindings
	usedImports.add('bind');
	usedImports.add('get');

	// Generate the expression code for bind callback, replacing get(cell) with v
	let bindExprCode;
	if (needsTransform && getCallNode) {
		// Replace the specific get() call with 'v'
		bindExprCode = generateExprWithReplacement(code, fullExpression, getCallNode, 'v');
	} else {
		// Simple case: entire expression is get(cell), so just use v
		bindExprCode = 'v';
	}

	// Set initial value AND bind for updates
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
	cellRefCounts = null
) {
	const { targetVar, targetProperty, cellArg, contentParts, isStatic } = binding;

	// Build the concatenated expression from content parts
	const buildConcatExpr = (useOriginalCode = true) => {
		const parts = [];
		for (const part of contentParts) {
			if (part.type === 'static') {
				// Keep whitespace as-is to preserve spacing between static/dynamic parts
				const text = part.value;
				// Only skip if completely empty
				if (text) {
					parts.push(`"${escapeStringLiteral(text)}"`);
				}
			} else if (part.type === 'dynamic') {
				if (useOriginalCode) {
					parts.push(generateExpr(code, part.expression));
				} else {
					// For bind callback, we keep the original expression
					// (the bind will just re-evaluate the whole thing)
					parts.push(generateExpr(code, part.expression));
				}
			}
		}
		return parts.join(' + ');
	};

	const initialExpr = buildConcatExpr(true);

	if (isStatic) {
		return `${targetVar}.${targetProperty} = ${initialExpr};`;
	}

	// For reactive bindings, check if we can use ref-based updates
	const cellCode = generateExpr(code, cellArg);

	// Check if this is a simple case: single dynamic expression that's just get(cell)
	const dynamicParts = contentParts.filter((p) => p.type === 'dynamic');
	const isSimple =
		dynamicParts.length === 1 &&
		dynamicParts[0].expression.type === 'CallExpression' &&
		dynamicParts[0].expression.callee?.name === 'get';

	if (isSimple && cellRefCounts) {
		// Get or initialize the ref count for this cell
		const currentCount = cellRefCounts.get(cellCode) || 0;
		const refNum = currentCount + 1;
		cellRefCounts.set(cellCode, refNum);

		// Determine indentation based on context
		const indent = insideForBlock ? '      ' : '    ';

		// For ref-based updates with concatenation, we need to store the full concat expression pattern
		// The setter will need to rebuild the string - store parts info on the ref
		return `${targetVar}.${targetProperty} = ${initialExpr};
${indent}${cellCode}.ref_${refNum} = ${targetVar};`;
	}

	// Fall back to bind() for complex bindings
	usedImports.add('bind');
	usedImports.add('get');

	const indent = insideForBlock ? '      ' : '    ';

	// Set initial value AND bind for updates
	return `${targetVar}.${targetProperty} = ${initialExpr};
${indent}bind(${cellCode}, (v) => {
${indent}  ${targetVar}.${targetProperty} = ${initialExpr};
${indent}});`;
}

/**
 * Escape special characters in a string literal
 */
function escapeStringLiteral(str) {
	return str
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t');
}

/**
 * Generate expression code from AST node using original source
 */
function generateExpr(code, node) {
	if (!node) return 'undefined';
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
			if (source === 'rift-js') {
				riftImport = path.node;
				path.stop();
			}
		},
		noScope: true,
	});

	// Preserve existing imports from the original import statement
	if (riftImport) {
		for (const specifier of riftImport.specifiers) {
			if (specifier.type === 'ImportSpecifier') {
				const importedName = specifier.imported.name;
				usedImports.add(importedName);
			}
		}
	}

	// Build the new import statement
	const imports = Array.from(usedImports).sort();
	const newImport = `import { ${imports.join(', ')} } from "rift-js";`;

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
