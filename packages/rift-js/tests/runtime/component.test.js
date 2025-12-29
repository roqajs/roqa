import { describe, it, expect, vi } from "vitest";
import { defineComponent, setProp, getProps } from "../../src/runtime/component.js";

/**
 * Tests for the web component runtime
 *
 * Rift compiles components to native web components (custom elements). The
 * defineComponent() function registers a custom element with lifecycle handling:
 *
 *   defineComponent('my-counter', function Counter() {
 *     this.connected(() => { ... });   // Called when mounted
 *     this.disconnected(() => { ... }); // Called when unmounted
 *     return <button>Click me</button>;
 *   });
 *
 * Props are passed between Rift components using setProp/getProps, which
 * stores data on the element without going through attributes.
 */

describe("setProp", () => {
	it("sets a prop on an element", () => {
		const el = document.createElement("div");
		setProp(el, "items", [1, 2, 3]);

		const props = getProps(el);
		expect(props.items).toEqual([1, 2, 3]);
	});

	it("overwrites existing prop", () => {
		const el = document.createElement("div");
		setProp(el, "count", 5);
		setProp(el, "count", 10);

		const props = getProps(el);
		expect(props.count).toBe(10);
	});

	it("sets multiple props on same element", () => {
		const el = document.createElement("div");
		setProp(el, "name", "test");
		setProp(el, "value", 42);

		const props = getProps(el);
		expect(props.name).toBe("test");
		expect(props.value).toBe(42);
	});
});

describe("getProps", () => {
	it("returns empty object when no props set", () => {
		const el = document.createElement("div");
		expect(getProps(el)).toEqual({});
	});

	it("merges WeakMap props with direct element properties", () => {
		const el = document.createElement("div");
		setProp(el, "weakMapProp", "from-weakmap");
		el.customProp = "from-element";

		const props = getProps(el);
		expect(props.weakMapProp).toBe("from-weakmap");
		expect(props.customProp).toBe("from-element");
	});

	it("direct props take precedence over WeakMap props", () => {
		const el = document.createElement("div");
		setProp(el, "sharedProp", "weakmap-value");
		el.sharedProp = "direct-value";

		const props = getProps(el);
		expect(props.sharedProp).toBe("direct-value");
	});

	it("excludes standard HTMLElement properties", () => {
		const el = document.createElement("div");
		el.id = "my-id";
		el.className = "my-class";
		el.title = "my-title";

		const props = getProps(el);
		expect(props.id).toBeUndefined();
		expect(props.className).toBeUndefined();
		expect(props.title).toBeUndefined();
	});

	it("excludes properties starting with underscore", () => {
		const el = document.createElement("div");
		el._privateProp = "private";
		el.publicProp = "public";

		const props = getProps(el);
		expect(props._privateProp).toBeUndefined();
		expect(props.publicProp).toBe("public");
	});
});

