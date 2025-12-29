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

// Touch events should be passive for scroll performance
const PASSIVE_EVENTS = new Set(["touchstart", "touchmove"]);

// Global registry of event types that need delegation (e.g., "click", "input")
const all_registered_events = new Set();

// Callbacks to notify when new event types are registered
const root_event_handles = new Set();

/**
 * Core delegation handler - attached to document/shadow roots.
 * Walks the composed path manually to find and invoke __eventname handlers.
 */
function handle_event_propagation(event) {
	const handler_element = this; // The root we're attached to (document or shadow root)
	const path = event.composedPath();
	let current_target = path[0] || event.target;
	let path_idx = 0;
	const handled_at = event.__root;

	// Prevent double-handling when event crosses shadow boundaries.
	// __root marks where we've already processed this event.
	if (handled_at) {
		const at_idx = path.indexOf(handled_at);
		if (at_idx !== -1 && handler_element === document) {
			event.__root = handler_element;
			return;
		}
		const handler_idx = path.indexOf(handler_element);
		if (handler_idx === -1) return;
		if (at_idx <= handler_idx) path_idx = at_idx;
	}

	if ((current_target = path[path_idx] || event.target) === handler_element) return;

	// Override currentTarget to reflect the element we're currently processing
	Object.defineProperty(event, "currentTarget", {
		configurable: true,
		get: () => current_target || handler_element.ownerDocument,
	});

	const eventKey = "__" + event.type;

	try {
		// Walk up the DOM tree, checking each element for a delegated handler
		for (; current_target; ) {
			const parent_element =
				current_target.assignedSlot || current_target.parentNode || current_target.host || null;
			const delegated = current_target[eventKey];
			try {
				if (delegated && !current_target.disabled) {
					if (Array.isArray(delegated)) {
						// Array form: [fn, ...args] - used in loops to avoid closures
						const fn = delegated[0];
						const len = delegated.length;
						// Optimized paths for common arities (1-3 args + event)
						if (len === 2) {
							fn.call(current_target, delegated[1], event);
						} else if (len === 3) {
							fn.call(current_target, delegated[1], delegated[2], event);
						} else if (len === 4) {
							fn.call(current_target, delegated[1], delegated[2], delegated[3], event);
						} else {
							// Fallback for rare cases with many args
							const args = [];
							for (let i = 1; i < len; i++) args.push(delegated[i]);
							args.push(event);
							fn.apply(current_target, args);
						}
					} else {
						// Simple form: a function
						delegated.call(current_target, event);
					}
				}
			} catch (error) {
				// Don't let handler errors break propagation - report async
				queueMicrotask(() => {
					throw error;
				});
			}
			// Stop if propagation was cancelled or we've reached the root
			if (event.cancelBubble || parent_element === handler_element || parent_element === null) {
				break;
			}
			current_target = parent_element;
		}
	} finally {
		event.__root = handler_element;
		delete event.currentTarget;
	}
}

/**
 * Register event types for delegation. Called by compiled code.
 * e.g., delegate(["click", "input"]) at the end of a component file.
 */
export function delegate(events) {
	for (let i = 0; i < events.length; i++) {
		all_registered_events.add(events[i]);
	}
	// Notify all registered roots (document + any shadow roots) about new events
	for (const fn of root_event_handles) {
		fn(events);
	}
}

// Track which roots already have delegation set up
const handled_roots = new WeakSet();

/**
 * Set up event delegation on a root element (document or shadow root).
 * Called once per root. Returns a cleanup function.
 */
export function handle_root_events(target) {
	if (handled_roots.has(target)) return;
	handled_roots.add(target);

	const controller = new AbortController();
	const registered_events = new Set();

	// Handler to add listeners for new event types
	const event_handle = (events) => {
		for (const event_name of events) {
			if (registered_events.has(event_name)) continue;
			registered_events.add(event_name);
			target.addEventListener(event_name, handle_event_propagation, {
				passive: PASSIVE_EVENTS.has(event_name),
				signal: controller.signal,
			});
		}
	};

	// Register for already-known events and future ones
	event_handle(all_registered_events);
	root_event_handles.add(event_handle);

	// Cleanup: Abort removes all listeners, then unregister from future events
	return () => {
		controller.abort();
		root_event_handles.delete(event_handle);
	};
}
