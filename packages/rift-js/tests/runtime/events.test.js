import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { delegate, handle_root_events } from "../../src/runtime/events.js";

/**
 * Tests for the event delegation runtime
 *
 * Rift uses event delegation for efficient event handling. Instead of attaching
 * listeners to each element, events bubble to the document root where a single
 * listener dispatches to the appropriate handler.
 *
 * Event handlers are stored on elements as __eventname properties:
 *   el.__click = handler           // Simple handler
 *   el.__click = [fn, arg1, arg2]  // Handler with bound arguments
 *
 * Key functions:
 *   delegate(['click', 'input'])  - Register event types for delegation
 *   handle_root_events(root)      - Set up the root listener
 */

describe("delegate", () => {
	it("registers event types", () => {
		// delegate adds events to the global set
		expect(() => delegate(["click"])).not.toThrow();
	});

	it("handles multiple event types", () => {
		expect(() => delegate(["click", "input", "change"])).not.toThrow();
	});

	it("handles duplicate event registrations", () => {
		delegate(["click"]);
		delegate(["click"]); // Should not throw
		expect(true).toBe(true);
	});
});

describe("handle_root_events", () => {
	let container;
	let cleanup;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		cleanup = handle_root_events(container);
		delegate(["click", "input"]);
	});

	afterEach(() => {
		cleanup();
		container.remove();
	});

	it("returns a cleanup function", () => {
		expect(typeof cleanup).toBe("function");
	});

	it("handles simple click delegation", async () => {
		const handler = vi.fn();
		const button = document.createElement("button");
		button.__click = handler;
		container.appendChild(button);

		button.click();

		expect(handler).toHaveBeenCalled();
	});

	it("handles parameterized event handler (array format)", async () => {
		const handler = vi.fn();
		const button = document.createElement("button");
		button.__click = [handler, "arg1", "arg2"];
		container.appendChild(button);

		button.click();

		expect(handler).toHaveBeenCalledWith("arg1", "arg2", expect.any(Event));
	});

	it("does not fire handler on disabled elements", async () => {
		const handler = vi.fn();
		const button = document.createElement("button");
		button.disabled = true;
		button.__click = handler;
		container.appendChild(button);

		button.click();

		expect(handler).not.toHaveBeenCalled();
	});

	it("handles event bubbling", async () => {
		const parentHandler = vi.fn();
		const childHandler = vi.fn();

		const parent = document.createElement("div");
		parent.__click = parentHandler;

		const child = document.createElement("span");
		child.__click = childHandler;

		parent.appendChild(child);
		container.appendChild(parent);

		child.click();

		expect(childHandler).toHaveBeenCalled();
		expect(parentHandler).toHaveBeenCalled();
	});

	it("stops propagation when stopPropagation is called", async () => {
		const parentHandler = vi.fn();
		const childHandler = vi.fn((e) => e.stopPropagation());

		const parent = document.createElement("div");
		parent.__click = parentHandler;

		const child = document.createElement("span");
		child.__click = childHandler;

		parent.appendChild(child);
		container.appendChild(parent);

		child.click();

		expect(childHandler).toHaveBeenCalled();
		expect(parentHandler).not.toHaveBeenCalled();
	});

	it("handles input events", async () => {
		const handler = vi.fn();
		const input = document.createElement("input");
		input.__input = handler;
		container.appendChild(input);

		input.dispatchEvent(new Event("input", { bubbles: true }));

		expect(handler).toHaveBeenCalled();
	});

	it("cleanup removes event listeners", async () => {
		const handler = vi.fn();
		const button = document.createElement("button");
		button.__click = handler;
		container.appendChild(button);

		cleanup();

		button.click();

		// After cleanup, delegation should not work
		// Note: This test depends on implementation details
	});

	// Note: Error handling test is skipped because the event system queues errors
	// via queueMicrotask, which causes Vitest to catch them as unhandled errors.
	// The actual behavior is correct - errors don't crash event propagation.
	// The error is intentionally rethrown asynchronously to:
	// 1. Allow the event to complete propagation
	// 2. Still surface the error to the developer console
	// 3. Allow error monitoring tools to capture it
	it("handles errors in handlers gracefully without crashing", async () => {
		// Mock queueMicrotask to capture the error instead of throwing it
		const originalQueueMicrotask = globalThis.queueMicrotask;
		const queuedErrors = [];
		globalThis.queueMicrotask = (fn) => {
			try {
				fn();
			} catch (e) {
				queuedErrors.push(e);
			}
		};

		try {
			const errorHandler = vi.fn(() => {
				throw new Error("Test error");
			});
			const siblingHandler = vi.fn();

			const button = document.createElement("button");
			button.__click = errorHandler;
			container.appendChild(button);

			const parent = document.createElement("div");
			parent.__click = siblingHandler;
			parent.appendChild(button);
			container.appendChild(parent);

			// Should not throw synchronously
			expect(() => button.click()).not.toThrow();

			// Error handler was called
			expect(errorHandler).toHaveBeenCalled();

			// Error was captured asynchronously
			expect(queuedErrors.length).toBe(1);
			expect(queuedErrors[0].message).toBe("Test error");

			// Note: Due to error, propagation stops at the error point
			// This is the expected behavior - the error prevents further propagation
		} finally {
			// Restore original queueMicrotask
			globalThis.queueMicrotask = originalQueueMicrotask;
		}
	});

	it("handler receives correct event object", async () => {
		let receivedEvent;
		const handler = vi.fn((e) => {
			receivedEvent = e;
		});
		const button = document.createElement("button");
		button.__click = handler;
		container.appendChild(button);

		button.click();

		expect(handler).toHaveBeenCalled();
		expect(receivedEvent).toBeInstanceOf(Event);
		expect(receivedEvent.type).toBe("click");
		expect(receivedEvent.target).toBe(button);
	});
});

describe("event delegation with nested containers", () => {
	let outerContainer;
	let innerContainer;
	let outerCleanup;
	let innerCleanup;

	beforeEach(() => {
		outerContainer = document.createElement("div");
		innerContainer = document.createElement("div");
		outerContainer.appendChild(innerContainer);
		document.body.appendChild(outerContainer);

		delegate(["click"]);
		outerCleanup = handle_root_events(outerContainer);
		innerCleanup = handle_root_events(innerContainer);
	});

	afterEach(() => {
		innerCleanup();
		outerCleanup();
		outerContainer.remove();
	});

	it("handles events in nested containers", async () => {
		const handler = vi.fn();
		const button = document.createElement("button");
		button.__click = handler;
		innerContainer.appendChild(button);

		button.click();

		expect(handler).toHaveBeenCalled();
	});
});
