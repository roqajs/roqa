import { handleRootEvents } from "./events.js";

// Register event delegation once at module load
handleRootEvents(document);

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
 * Base class for Roqa components with shared methods
 */
class RoqaElement extends HTMLElement {
	_connectedCallbacks = [];
	_disconnectedCallbacks = [];
	_abortController = null;
	_attrCallbacks = null;
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
	/**
	 * Toggle a boolean attribute based on a condition.
	 * When true, the attribute is present (empty string value).
	 * When false, the attribute is removed.
	 *
	 * @param {string} name - The attribute name
	 * @param {boolean} condition - Whether the attribute should be present
	 *
	 * @example
	 * this.toggleAttr('disabled', isDisabled);
	 * // true  -> <my-element disabled>
	 * // false -> <my-element>
	 */
	toggleAttr(name, condition) {
		if (condition) {
			this.setAttribute(name, "");
		} else {
			this.removeAttribute(name);
		}
	}
	/**
	 * Set a state attribute with mutually exclusive on/off variants.
	 * Creates a pair of attributes where only one is present at a time.
	 *
	 * @param {string} name - The base attribute name
	 * @param {boolean} condition - The state value
	 *
	 * @example
	 * this.stateAttr('checked', isChecked);
	 * // true  -> <my-element checked>
	 * // false -> <my-element unchecked>
	 */
	stateAttr(name, condition) {
		const offName = "un" + name;
		if (condition) {
			this.setAttribute(name, "");
			this.removeAttribute(offName);
		} else {
			this.removeAttribute(name);
			this.setAttribute(offName, "");
		}
	}
	/**
	 * Register a callback for when an observed attribute changes.
	 * The attribute must be declared in the `observedAttributes` option of defineComponent.
	 *
	 * @param {string} name - The attribute name (must be in observedAttributes)
	 * @param {(newValue: string | null, oldValue: string | null) => void} callback - Called when attribute changes
	 *
	 * @example
	 * // In defineComponent:
	 * defineComponent("my-switch", MySwitch, { observedAttributes: ["checked"] });
	 *
	 * // In component:
	 * this.attrChanged("checked", (newValue, oldValue) => {
	 *   console.log("checked changed from", oldValue, "to", newValue);
	 * });
	 */
	attrChanged(name, callback) {
		if (!this._attrCallbacks) {
			this._attrCallbacks = new Map();
		}
		let callbacks = this._attrCallbacks.get(name);
		if (!callbacks) {
			callbacks = [];
			this._attrCallbacks.set(name, callbacks);
		}
		callbacks.push(callback);
	}
}

/**
 * Define a custom element component.
 *
 * @param {string} tagName - The custom element tag name (must contain a hyphen)
 * @param {Function} fn - The component function
 * @param {Object} [options] - Optional configuration
 * @param {string[]} [options.observedAttributes] - Attributes to observe for changes
 * @param {boolean} [options.formAssociated] - Whether the element participates in form submission
 */
export function defineComponent(tagName, fn, options = {}) {
	if (customElements.get(tagName)) return;
	const observedAttrs = options.observedAttributes || [];
	const formAssociated = options.formAssociated || false;

	customElements.define(
		tagName,
		class extends RoqaElement {
			static get observedAttributes() {
				return observedAttrs;
			}
			static get formAssociated() {
				return formAssociated;
			}
			constructor() {
				super();
				// Initialize ElementInternals for form-associated elements
				if (formAssociated) {
					this.internals = this.attachInternals();
				}
			}
			connectedCallback() {
				const props = getProps(this);
				fn.call(this, props);
				const cbs = this._connectedCallbacks;
				for (let i = 0; i < cbs.length; i++) {
					const cleanup = cbs[i]();
					if (typeof cleanup === "function") {
						this._disconnectedCallbacks.push(cleanup);
					}
				}
			}
			disconnectedCallback() {
				const cbs = this._disconnectedCallbacks;
				for (let i = 0; i < cbs.length; i++) cbs[i]();
				if (this._abortController) this._abortController.abort();
			}
			attributeChangedCallback(name, oldValue, newValue) {
				// Only fire callbacks if value actually changed
				if (oldValue === newValue) return;
				const callbacks = this._attrCallbacks?.get(name);
				if (callbacks) {
					for (let i = 0; i < callbacks.length; i++) {
						callbacks[i](newValue, oldValue);
					}
				}
			}
			// Form-associated lifecycle callbacks
			formResetCallback() {
				// Dispatch event so components can handle form reset
				this.dispatchEvent(new Event("form-reset"));
			}
			formDisabledCallback(disabled) {
				// Dispatch event so components can handle form disabled state
				this.dispatchEvent(new CustomEvent("form-disabled", { detail: { disabled } }));
			}
			formStateRestoreCallback(state, mode) {
				// Dispatch event so components can restore form state
				this.dispatchEvent(new CustomEvent("form-state-restore", { detail: { state, mode } }));
			}
		},
	);
}
