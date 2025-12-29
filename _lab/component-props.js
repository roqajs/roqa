var { cloneNode } = Node.prototype;
const template = (html) => {
	const t = document.createElement("template");
	t.innerHTML = html;
	return () => cloneNode.call(t.content, true);
};
var PASSIVE_EVENTS = ["touchstart", "touchmove"];
var all_registered_events = /* @__PURE__ */ new Set();
var root_event_handles = /* @__PURE__ */ new Set();
function is_passive_event(name) {
	return PASSIVE_EVENTS.includes(name);
}
function handle_event_propagation(event) {
	const handler_element = this;
	const path = event.composedPath ? event.composedPath() : [];
	let current_target = path[0] || event.target;
	let path_idx = 0;
	const handled_at = event.__root;
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
	Object.defineProperty(event, "currentTarget", {
		configurable: true,
		get: () => current_target || handler_element.ownerDocument,
	});
	try {
		for (; current_target; ) {
			const parent_element =
				current_target.assignedSlot || current_target.parentNode || current_target.host || null;
			const delegated = current_target["__" + event.type];
			try {
				if (delegated && !current_target.disabled)
					if (Array.isArray(delegated)) {
						const [fn, ...data] = delegated;
						fn.apply(current_target, [...data, event]);
					} else delegated.call(current_target, event);
			} catch (error) {
				queueMicrotask(() => {
					throw error;
				});
			}
			if (event.cancelBubble || parent_element === handler_element || parent_element === null)
				break;
			current_target = parent_element;
		}
	} finally {
		event.__root = handler_element;
		delete event.currentTarget;
	}
}
function delegate(events) {
	for (let i = 0; i < events.length; i++) all_registered_events.add(events[i]);
	for (const fn of root_event_handles) fn(events);
}
function handle_root_events(target) {
	const registered_events = /* @__PURE__ */ new Set();
	const event_handle = (events) => {
		for (let i = 0; i < events.length; i++) {
			const event_name = events[i];
			if (registered_events.has(event_name)) continue;
			registered_events.add(event_name);
			const options = { passive: is_passive_event(event_name) };
			target.addEventListener(event_name, handle_event_propagation, options);
		}
	};
	event_handle(Array.from(all_registered_events));
	root_event_handles.add(event_handle);
	return () => {
		for (const event_name of registered_events)
			target.removeEventListener(event_name, handle_event_propagation);
		root_event_handles.delete(event_handle);
	};
}
var elementProps = /* @__PURE__ */ new WeakMap();
function setProp(element, propName, value) {
	let props = elementProps.get(element);
	if (!props) {
		props = {};
		elementProps.set(element, props);
	}
	props[propName] = value;
}
function getProps(element) {
	return elementProps.get(element) || {};
}
function defineComponent(tagName, fn) {
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
			connected(fn$1) {
				this._connectedCallbacks.push(fn$1);
			}
			disconnected(fn$1) {
				this._disconnectedCallbacks.push(fn$1);
			}
			on(eventName, handler) {
				this.addEventListener(eventName, handler, { signal: this._abortController.signal });
			}
		},
	);
	handle_root_events(document);
}
var $tmpl_1 = template("<h1> </h1><button>Read Message</button>");
var $tmpl_2 = template("<name-tag></name-tag>");
function App() {
	const name = "Rift";
	const message = () => alert("Hello! This message is from <" + this.tagName.toLowerCase() + ">");
	this.connected(() => {
		const $root_2 = $tmpl_2();
		const name_tag_1 = $root_2.firstChild;
		setProp(name_tag_1, "name", name);
		setProp(name_tag_1, "message", message);
		this.appendChild($root_2);
	});
}
function NameTag({ name, message }) {
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);
		const h1_1 = this.firstChild;
		const h1_1_text = h1_1.firstChild;
		const button_1 = h1_1.nextSibling;
		button_1.__click = message;
		h1_1_text.nodeValue = "Hello, " + name + "!";
	});
}
defineComponent("rift-app", App);
defineComponent("name-tag", NameTag);
delegate(["click"]);
