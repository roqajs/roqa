/** @import {JSXElement, JSXFragment, JSXExpressionContainer, JSXText, JSXSpreadChild, Expression} from '@babel/types' */
/** @import {NodeIR, ElementIR, ExprIR, EventBindingIR, ClassIR, CellRef} from 'roqa/ir' */
/** @import {ExprContext} from './expressions.js' */

import * as t from "@babel/types";
import { convertExpr, extractParamNames } from "./expressions.js";
import { normalizeEventName, isEventAttribute } from "./utils.js";

/**
 * Convert a JSX expression (the return value of a component) to NodeIR[].
 *
 * @param {Expression} node - The JSX expression returned by the component
 * @param {ExprContext} ctx - Expression context
 * @returns {NodeIR[]}
 */
export function convertJSXToNodes(node, ctx) {
	// Unwrap parenthesized expressions
	if (t.isParenthesizedExpression(node)) {
		return convertJSXToNodes(node.expression, ctx);
	}

	// Fragment: <>...</>
	if (t.isJSXFragment(node)) {
		return convertJSXChildren(node.children, ctx);
	}

	// Element: <tag ...>...</tag>
	if (t.isJSXElement(node)) {
		const elementNode = convertJSXElement(node, ctx);
		if (elementNode) return [elementNode];
		return [];
	}

	// Expression container (inside another element, this shouldn't be top-level)
	if (t.isJSXExpressionContainer(node)) {
		return convertJSXExpressionToNodes(node.expression, ctx);
	}

	// If it's just a regular expression (shouldn't happen at top level but handle gracefully)
	return [{ kind: "reactive-text", source: convertExpr(node, ctx) }];
}

/**
 * Convert JSX children array to NodeIR[].
 *
 * @param {Array<JSXElement | JSXFragment | JSXExpressionContainer | JSXText | JSXSpreadChild>} children
 * @param {ExprContext} ctx
 * @returns {NodeIR[]}
 */
export function convertJSXChildren(children, ctx) {
	/** @type {NodeIR[]} */
	const nodes = [];

	for (const child of children) {
		if (t.isJSXText(child)) {
			const text = cleanJSXText(child.value);
			if (text) {
				nodes.push({ kind: "text", value: text });
			}
			continue;
		}

		if (t.isJSXElement(child)) {
			const elementNode = convertJSXElement(child, ctx);
			if (elementNode) nodes.push(elementNode);
			continue;
		}

		if (t.isJSXFragment(child)) {
			nodes.push(...convertJSXChildren(child.children, ctx));
			continue;
		}

		if (t.isJSXExpressionContainer(child)) {
			if (t.isJSXEmptyExpression(child.expression)) continue;
			const exprNodes = convertJSXExpressionToNodes(child.expression, ctx);
			nodes.push(...exprNodes);
			continue;
		}

		if (t.isJSXSpreadChild(child)) {
			// Spread children are not common in Roqa — opaque fallback
			nodes.push({
				kind: "reactive-text",
				source: { kind: "opaque", source: "/* spread child */", reads: [], writes: [] },
			});
		}
	}

	return nodes;
}

/**
 * Convert a JSX expression (inside {}) to NodeIR[].
 * Handles show patterns (&&, ternary), reactive text, etc.
 *
 * @param {Expression} expr
 * @param {ExprContext} ctx
 * @returns {NodeIR[]}
 */
function convertJSXExpressionToNodes(expr, ctx) {
	// Unwrap TS annotations
	if (t.isTSAsExpression(expr) || t.isTSTypeAssertion(expr)) {
		return convertJSXExpressionToNodes(expr.expression, ctx);
	}
	if (t.isTSNonNullExpression(expr)) {
		return convertJSXExpressionToNodes(expr.expression, ctx);
	}

	// Pattern: get(x) && <el/> → ShowIR (no fallback)
	if (t.isLogicalExpression(expr) && expr.operator === "&&") {
		const condRef = extractCellRefFromCondition(expr.left, ctx);
		if (condRef && isJSXNode(expr.right)) {
			return [
				{
					kind: "show",
					condition: condRef,
					render: convertJSXToNodes(expr.right, ctx),
				},
			];
		}
	}

	// Pattern: get(x) ? <a/> : <b/> → ShowIR (with fallback)
	if (t.isConditionalExpression(expr)) {
		const condRef = extractCellRefFromCondition(expr.test, ctx);
		if (condRef && (isJSXNode(expr.consequent) || isJSXNode(expr.alternate))) {
			return [
				{
					kind: "show",
					condition: condRef,
					render: isJSXNode(expr.consequent)
						? convertJSXToNodes(expr.consequent, ctx)
						: [{ kind: "reactive-text", source: convertExpr(expr.consequent, ctx) }],
					fallback: isJSXNode(expr.alternate)
						? convertJSXToNodes(expr.alternate, ctx)
						: [{ kind: "reactive-text", source: convertExpr(expr.alternate, ctx) }],
				},
			];
		}
	}

	// If it's a JSX element/fragment, convert directly
	if (isJSXNode(expr)) {
		return convertJSXToNodes(expr, ctx);
	}

	// Otherwise, it's a reactive text expression
	return [{ kind: "reactive-text", source: convertExpr(expr, ctx) }];
}

