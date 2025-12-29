import { describe, it, expect } from "vitest";
import { parse } from "../../src/compiler/parser.js";
import { processEvents, generateEventAssignment } from "../../src/compiler/transforms/events.js";

/**
 * Tests for the event handler transformation (compiler)
 *
 * This transform converts JSX event handlers into Rift's delegated event format:
 *
 *   onclick={handler}           -> el.__click = handler
 *   onclick={() => fn(item)}    -> el.__click = [fn, item]
 *
 * Events are delegated to the document root for efficiency. The transform also
 * collects all event types used so delegate() can be called with the correct list.
 */

describe("processEvents", () => {
	function createEventBinding(jsxCode) {
		const ast = parse(jsxCode, "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const attr = jsxElement.openingElement.attributes[0];
		return {
			varName: "button_1",
			eventName: attr.name.name.slice(2).toLowerCase(),
			handler: attr.value,
			path: [],
		};
	}

	it("processes simple identifier handler", () => {
		const event = createEventBinding("<button onclick={handleClick}></button>");
		const processed = processEvents([event]);

		expect(processed.length).toBe(1);
		expect(processed[0].eventName).toBe("click");
		expect(processed[0].isParameterized).toBe(false);
		expect(processed[0].handlerExpression.type).toBe("Identifier");
		expect(processed[0].handlerExpression.name).toBe("handleClick");
	});

	it("processes arrow function with simple call", () => {
		const event = createEventBinding("<button onclick={() => increment()}></button>");
		const processed = processEvents([event]);

		expect(processed.length).toBe(1);
		expect(processed[0].eventName).toBe("click");
		// Simple call with no args - should be extracted
		expect(processed[0].handlerExpression.type).toBe("Identifier");
		expect(processed[0].handlerExpression.name).toBe("increment");
	});

	it("processes arrow function with static arguments", () => {
		const event = createEventBinding("<button onclick={() => select(row)}></button>");
		const processed = processEvents([event]);

		expect(processed.length).toBe(1);
		expect(processed[0].isParameterized).toBe(true);
		expect(processed[0].params.length).toBe(1);
	});

	it("keeps complex arrow functions as-is", () => {
		const event = createEventBinding("<button onclick={(e) => handleClick(e.target)}></button>");
		const processed = processEvents([event]);

		expect(processed.length).toBe(1);
		// Should keep as arrow function since e.target uses the parameter
		expect(processed[0].handlerExpression.type).toBe("ArrowFunctionExpression");
	});

	it("keeps multi-statement arrow functions as-is", () => {
		const event = createEventBinding("<button onclick={() => { doA(); doB(); }}></button>");
		const processed = processEvents([event]);

		expect(processed.length).toBe(1);
		expect(processed[0].handlerExpression.type).toBe("ArrowFunctionExpression");
	});

	it("handles multiple events", () => {
		const ast = parse("<input oninput={handleInput} onfocus={handleFocus} />", "test.jsx");
		const jsxElement = ast.program.body[0].expression;
		const events = jsxElement.openingElement.attributes.map((attr) => ({
			varName: "input_1",
			eventName: attr.name.name.slice(2).toLowerCase(),
			handler: attr.value,
			path: [],
		}));

		const processed = processEvents(events);
		expect(processed.length).toBe(2);
		expect(processed.map((e) => e.eventName)).toContain("input");
		expect(processed.map((e) => e.eventName)).toContain("focus");
	});

	it("handles event handler with loop item parameter", () => {
		const event = createEventBinding("<button onclick={() => remove(item)}></button>");
		const processed = processEvents([event], "item");

		// When item is the loop param, `item` is still static (closure variable)
		expect(processed[0].isParameterized).toBe(true);
	});

	it("skips null handlers (boolean attributes)", () => {
		const event = {
			varName: "button_1",
			eventName: "click",
			handler: null,
			path: [],
		};
		const processed = processEvents([event]);

		expect(processed.length).toBe(0);
	});
});

describe("generateEventAssignment", () => {
	const generateExpr = (node) => {
		// Simple mock that returns the identifier name or placeholder
		if (node.type === "Identifier") return node.name;
		if (node.type === "ArrowFunctionExpression") return "() => { ... }";
		return "expr";
	};

	it("generates simple handler assignment", () => {
		const event = {
			varName: "button_1",
			eventName: "click",
			handlerExpression: { type: "Identifier", name: "handleClick" },
			isParameterized: false,
			params: [],
		};

		const result = generateEventAssignment(event, generateExpr);
		expect(result).toBe("button_1.__click = handleClick;");
	});

	it("generates parameterized handler assignment", () => {
		const event = {
			varName: "button_1",
			eventName: "click",
			handlerExpression: { type: "Identifier", name: "select" },
			isParameterized: true,
			params: [{ type: "Identifier", name: "row" }],
		};

		const result = generateEventAssignment(event, generateExpr);
		expect(result).toBe("button_1.__click = [select, row];");
	});

	it("generates assignment with multiple parameters", () => {
		const event = {
			varName: "button_1",
			eventName: "click",
			handlerExpression: { type: "Identifier", name: "update" },
			isParameterized: true,
			params: [
				{ type: "Identifier", name: "id" },
				{ type: "Identifier", name: "value" },
			],
		};

		const result = generateEventAssignment(event, generateExpr);
		expect(result).toBe("button_1.__click = [update, id, value];");
	});

	it("handles different event types", () => {
		const event = {
			varName: "input_1",
			eventName: "input",
			handlerExpression: { type: "Identifier", name: "handleInput" },
			isParameterized: false,
			params: [],
		};

		const result = generateEventAssignment(event, generateExpr);
		expect(result).toBe("input_1.__input = handleInput;");
	});
});
