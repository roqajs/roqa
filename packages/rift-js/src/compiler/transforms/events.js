import { isJSXExpressionContainer } from '../parser.js';

/**
 * Transform event handlers from JSX attributes to inline assignments
 *
 * Input JSX:
 *   <button onclick={run}>Click</button>
 *   <a onclick={() => select(row)}>Select</a>
 *
 * Output:
 *   button_1.__click = run;
 *   a_1.__click = [select, row];  // For parameterized handlers
 */

/**
 * @typedef {Object} EventBinding
 * @property {string} varName - Variable name of the element
 * @property {string} eventName - Event name (click, input, etc.)
 * @property {import("@babel/types").Node} handler - The handler expression
 * @property {number[]} path - Path in the JSX tree
 */

/**
 * @typedef {Object} ProcessedEvent
 * @property {string} varName - Variable name of the element
 * @property {string} eventName - Event name
 * @property {import("@babel/types").Node} handlerExpression - The handler (identifier or array expression)
 * @property {boolean} isParameterized - Whether handler needs item parameter
 * @property {import("@babel/types").Node[]} params - Additional parameters for the handler
 */

/**
 * Process event bindings and determine handler type
 * @param {EventBinding[]} events
 * @param {string|null} itemParam - Current loop item parameter name (for parameterized handlers)
 * @returns {ProcessedEvent[]}
 */
export function processEvents(events, itemParam = null) {
	const processed = [];

	for (const event of events) {
		const { varName, eventName, handler } = event;

		if (!handler) {
			// Boolean attribute like onclick without value - skip
			continue;
		}

		// Extract the actual expression from JSXExpressionContainer
		const expression = isJSXExpressionContainer(handler) ? handler.expression : handler;

		const processedEvent = analyzeHandler(expression, varName, eventName, itemParam);
		processed.push(processedEvent);
	}

	return processed;
}

/**
 * Analyze a handler expression to determine its type
 * @param {import("@babel/types").Node} expression
 * @param {string} varName
 * @param {string} eventName
 * @param {string|null} itemParam
 * @returns {ProcessedEvent}
 */
function analyzeHandler(expression, varName, eventName, itemParam) {
	// Case 1: Simple identifier - onclick={run}
	if (expression.type === 'Identifier') {
		return {
			varName,
			eventName,
			handlerExpression: expression,
			isParameterized: false,
			params: [],
		};
	}

	// Case 2: Arrow function - onclick={() => select(row)}
	if (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression') {
		return analyzeArrowHandler(expression, varName, eventName, itemParam);
	}

	// Case 3: Call expression directly - onclick={handler(item)}
	// This is unusual but handle it
	if (expression.type === 'CallExpression') {
		// Wrap in array format: [handler, ...args]
		const args = expression.arguments;
		return {
			varName,
			eventName,
			handlerExpression: expression.callee,
			isParameterized: true,
			params: args,
		};
	}

	// Default: treat as simple handler
	return {
		varName,
		eventName,
		handlerExpression: expression,
		isParameterized: false,
		params: [],
	};
}

/**
 * Check if an expression is "static" - safe to extract as a parameter
 * that can be evaluated at setup time rather than click time.
 * @param {import("@babel/types").Node} node
 * @param {Set<string>} boundParams - Parameter names bound by the arrow function
 * @returns {boolean}
 */
function isStaticExpression(node, boundParams = new Set()) {
	if (!node) return true;

	switch (node.type) {
		// Identifiers are static ONLY if they are not bound parameters
		case 'Identifier':
			return !boundParams.has(node.name);

		// Literals are always static
		case 'NumericLiteral':
		case 'StringLiteral':
		case 'BooleanLiteral':
		case 'NullLiteral':
			return true;

		// Member expressions like obj.prop are static only if obj is static
		case 'MemberExpression':
			return (
				isStaticExpression(node.object, boundParams) &&
				isStaticExpression(node.property, boundParams)
			);

		// Function calls are NOT static - they need to be evaluated at click time
		case 'CallExpression':
			return false;

		// Binary/unary expressions containing calls are not static
		case 'BinaryExpression':
		case 'LogicalExpression':
			return (
				isStaticExpression(node.left, boundParams) && isStaticExpression(node.right, boundParams)
			);

		case 'UnaryExpression':
			return isStaticExpression(node.argument, boundParams);

		// Conditional expressions need all parts to be static
		case 'ConditionalExpression':
			return (
				isStaticExpression(node.test, boundParams) &&
				isStaticExpression(node.consequent, boundParams) &&
				isStaticExpression(node.alternate, boundParams)
			);

		// Array/object literals - check all elements
		case 'ArrayExpression':
			return node.elements.every((el) => el === null || isStaticExpression(el, boundParams));

		case 'ObjectExpression':
			return node.properties.every(
				(prop) =>
					prop.type === 'ObjectProperty' &&
					isStaticExpression(prop.key, boundParams) &&
					isStaticExpression(prop.value, boundParams)
			);

		// Default: not static (be conservative)
		default:
			return false;
	}
}

/**
 * Analyze an arrow function handler
 * @param {import("@babel/types").ArrowFunctionExpression} arrow
 * @param {string} varName
 * @param {string} eventName
 * @param {string|null} itemParam
 * @returns {ProcessedEvent}
 */
function analyzeArrowHandler(arrow, varName, eventName, itemParam) {
	const body = arrow.body;

	// Collect parameter names that are bound by this arrow function
	const boundParams = new Set();
	for (const param of arrow.params) {
		if (param.type === 'Identifier') {
			boundParams.add(param.name);
		}
	}

	// Check if it's a simple call expression: () => fn(args)
	// Transform to array format: [fn, ...args] ONLY if all args are static
	// (don't reference arrow function parameters)
	if (body.type === 'CallExpression' && body.callee.type === 'Identifier') {
		const allArgsStatic = body.arguments.every((arg) => isStaticExpression(arg, boundParams));

		if (allArgsStatic) {
			return {
				varName,
				eventName,
				handlerExpression: body.callee,
				isParameterized: body.arguments.length > 0,
				params: body.arguments,
			};
		}
	}

	// For more complex arrow functions, keep them as-is
	// e.g., () => { multiple; statements; } or () => obj.method()
	// or when arguments contain dynamic expressions like get(count) + 1
	// or when arguments reference arrow function parameters like e.target.value
	return {
		varName,
		eventName,
		handlerExpression: arrow,
		isParameterized: false,
		params: [],
	};
}

/**
 * Generate event handler assignment code
 * @param {ProcessedEvent} event
 * @param {(node: import("@babel/types").Node) => string} generateExpr - Function to generate expression code
 * @returns {string}
 */
export function generateEventAssignment(event, generateExpr) {
	const { varName, eventName, handlerExpression, isParameterized, params } = event;

	if (isParameterized) {
		// Array format: element.__click = [handler, arg1, arg2]
		const handlerCode = generateExpr(handlerExpression);
		const paramsCode = params.map((p) => generateExpr(p)).join(', ');
		return `${varName}.__${eventName} = [${handlerCode}, ${paramsCode}];`;
	}

	// Simple assignment: element.__click = handler
	const handlerCode = generateExpr(handlerExpression);
	return `${varName}.__${eventName} = ${handlerCode};`;
}