/**
 * Convert a single JSX element to a NodeIR.
 *
 * @param {JSXElement} node
 * @param {ExprContext} ctx
 * @returns {NodeIR | null}
 */
function convertJSXElement(node, ctx) {
	const opening = node.openingElement;
	const tag = getJSXTagName(opening.name);

	// <For each={x}>{(item) => ...}</For> → EachIR
	if (tag === "For") {
		return convertForElement(node, ctx);
	}

	// <Show when={get(x)}>...</Show> → ShowIR
	if (tag === "Show") {
		return convertShowElement(node, ctx);
	}

	// Regular HTML or custom element
	const attributes = {};
	/** @type {EventBindingIR[]} */
	const events = [];
	/** @type {ClassIR | undefined} */
	let classes;
	/** @type {string | undefined} */
	let ref;

	for (const attr of opening.attributes) {
		if (t.isJSXSpreadAttribute(attr)) {
			// Spread attributes — not supported in MIR, ignore for now
			continue;
		}

		const attrName = t.isJSXNamespacedName(attr.name)
			? `${attr.name.namespace.name}:${attr.name.name.name}`
			: attr.name.name;

		// ref attribute
		if (attrName === "ref") {
			if (t.isJSXExpressionContainer(attr.value) && t.isIdentifier(attr.value.expression)) {
				ref = attr.value.expression.name;
			}
			continue;
		}

		// Event handler
		if (isEventAttribute(attrName)) {
			const event = normalizeEventName(attrName);
			const handler = convertEventHandler(attr.value, ctx);
			events.push({ event, handler });
			continue;
		}

		// class / className
		if (attrName === "class" || attrName === "className") {
			const classResult = convertClassAttribute(attr.value, ctx);
			if (classResult.isClassIR) {
				classes = classResult.value;
			} else {
				attributes["class"] = classResult.value;
			}
			continue;
		}

		// Regular attribute
		const value = convertAttributeValue(attr.value, ctx);
		attributes[attrName] = value;
	}

	const children = convertJSXChildren(node.children, ctx);

	/** @type {ElementIR} */
	const element = {
		kind: "element",
		tag,
		attributes,
		events,
		children,
	};

	if (classes) element.classes = classes;
	if (ref) element.ref = ref;

	return element;
}

/**
 * Convert a <For> JSX element to an EachIR.
 *
 * @param {JSXElement} node
 * @param {ExprContext} ctx
 * @returns {NodeIR | null}
 */
