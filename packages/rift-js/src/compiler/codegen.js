import MagicString from 'magic-string';
import _generate from '@babel/generator';
import _traverse from '@babel/traverse';

// Handle CJS/ESM interop
const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;
import {
	TemplateRegistry,
	VariableNameGenerator,
	extractTemplate,
} from './transforms/jsx-to-template.js';
import { extractForInfo, getCallbackPreamble } from './transforms/for-transform.js';
import { processBindings, findGetCalls } from './transforms/bind-detector.js';
import { processEvents, generateEventAssignment, collectEventTypes } from './transforms/events.js';
import {
	isJSXElement,
	isJSXFragment,
	getJSXElementName,
	isForComponent,
	getJSXChildren,
	extractJSXAttributes,
	isJSXExpressionContainer,
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
 * Wrap a JSX fragment's children in a synthetic div element
 * This allows fragments to be processed by the existing template extraction
 */
function wrapFragmentInDiv(fragment) {
	return {
		type: 'JSXElement',
		openingElement: {
			type: 'JSXOpeningElement',
			name: { type: 'JSXIdentifier', name: 'div' },
			attributes: [],
			selfClosing: false,
		},
		closingElement: {
			type: 'JSXClosingElement',
			name: { type: 'JSXIdentifier', name: 'div' },
		},
		children: fragment.children,
		// Preserve location info for source mapping
		start: fragment.start,
		end: fragment.end,
		loc: fragment.loc,
	};
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

	// Handle fragments by wrapping children in a synthetic element
	if (isJSXFragment(jsxNode)) {
		jsxNode = wrapFragmentInDiv(jsxNode);
	}

	// Extract template info (isComponentRoot = true for main component)
	const templateResult = extractTemplate(jsxNode, templateRegistry, nameGen, true);
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
		allEventTypes
	);

	// Replace the return statement with this.connected()
	const returnStart = jsxReturn.start;
	const returnEnd = jsxReturn.end;

	const connectedCode = `this.connected(() => {
${connectedBody}
  });`;

	s.overwrite(returnStart, returnEnd, connectedCode);

	return { componentName: name };
}

/**
 * Collect all variable names that are actually used by bindings, events, or for blocks
 */
function collectUsedVars(bindings, events, forBlocks) {
	const used = new Set();

	for (const b of bindings) {
		used.add(b.targetVar);
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
	allEventTypes
) {
	const lines = [];

	// Template instantiation
	lines.push(`    const ${rootVar} = ${templateVar}();`);
	lines.push(`    this.appendChild(${rootVar});`);
	lines.push('');

	// Filter traversal to only include steps that are actually needed
	const usedVars = collectUsedVars(bindings, events, forBlocks);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars);

	// DOM traversal
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
	for (const forBlock of forBlocks) {
		usedImports.add('for_block');
		const forCode = generateForBlock(
			code,
			forBlock,
			nameGen,
			templateRegistry,
			usedImports,
			allEventTypes
		);
		lines.push(forCode);
		lines.push('');
	}

	// Bindings
	for (const binding of bindings) {
		const bindCode = generateBinding(code, binding, usedImports);
		lines.push(`    ${bindCode}`);
	}

	return lines.join('\n');
}

/**
 * Generate code for a for_block
 */
function generateForBlock(code, forBlock, nameGen, templateRegistry, usedImports, allEventTypes) {
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

	lines.push(
		`    for_block(${containerVarName}, ${generateExpr(
			code,
			itemsExpression
		)}, (anchor, ${itemParam}, ${indexParamName}) => {`
	);
	lines.push(`      const ${rootVar} = ${templateVar}();`);
	lines.push('');

	// Filter traversal to only include steps that are actually needed
	const usedVars = collectUsedVars(processedBindings, processedEvents, []);
	const filteredTraversal = filterTraversalSteps(traversal, usedVars);

	// Traversal
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

	// Bindings inside for block
	for (const binding of processedBindings) {
		const bindCode = generateBinding(code, binding, usedImports, itemParam);
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
 * Generate code for a binding
 */
function generateBinding(code, binding, usedImports, itemParam = null) {
	const {
		targetVar,
		targetProperty,
		cellArg,
		fullExpression,
		isStatic,
		needsTransform,
		getCallNode,
		staticPrefix,
	} = binding;

	// Build prefix string if we have static text before the dynamic expression
	const prefixCode = staticPrefix ? `"${escapeStringLiteral(staticPrefix)}" + ` : '';

	if (isStatic) {
		// Static assignment
		const exprCode = generateExpr(code, fullExpression);
		return `${targetVar}.${targetProperty} = ${prefixCode}${exprCode};`;
	}

	usedImports.add('bind');
	usedImports.add('get');

	// Generate the cell argument code
	const cellCode = generateExpr(code, cellArg);

	// Generate the expression code for initial value (using original get() calls)
	const initialExprCode = generateExpr(code, fullExpression);

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
