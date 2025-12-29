import { handle_root_events } from "./events.js";

// Register event delegation once at module load
handle_root_events(document);

// WeakMap to store props for elements before they're upgraded
const elementProps = new WeakMap();

// Set of known element property names to exclude when collecting props
const EXCLUDED_PROPS = new Set([
	// Standard HTMLElement properties
	"accessKey",
	"autocapitalize",
	"autofocus",
	"className",
	"contentEditable",
	"dir",
	"draggable",
	"enterKeyHint",
	"hidden",
	"id",
	"inert",
	"innerText",
	"inputMode",
	"lang",
	"nonce",
	"outerText",
	"popover",
	"spellcheck",
	"style",
	"tabIndex",
	"title",
	"translate",
	// Common DOM properties
	"innerHTML",
	"outerHTML",
	"textContent",
	"nodeValue",
]);

/**
 * Set a prop on an element (works before or after upgrade)
 */
export function setProp(element, propName, value) {
	let props = elementProps.get(element);
	if (!props) {
		props = {};
		elementProps.set(element, props);
	}
	props[propName] = value;
}

/**
 * Get all props for an element
 * Merges props from WeakMap with any properties set directly on the element
 */
export function getProps(element) {
	const weakMapProps = elementProps.get(element);
	const ownKeys = Object.keys(element);
	// Fast path: No props at all
	if (!weakMapProps && ownKeys.length === 0) return {};
	// Collect own properties set directly on the element (not inherited)
	const directProps = {};
	for (let i = 0; i < ownKeys.length; i++) {
		const key = ownKeys[i];
		if (!EXCLUDED_PROPS.has(key) && key[0] !== "_") {
			directProps[key] = element[key];
		}
	}
	// Direct props take precedence (they're set closer to usage time)
	return weakMapProps ? { ...weakMapProps, ...directProps } : directProps;
}

/**
 * Base class for Rift components with shared methods
 */
class RiftElement extends HTMLElement {
	_connectedCallbacks = [];
	_disconnectedCallbacks = [];
	_abortController = null;
	connected(fn) {
		this._connectedCallbacks.push(fn);
	}
	disconnected(fn) {
		this._disconnectedCallbacks.push(fn);
	}
	on(eventName, handler) {
		// Lazy initialization of AbortController
		if (!this._abortController) {
			this._abortController = new AbortController();
		}
		this.addEventListener(eventName, handler, { signal: this._abortController.signal });
	}
	emit(eventName, detail = undefined, options = {}) {
		const { bubbles = true, composed = false } = options;
		this.dispatchEvent(new CustomEvent(eventName, { detail, bubbles, composed }));
	}
}

export function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(
		tagName,
		class extends RiftElement {
			connectedCallback() {
				const props = getProps(this);
				fn.call(this, props);
				const cbs = this._connectedCallbacks;
				for (let i = 0; i < cbs.length; i++) cbs[i]();
			}
			disconnectedCallback() {
				const cbs = this._disconnectedCallbacks;
				for (let i = 0; i < cbs.length; i++) cbs[i]();
				if (this._abortController) this._abortController.abort();
			}
		},
	);
}