function convertForElement(node, ctx) {
	// Extract `each` prop → cell-ref
	let sourceRef = null;
	let keyProp = null;

	for (const attr of node.openingElement.attributes) {
		if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
			if (attr.name.name === "each") {
				if (t.isJSXExpressionContainer(attr.value)) {
					const expr = attr.value.expression;
					if (t.isIdentifier(expr) && ctx.cells.has(expr.name)) {
						sourceRef = { kind: "cell-ref", name: expr.name };
					} else if (t.isIdentifier(expr)) {
						// Could be a non-cell variable passed to For (e.g., from outer scope)
						sourceRef = { kind: "cell-ref", name: expr.name };
					}
					// For member expressions like column.tasks (nested cells),
					// EachIR.source requires a flat CellRef which can't represent
					// nested access. Fall through to return null (the <For> will be
					// treated as a regular element).
				}
			}
			if (attr.name.name === "key" && t.isStringLiteral(attr.value)) {
				keyProp = attr.value.value;
			}
		}
	}

	if (!sourceRef) {
		// Can't represent this <For> as EachIR — fall back to opaque element
		return convertForAsOpaqueElement(node, ctx);
	}

	// Extract render callback: {(item) => ...} or {(item, index) => ...}
	const renderChild = node.children.find(
		(c) => t.isJSXExpressionContainer(c) && !t.isJSXEmptyExpression(c.expression),
	);

	if (!renderChild || !t.isJSXExpressionContainer(renderChild)) return null;

	const renderExpr = renderChild.expression;
	if (!t.isArrowFunctionExpression(renderExpr) && !t.isFunctionExpression(renderExpr)) return null;

	const params = extractParamNames(renderExpr.params);
	const itemAlias = params[0] || "item";

	// Create child context with item alias in scope
	const childCtx = {
		...ctx,
		itemAlias,
		params: new Set([...ctx.params, ...params]),
	};

	// Convert render body
	let renderNodes;
	if (t.isBlockStatement(renderExpr.body)) {
		// Block body — find the return statement's JSX
		const returnStmt = renderExpr.body.body.find((s) => t.isReturnStatement(s));
		if (returnStmt && t.isReturnStatement(returnStmt) && returnStmt.argument) {
			renderNodes = convertJSXToNodes(returnStmt.argument, childCtx);
		} else {
			renderNodes = [];
		}
	} else {
		renderNodes = convertJSXToNodes(renderExpr.body, childCtx);
	}

	/** @type {import('roqa/ir').EachIR} */
	const each = {
		kind: "each",
		source: /** @type {CellRef} */ (sourceRef),
		itemAlias,
		render: renderNodes,
	};

	if (keyProp) each.key = keyProp;

	return each;
}

/**
 * Convert a <For> that can't be represented as EachIR (e.g. nested cell
 * access like `column.tasks`) into an empty element. The For block silently
 * doesn't render its items — these patterns aren't yet supported in the JSX
 * frontend but should not break the build.
 *
 * @param {JSXElement} node
 * @param {ExprContext} ctx
 * @returns {NodeIR}
 */
function convertForAsOpaqueElement(node, ctx) {
	return {
		kind: "element",
		tag: "div",
		attributes: {},
		events: [],
		children: [],
	};
}

/**
 * Convert a <Show> JSX element to a ShowIR.
 *
 * @param {JSXElement} node
 * @param {ExprContext} ctx
 * @returns {NodeIR | null}
 */
function convertShowElement(node, ctx) {
	let conditionRef = null;

	for (const attr of node.openingElement.attributes) {
		if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
			if (attr.name.name === "when") {
				if (t.isJSXExpressionContainer(attr.value)) {
					conditionRef = extractCellRefFromCondition(attr.value.expression, ctx);
				}
			}
		}
	}

	if (!conditionRef) return null;

	const renderNodes = convertJSXChildren(node.children, ctx);

	return {
		kind: "show",
		condition: conditionRef,
		render: renderNodes,
	};
}

/**
 * Extract a CellRef from a condition expression.
 * Handles:
 * - get(cellVar) → cell-ref("cellVar")
 * - !get(cellVar) → cell-ref("cellVar") (negation is condition-level)
 * - bare cellVar → cell-ref("cellVar")
 *
 * @param {Expression} expr
 * @param {ExprContext} ctx
 * @returns {CellRef | null}
 */
function extractCellRefFromCondition(expr, ctx) {
	// Unwrap TS
	if (t.isTSAsExpression(expr) || t.isTSTypeAssertion(expr)) {
		return extractCellRefFromCondition(expr.expression, ctx);
	}
	if (t.isTSNonNullExpression(expr)) {
		return extractCellRefFromCondition(expr.expression, ctx);
	}

	// get(cellVar)
	if (
		t.isCallExpression(expr) &&
		t.isIdentifier(expr.callee) &&
		expr.callee.name === "get" &&
		expr.arguments.length === 1
	) {
		const arg = expr.arguments[0];
		if (t.isIdentifier(arg) && ctx.cells.has(arg.name)) {
			return { kind: "cell-ref", name: arg.name };
		}
	}

	// !get(cellVar)
	if (t.isUnaryExpression(expr) && expr.operator === "!") {
		const inner = extractCellRefFromCondition(expr.argument, ctx);
		if (inner) return inner;
	}

	// bare cellVar
	if (t.isIdentifier(expr) && ctx.cells.has(expr.name)) {
		return { kind: "cell-ref", name: expr.name };
	}

	// For complex conditions, try to find the first cell reference
	// This handles patterns like `get(showStoryList)` inside a more complex expression
	return findFirstCellRef(expr, ctx);
}

