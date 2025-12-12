// ============================================
// Component definition primitive
// ============================================

import { handle_root_events } from './events.js';

export function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(
		tagName,
		class extends HTMLElement {
			_connectedCallback;
			connectedCallback() {
				fn.call(this);
				if (this._connectedCallback) this._connectedCallback();
			}
			connected(fn) {
				this._connectedCallback = fn;
			}
		}
	);
	handle_root_events(document);
}
