// ============================================
// Component definition primitive
// ============================================

import { handle_root_events } from './events.js';

export function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(
		tagName,
		class extends HTMLElement {
			_connectedCallbacks = new Set();
			connectedCallback() {
				fn.call(this);
				for (const callback of this._connectedCallbacks) callback();
			}
			connected(fn) {
				this._connectedCallbacks.add(fn);
			}
		}
	);
	handle_root_events(document);
}