/**
 * Try to find the first cell reference in an expression (for show conditions).
 * @param {Expression} expr
 * @param {ExprContext} ctx
 * @returns {CellRef | null}
 */
function findFirstCellRef(expr, ctx) {
	if (
		t.isCallExpression(expr) &&
		t.isIdentifier(expr.callee) &&
		expr.callee.name === "get" &&
		expr.arguments.length === 1
	) {
		const arg = expr.arguments[0];
		if (t.isIdentifier(arg) && ctx.cells.has(arg.name)) {
			return { kind: "cell-ref", name: arg.name };
		}
	}
	return null;
}

/**
 * Convert an event handler attribute value to an ExprIR.
 *
 * @param {import('@babel/types').JSXAttribute['value']} value
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertEventHandler(value, ctx) {
	if (!value || t.isStringLiteral(value)) {
		return { kind: "literal", value: value?.value ?? null };
	}

	if (t.isJSXExpressionContainer(value)) {
		const expr = value.expression;
		if (t.isJSXEmptyExpression(expr)) {
			return { kind: "literal", value: null };
		}

		// Named action reference: onclick={increment}
		if (t.isIdentifier(expr) && ctx.actions.has(expr.name)) {
			return { kind: "action-call", name: expr.name, args: [] };
		}

		// Arrow function wrapping a single action call: onclick={() => increment()}
		if (t.isArrowFunctionExpression(expr) && expr.params.length === 0) {
			const body = t.isBlockStatement(expr.body)
				? getSingleExpressionFromBlock(expr.body)
				: expr.body;

			if (
				body &&
				t.isCallExpression(body) &&
				t.isIdentifier(body.callee) &&
				ctx.actions.has(body.callee.name) &&
				body.arguments.length === 0
			) {
				// Normalize () => increment() to just ActionCallExpr
				return { kind: "action-call", name: body.callee.name, args: [] };
			}
		}

		// General expression (inline arrow, etc.)
		return convertExpr(expr, ctx);
	}

	return { kind: "literal", value: null };
}

/**
 * Convert a class attribute value.
 * Returns either a literal ExprIR (for attributes) or a ClassIR.
 *
 * @param {import('@babel/types').JSXAttribute['value']} value
 * @param {ExprContext} ctx
 * @returns {{ isClassIR: false, value: ExprIR } | { isClassIR: true, value: ClassIR }}
 */
function convertClassAttribute(value, ctx) {
	// class="btn" → literal
	if (t.isStringLiteral(value)) {
		return {
			isClassIR: false,
			value: { kind: "literal", value: value.value },
		};
	}

	if (t.isJSXExpressionContainer(value)) {
		const expr = value.expression;
		if (t.isJSXEmptyExpression(expr)) {
			return { isClassIR: false, value: { kind: "literal", value: "" } };
		}

		// class={"btn"} → literal
		if (t.isStringLiteral(expr)) {
			return {
				isClassIR: false,
				value: { kind: "literal", value: expr.value },
			};
		}

		// class={condition ? "btn active" : "btn"} → expression (kept as reactive attribute)
		// This could be normalized to ClassListIR, but for v1 keep it simple
		return {
			isClassIR: false,
			value: convertExpr(expr, ctx),
		};
	}

	return { isClassIR: false, value: { kind: "literal", value: "" } };
}

/**
 * Convert a JSX attribute value to an ExprIR.
 *
 * @param {import('@babel/types').JSXAttribute['value']} value
 * @param {ExprContext} ctx
 * @returns {ExprIR}
 */
function convertAttributeValue(value, ctx) {
	// No value: <button disabled> → true
	if (!value) {
		return { kind: "literal", value: true };
	}

	// String literal: id="my-id"
	if (t.isStringLiteral(value)) {
		return { kind: "literal", value: value.value };
	}

	// Expression: value={get(count)}
	if (t.isJSXExpressionContainer(value)) {
		if (t.isJSXEmptyExpression(value.expression)) {
			return { kind: "literal", value: null };
		}
		return convertExpr(value.expression, ctx);
	}

	// JSX element as attribute value (rare but possible)
	if (t.isJSXElement(value)) {
		return { kind: "opaque", source: "/* jsx element attribute */", reads: [], writes: [] };
	}

	return { kind: "literal", value: null };
}

