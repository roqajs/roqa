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
		get: () => current_target || handler_element.ownerDocument
	});
	try {
		for (; current_target;) {
			const parent_element = current_target.assignedSlot || current_target.parentNode || current_target.host || null;
			const delegated = current_target["__" + event.type];
			try {
				if (delegated && !current_target.disabled) if (Array.isArray(delegated)) {
					const [fn, ...data] = delegated;
					fn.apply(current_target, [...data, event]);
				} else delegated.call(current_target, event);
			} catch (error) {
				queueMicrotask(() => {
					throw error;
				});
			}
			if (event.cancelBubble || parent_element === handler_element || parent_element === null) break;
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
		for (const event_name of registered_events) target.removeEventListener(event_name, handle_event_propagation);
		root_event_handles.delete(event_handle);
	};
}
var elementProps = /* @__PURE__ */ new WeakMap();
function getProps(element) {
	return elementProps.get(element) || {};
}
function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(tagName, class extends HTMLElement {
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
	});
	handle_root_events(document);
}
var $tmpl_1 = template("<input type=\"text\" placeholder=\"Destination\"><select><option value=\"one-way\">One-way</option><option value=\"round-trip\">Round-trip</option></select><input type=\"date\"><input type=\"date\"><button>Book</button><p>Return date must be after departure date.</p><p>Please choose a destination.</p>");
function pad(n, s = String(n)) {
	return s.length < 2 ? `0${s}` : s;
}
function dateToString(date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function stringToDate(str) {
	const [y, m, d] = str.split("-");
	return new Date(+y, m - 1, +d);
}
function FlightBooker() {
	const today = dateToString(/* @__PURE__ */ new Date());
	const destination = {
		v: "El Dorado",
		e: []
	};
	const tripType = {
		v: "one-way",
		e: []
	};
	const departDate = {
		v: today,
		e: []
	};
	const returnDate = {
		v: today,
		e: []
	};
	const returnDateDisabled = {
		v: true,
		e: []
	};
	const bookDisabled = {
		v: false,
		e: []
	};
	const showDateError = {
		v: false,
		e: []
	};
	const showDestinationError = {
		v: false,
		e: []
	};
	const isRoundTrip = () => tripType.v === "round-trip";
	const hasDestination = () => destination.v !== "";
	const canBook = () => !isRoundTrip() || stringToDate(returnDate.v) >= stringToDate(departDate.v);
	const updateDestination = (e) => {
		destination.v = e.target.value;
		destination.ref_1.value = destination.v;
		checkForErrors();
	};
	const updateTripType = (e) => {
		tripType.v = e.target.value;
		tripType.ref_1.value = tripType.v;
		checkForErrors();
	};
	const updateDepartDate = (e) => {
		departDate.v = e.target.value;
		departDate.ref_1.value = departDate.v;
		checkForErrors();
	};
	const updateReturnDate = (e) => {
		returnDate.v = e.target.value;
		for (let i = 0; i < returnDate.e.length; i++) returnDate.e[i](returnDate.v);
		checkForErrors();
	};
	const checkForErrors = () => {
		returnDateDisabled.v = !isRoundTrip();
		returnDateDisabled.ref_1.disabled = returnDateDisabled.v;
		bookDisabled.v = !canBook() || !hasDestination();
		bookDisabled.ref_1.disabled = bookDisabled.v;
		showDateError.v = !canBook();
		showDateError.ref_1.className = showDateError.v ? "error visible" : "error";
		showDestinationError.v = !hasDestination();
		showDestinationError.ref_1.className = showDestinationError.v ? "error visible" : "error";
	};
	const bookTrip = () => {
		const message = isRoundTrip() ? `You booked a round-trip to ${destination.v} leaving on ${departDate.v} and returning on ${returnDate.v}.` : `You booked a one-way flight to ${destination.v} leaving on ${departDate.v}.`;
		alert(message);
	};
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);
		const input_1 = this.firstChild;
		const select_1 = input_1.nextSibling;
		const input_2 = select_1.nextSibling;
		const input_3 = input_2.nextSibling;
		const button_1 = input_3.nextSibling;
		const p_1 = button_1.nextSibling;
		const p_2 = p_1.nextSibling;
		input_1.__input = updateDestination;
		select_1.__change = updateTripType;
		input_2.__change = updateDepartDate;
		input_3.__change = updateReturnDate;
		button_1.__click = bookTrip;
		input_1.value = destination.v;
		destination.ref_1 = input_1;
		select_1.value = tripType.v;
		tripType.ref_1 = select_1;
		input_2.value = departDate.v;
		departDate.ref_1 = input_2;
		input_3.value = returnDate.v;
		returnDate.ref_1 = input_3;
		input_3.disabled = returnDateDisabled.v;
		returnDateDisabled.ref_1 = input_3;
		button_1.disabled = bookDisabled.v;
		bookDisabled.ref_1 = button_1;
		p_1.className = showDateError.v ? "error visible" : "error";
		showDateError.ref_1 = p_1;
		p_2.className = showDestinationError.v ? "error visible" : "error";
		showDestinationError.ref_1 = p_2;
	});
}
defineComponent("flight-booker", FlightBooker);
delegate([
	"input",
	"change",
	"click"
]);
