// ============================================
// Component definition primitive
// ============================================

import { handle_root_events } from './events.js';

// WeakMap to store props for elements before they're upgraded
const elementProps = new WeakMap();

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
 */
export function getProps(element) {
	return elementProps.get(element) || {};
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
				// Get props from WeakMap
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
		}
	);
	handle_root_events(document);
}