// --- Helpers ---

/**
 * Get the tag name from a JSX element name.
 * @param {import('@babel/types').JSXIdentifier | import('@babel/types').JSXMemberExpression | import('@babel/types').JSXNamespacedName} name
 * @returns {string}
 */
function getJSXTagName(name) {
	if (t.isJSXIdentifier(name)) return name.name;
	if (t.isJSXMemberExpression(name)) {
		return `${getJSXTagName(name.object)}.${name.property.name}`;
	}
	if (t.isJSXNamespacedName(name)) {
		return `${name.namespace.name}:${name.name.name}`;
	}
	return "unknown";
}

/**
 * Clean JSX text following JSX whitespace rules (matching React's algorithm):
 * 1. Split into lines
 * 2. Trim leading whitespace from all lines except the first
 * 3. Trim trailing whitespace from all lines except the last
 * 4. Lines that become empty are removed
 * 5. Join remaining lines with a single space
 *
 * @param {string} text
 * @returns {string}
 */
function cleanJSXText(text) {
	const lines = text.split("\n");

	if (lines.length === 1) {
		// Single-line text: preserve internal whitespace as-is
		return text;
	}

	// Multi-line: apply JSX whitespace rules
	/** @type {string[]} */
	const processed = [];
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];

		// Trim trailing whitespace from all lines except the last
		if (i < lines.length - 1) {
			line = line.replace(/\s+$/, "");
		}

		// Trim leading whitespace from all lines except the first
		if (i > 0) {
			line = line.replace(/^\s+/, "");
		}

		// Skip lines that are now empty
		if (line === "") continue;

		processed.push(line);
	}

	const result = processed.join(" ");

	// If the entire result is whitespace, return empty
	if (result.trim() === "") return "";

	return result;
}

/**
 * Check if a Babel node is a JSX element or fragment.
 * @param {import('@babel/types').Node} node
 * @returns {boolean}
 */
function isJSXNode(node) {
	return t.isJSXElement(node) || t.isJSXFragment(node);
}

/**
 * Get the single expression from a block statement (if it contains only a return or expression).
 * @param {import('@babel/types').BlockStatement} block
 * @returns {Expression | null}
 */
function getSingleExpressionFromBlock(block) {
	if (block.body.length === 1) {
		const stmt = block.body[0];
		if (t.isReturnStatement(stmt) && stmt.argument) return stmt.argument;
		if (t.isExpressionStatement(stmt)) return stmt.expression;
	}
	return null;
}

/**
 * Collect cell names used as <For each={x}> sources from a JSX tree.
 * This is a pre-pass to identify collections.
 *
 * @param {Expression} jsxRoot
 * @returns {Set<string>}
 */
export function collectForSources(jsxRoot) {
	/** @type {Set<string>} */
	const sources = new Set();
	walkJSXForSources(jsxRoot, sources);
	return sources;
}

/**
 * @param {import('@babel/types').Node} node
 * @param {Set<string>} sources
 */
function walkJSXForSources(node, sources) {
	if (t.isJSXElement(node)) {
		const tag = getJSXTagName(node.openingElement.name);
		if (tag === "For") {
			for (const attr of node.openingElement.attributes) {
				if (
					t.isJSXAttribute(attr) &&
					t.isJSXIdentifier(attr.name) &&
					attr.name.name === "each" &&
					t.isJSXExpressionContainer(attr.value)
				) {
					const expr = attr.value.expression;
					if (t.isIdentifier(expr)) {
						sources.add(expr.name);
					}
				}
			}
		}
		// Recurse into children
		for (const child of node.children) {
			walkJSXForSources(child, sources);
		}
	} else if (t.isJSXFragment(node)) {
		for (const child of node.children) {
			walkJSXForSources(child, sources);
		}
	} else if (t.isJSXExpressionContainer(node) && !t.isJSXEmptyExpression(node.expression)) {
		walkJSXForSources(node.expression, sources);
	} else if (t.isConditionalExpression(node)) {
		walkJSXForSources(node.consequent, sources);
		walkJSXForSources(node.alternate, sources);
	} else if (t.isLogicalExpression(node)) {
		walkJSXForSources(node.right, sources);
	}
}
