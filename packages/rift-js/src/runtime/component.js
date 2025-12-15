// ============================================
// Component definition primitive
// ============================================

import { handle_root_events } from './events.js';

// WeakMap to store props for elements before they're upgraded
const elementProps = new WeakMap();

// Set of known element property names to exclude when collecting props
const EXCLUDED_PROPS = new Set([
	// Standard HTMLElement properties
	'accessKey',
	'autocapitalize',
	'autofocus',
	'className',
	'contentEditable',
	'dir',
	'draggable',
	'enterKeyHint',
	'hidden',
	'id',
	'inert',
	'innerText',
	'inputMode',
	'lang',
	'nonce',
	'outerText',
	'popover',
	'spellcheck',
	'style',
	'tabIndex',
	'title',
	'translate',
	// Common DOM properties
	'innerHTML',
	'outerHTML',
	'textContent',
	'nodeValue',
	// Internal Rift properties
	'_connectedCallbacks',
	'_disconnectedCallbacks',
	'_abortController',
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
	const weakMapProps = elementProps.get(element) || {};

	// Collect own properties set directly on the element (not inherited)
	const directProps = {};
	for (const key of Object.keys(element)) {
		if (!EXCLUDED_PROPS.has(key) && !key.startsWith('_')) {
			directProps[key] = element[key];
		}
	}

	// Direct props take precedence (they're set closer to usage time)
	return { ...weakMapProps, ...directProps };
}

export function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(
		tagName,
		class extends HTMLElement {
			_connectedCallbacks = [];
			_disconnectedCallbacks = [];
			_abortController;
			connectedCallback() {
				this._abortController = new AbortController();
				const props = getProps(this);
				fn.call(this, props);
				if (this._connectedCallbacks) for (const cb of this._connectedCallbacks) cb();
			}
			disconnectedCallback() {
				if (this._disconnectedCallbacks) for (const cb of this._disconnectedCallbacks) cb();
				this._abortController.abort();
			}
			connected(fn) {
				this._connectedCallbacks.push(fn);
			}
			disconnected(fn) {
				this._disconnectedCallbacks.push(fn);
			}
			on(eventName, handler) {
				this.addEventListener(eventName, handler, { signal: this._abortController.signal });
			}
			emit(eventName, detail = undefined, options = {}) {
				const { bubbles = true, composed = false } = options;
				this.dispatchEvent(new CustomEvent(eventName, { detail, bubbles, composed }));
			}
		}
	);
	handle_root_events(document);
}