describe("defineComponent", () => {
	let uniqueTagCounter = 0;

	function getUniqueTagName() {
		return `test-component-${uniqueTagCounter++}-${Date.now()}`;
	}

	/**
	 * Wait for a custom element to be defined and upgraded
	 * More reliable than setTimeout(0) for custom element tests
	 */
	async function waitForUpgrade(tagName) {
		await customElements.whenDefined(tagName);
		// Allow microtask queue to flush for connectedCallback
		await new Promise((r) => queueMicrotask(r));
	}

	it("defines a custom element", () => {
		const tagName = getUniqueTagName();
		const fn = vi.fn();

		defineComponent(tagName, fn);

		expect(customElements.get(tagName)).toBeDefined();
	});

	it("does not redefine existing component", () => {
		const tagName = getUniqueTagName();
		const fn1 = vi.fn();
		const fn2 = vi.fn();

		defineComponent(tagName, fn1);
		defineComponent(tagName, fn2);

		// Only first definition should be used
		expect(customElements.get(tagName)).toBeDefined();
	});

	it("calls component function on connectedCallback", async () => {
		const tagName = getUniqueTagName();
		const fn = vi.fn();

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		// Wait for upgrade using proper custom elements API
		await waitForUpgrade(tagName);

		expect(fn).toHaveBeenCalled();

		el.remove();
	});

	it("passes props to component function", async () => {
		const tagName = getUniqueTagName();
		let receivedProps;
		const fn = function (props) {
			receivedProps = props;
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		setProp(el, "message", "Hello");
		setProp(el, "count", 42);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		expect(receivedProps.message).toBe("Hello");
		expect(receivedProps.count).toBe(42);

		el.remove();
	});

	it("provides connected callback", async () => {
		const tagName = getUniqueTagName();
		const connectedHandler = vi.fn();

		const fn = function () {
			this.connected(connectedHandler);
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		expect(connectedHandler).toHaveBeenCalled();

		el.remove();
	});

	it("provides disconnected callback", async () => {
		const tagName = getUniqueTagName();
		const disconnectedHandler = vi.fn();

		const fn = function () {
			this.disconnected(disconnectedHandler);
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);
		el.remove();

		// disconnectedCallback should be called synchronously
		await new Promise((r) => queueMicrotask(r));

		expect(disconnectedHandler).toHaveBeenCalled();
	});

	it("provides on method for event listeners", async () => {
		const tagName = getUniqueTagName();
		const handler = vi.fn();

		const fn = function () {
			this.on("custom-event", handler);
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		el.dispatchEvent(new CustomEvent("custom-event"));

		expect(handler).toHaveBeenCalled();

		el.remove();
	});

	it("on method cleans up listeners on disconnect", async () => {
		const tagName = getUniqueTagName();
		const handler = vi.fn();

		const fn = function () {
			this.on("custom-event", handler);
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		el.remove();

		// After removal, event should not be handled
		await new Promise((r) => queueMicrotask(r));
		handler.mockClear();
		el.dispatchEvent(new CustomEvent("custom-event"));

		expect(handler).not.toHaveBeenCalled();
	});

	it("provides emit method for dispatching events", async () => {
		const tagName = getUniqueTagName();
		let elementRef;

		const fn = function () {
			elementRef = this;
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		const handler = vi.fn();
		el.addEventListener("my-event", handler);

		elementRef.emit("my-event", { value: 42 });

		expect(handler).toHaveBeenCalled();
		const event = handler.mock.calls[0][0];
		expect(event.detail).toEqual({ value: 42 });

		el.remove();
	});

	it("emit supports custom bubbles and composed options", async () => {
		const tagName = getUniqueTagName();
		let elementRef;

		const fn = function () {
			elementRef = this;
		};

		defineComponent(tagName, fn);

		const container = document.createElement("div");
		const el = document.createElement(tagName);
		container.appendChild(el);
		document.body.appendChild(container);

		await waitForUpgrade(tagName);

		const handler = vi.fn();
		container.addEventListener("my-event", handler);

		// Default bubbles is true
		elementRef.emit("my-event");
		expect(handler).toHaveBeenCalled();

		handler.mockClear();

		// Emit with bubbles: false
		elementRef.emit("my-event", undefined, { bubbles: false });
		expect(handler).not.toHaveBeenCalled();

		container.remove();
	});

	it("this context is the element", async () => {
		const tagName = getUniqueTagName();
		let thisContext;

		const fn = function () {
			thisContext = this;
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		expect(thisContext).toBe(el);

		el.remove();
	});

	it("can add DOM content in component function", async () => {
		const tagName = getUniqueTagName();

		const fn = function () {
			this.innerHTML = "<span>Hello</span>";
		};

		defineComponent(tagName, fn);

		const el = document.createElement(tagName);
		document.body.appendChild(el);

		await waitForUpgrade(tagName);

		expect(el.querySelector("span").textContent).toBe("Hello");

		el.remove();
	});
});
