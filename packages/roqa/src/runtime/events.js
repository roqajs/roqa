// Event delegation primitives
//
// Instead of attaching listeners to every element, we attach one listener
// per event type to the document (or shadow root). When an event fires, we
// walk up the DOM path looking for elements with __eventname properties.
//
// Handlers are stored as:
//   - __click = fn                -> fn.call(element, event)
//   - __click = [fn, arg1, arg2]  -> fn.call(element, arg1, arg2, event)
//
// The array form avoids closure allocation in loops (e.g., <For> items).
//
// Heavily based on Ripple's event delegation system: https://github.com/Ripple-TS/ripple/blob/main/packages/ripple/src/runtime/internal/client/events.js

// Touch events should be passive for scroll performance
const PASSIVE_EVENTS = new Set(["touchstart", "touchmove"]);

// Global registry of event types that need delegation (e.g., "click", "input")
const allRegisteredEvents = new Set();

// Callbacks to notify when new event types are registered
const rootEventHandles = new Set();

/**
 * Core delegation handler - attached to document/shadow roots.
 * Walks the composed path manually to find and invoke __eventname handlers.
 */
function handleEventPropagation(event) {
	const handlerElement = this; // The root we're attached to (document or shadow root)
	const path = event.composedPath();
	let currentTarget = path[0] || event.target;
	let pathIdx = 0;
	const handledAt = event.__root;

	// Prevent double-handling when event crosses shadow boundaries.
	// __root marks where we've already processed this event.
	if (handledAt) {
		const atIdx = path.indexOf(handledAt);
		if (atIdx !== -1 && handlerElement === document) {
			event.__root = handlerElement;
			return;
		}
		const handlerIdx = path.indexOf(handlerElement);
		if (handlerIdx === -1) return;
		if (atIdx <= handlerIdx) pathIdx = atIdx;
	}

	if ((currentTarget = path[pathIdx] || event.target) === handlerElement) return;

	// Override currentTarget to reflect the element we're currently processing
	Object.defineProperty(event, "currentTarget", {
		configurable: true,
		get: () => currentTarget || handlerElement.ownerDocument,
	});

	const eventKey = "__" + event.type;

	try {
		// Walk up the DOM tree, checking each element for a delegated handler
		for (; currentTarget; ) {
			const parentElement =
				currentTarget.assignedSlot || currentTarget.parentNode || currentTarget.host || null;
			const delegated = currentTarget[eventKey];
			try {
				if (delegated && !currentTarget.disabled) {
					if (Array.isArray(delegated)) {
						// Array form: [fn, ...args] - used in loops to avoid closures
						const fn = delegated[0];
						const len = delegated.length;
						// Optimized paths for common arities (1-3 args + event)
						if (len === 2) {
							fn.call(currentTarget, delegated[1], event);
						} else if (len === 3) {
							fn.call(currentTarget, delegated[1], delegated[2], event);
						} else if (len === 4) {
							fn.call(currentTarget, delegated[1], delegated[2], delegated[3], event);
						} else {
							// Fallback for rare cases with many args
							const args = [];
							for (let i = 1; i < len; i++) args.push(delegated[i]);
							args.push(event);
							fn.apply(currentTarget, args);
						}
					} else {
						// Simple form: a function
						delegated.call(currentTarget, event);
					}
				}
			} catch (error) {
				// Don't let handler errors break propagation - report async
				queueMicrotask(() => {
					throw error;
				});
			}
			// Stop if propagation was cancelled or we've reached the root
			if (event.cancelBubble || parentElement === handlerElement || parentElement === null) {
				break;
			}
			currentTarget = parentElement;
		}
	} finally {
		event.__root = handlerElement;
		delete event.currentTarget;
	}
}

/**
 * Register event types for delegation. Called by compiled code.
 * e.g., delegate(["click", "input"]) at the end of a component file.
 */
export function delegate(events) {
	for (let i = 0; i < events.length; i++) {
		allRegisteredEvents.add(events[i]);
	}
	// Notify all registered roots (document + any shadow roots) about new events
	for (const fn of rootEventHandles) {
		fn(events);
	}
}

// Track which roots already have delegation set up
const handledRoots = new WeakSet();

/**
 * Set up event delegation on a root element (document or shadow root).
 * Called once per root. Returns a cleanup function.
 */
export function handleRootEvents(target) {
	if (handledRoots.has(target)) return;
	handledRoots.add(target);

	const controller = new AbortController();
	const registeredEvents = new Set();

	// Handler to add listeners for new event types
	const eventHandle = (events) => {
		for (const eventName of events) {
			if (registeredEvents.has(eventName)) continue;
			registeredEvents.add(eventName);
			target.addEventListener(eventName, handleEventPropagation, {
				passive: PASSIVE_EVENTS.has(eventName),
				signal: controller.signal,
			});
		}
	};

	// Register for already-known events and future ones
	eventHandle(allRegisteredEvents);
	rootEventHandles.add(eventHandle);

	// Cleanup: Abort removes all listeners, then unregister from future events
	return () => {
		controller.abort();
		rootEventHandles.delete(eventHandle);
	};
}
