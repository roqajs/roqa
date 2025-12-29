var { cloneNode } = Node.prototype;
const template = (html) => {
	const t = document.createElement("template");
	t.innerHTML = html;
	return () => cloneNode.call(t.content, true);
};
const bind = (cell, fn) => {
	cell.e.push(fn);
	return () => {
		const idx = cell.e.indexOf(fn);
		if (idx > -1) cell.e.splice(idx, 1);
	};
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
function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(
		tagName,
		class extends HTMLElement {
			_connectedCallback;
			connectedCallback() {
				fn.call(this);
				if (this._connectedCallback) this._connectedCallback();
			}
			connected(fn$1) {
				this._connectedCallback = fn$1;
			}
		},
	);
	handle_root_events(document);
}
var lis_result;
var lis_p;
var lis_max_len = 0;
function lis_algorithm(arr) {
	let arrI = 0,
		i = 0,
		j = 0,
		k = 0,
		u = 0,
		v = 0,
		c = 0;
	const len = arr.length;
	if (len > lis_max_len) {
		lis_max_len = len;
		lis_result = new Int32Array(len);
		lis_p = new Int32Array(len);
	}
	while (i < len) {
		arrI = arr[i];
		if (arrI !== 0) {
			j = lis_result[k];
			if (arr[j] < arrI) {
				lis_p[i] = j;
				lis_result[++k] = i;
				i++;
				continue;
			}
			u = 0;
			v = k;
			while (u < v) {
				c = (u + v) >> 1;
				if (arr[lis_result[c]] < arrI) u = c + 1;
				else v = c;
			}
			if (arrI < arr[lis_result[u]]) {
				if (u > 0) lis_p[i] = lis_result[u - 1];
				lis_result[u] = i;
			}
		}
		i++;
	}
	u = k + 1;
	const seq = new Int32Array(u);
	v = lis_result[u - 1];
	while (u-- > 0) {
		seq[u] = v;
		v = lis_p[v];
		lis_result[u] = 0;
	}
	return seq;
}
function get_next_sibling(node) {
	return node.nextSibling;
}
function create_item(anchor, value, index, render_fn) {
	return {
		s: render_fn(anchor, value, index),
		v: value,
	};
}
function move_item(item, anchor) {
	const state = item.s;
	let node = state.start;
	const end = state.end;
	if (node !== end)
		while (node !== null) {
			const next_node = get_next_sibling(node);
			anchor.before(node);
			if (next_node === end) {
				anchor.before(end);
				break;
			}
			node = next_node;
		}
	else anchor.before(node);
}
function destroy_item(item) {
	const state = item.s;
	let node = state.start;
	const end = state.end;
	if (state.cleanup) state.cleanup();
	while (node !== null) {
		const next = get_next_sibling(node);
		node.remove();
		if (node === end) break;
		node = next;
	}
}
function reconcile_fast_clear(anchor, for_state, array) {
	const parent_node = anchor.parentNode;
	parent_node.textContent = "";
	parent_node.append(anchor);
	for_state.array = array;
	for_state.items = [];
}
function reconcile_by_ref(anchor, for_state, b, render_fn) {
	let a_start = 0,
		b_start = 0,
		a_left = 0,
		b_left = 0,
		sources = new Int32Array(0),
		moved = false,
		pos = 0,
		patched = 0,
		i = 0,
		j = 0;
	const a = for_state.array;
	const a_length = a.length;
	const b_length = b.length;
	if (b_length !== 0) {
		const b_items = Array(b_length);
		if (a_length === 0) {
			for (; j < b_length; j++) b_items[j] = create_item(anchor, b[j], j, render_fn);
			for_state.array = b;
			for_state.items = b_items;
			return;
		}
		const a_items = for_state.items;
		let a_val = a[j];
		let b_val = b[j];
		let a_end = a_length - 1;
		let b_end = b_length - 1;
		outer: {
			while (a_val === b_val) {
				a[j] = b_val;
				b_items[j] = a_items[j];
				if (++j > a_end || j > b_end) break outer;
				a_val = a[j];
				b_val = b[j];
			}
			a_val = a[a_end];
			b_val = b[b_end];
			while (a_val === b_val) {
				a[a_end] = b_val;
				b_items[b_end] = a_items[a_end];
				b_end--;
				if (j > --a_end || j > b_end) break outer;
				a_val = a[a_end];
				b_val = b[b_end];
			}
		}
		let fast_path_removal = false;
		let target;
		if (j > a_end) {
			if (j <= b_end)
				while (j <= b_end) {
					b_val = b[j];
					target = j >= a_length ? anchor : a_items[j].s.start;
					b_items[j] = create_item(target, b_val, j, render_fn);
					j++;
				}
		} else if (j > b_end) while (j <= a_end) destroy_item(a_items[j++]);
		else {
			a_start = j;
			b_start = j;
			a_left = a_end - j + 1;
			b_left = b_end - j + 1;
			sources = new Int32Array(b_left + 1);
			moved = false;
			pos = 0;
			patched = 0;
			i = 0;
			fast_path_removal = a_left === a_length;
			if (b_length < 4 || (a_left | b_left) < 32)
				for (i = a_start; i <= a_end; ++i) {
					a_val = a[i];
					if (patched < b_left) {
						for (j = b_start; j <= b_end; j++)
							if (a_val === (b_val = b[j])) {
								sources[j - b_start] = i + 1;
								if (fast_path_removal) {
									fast_path_removal = false;
									while (a_start < i) destroy_item(a_items[a_start++]);
								}
								if (pos > j) moved = true;
								else pos = j;
								b_items[j] = a_items[i];
								++patched;
								break;
							}
						if (!fast_path_removal && j > b_end) destroy_item(a_items[i]);
					} else if (!fast_path_removal) destroy_item(a_items[i]);
				}
			else {
				const map = /* @__PURE__ */ new Map();
				for (i = b_start; i <= b_end; ++i) map.set(b[i], i);
				for (i = a_start; i <= a_end; ++i) {
					a_val = a[i];
					if (patched < b_left) {
						j = map.get(a_val);
						if (j !== void 0) {
							if (fast_path_removal) {
								fast_path_removal = false;
								while (i > a_start) destroy_item(a_items[a_start++]);
							}
							sources[j - b_start] = i + 1;
							if (pos > j) moved = true;
							else pos = j;
							b_items[j] = a_items[i];
							++patched;
						} else if (!fast_path_removal) destroy_item(a_items[i]);
					} else if (!fast_path_removal) destroy_item(a_items[i]);
				}
			}
			if (fast_path_removal) {
				reconcile_fast_clear(anchor, for_state, []);
				reconcile_by_ref(anchor, for_state, b, render_fn);
				return;
			}
			if (moved) {
				let next_pos = 0;
				const seq = lis_algorithm(sources);
				j = seq.length - 1;
				for (i = b_left - 1; i >= 0; i--) {
					pos = i + b_start;
					next_pos = pos + 1;
					target = next_pos < b_length ? b_items[next_pos].s.start : anchor;
					if (sources[i] === 0) {
						b_val = b[pos];
						b_items[pos] = create_item(target, b_val, pos, render_fn);
					} else if (j < 0 || i !== seq[j]) move_item(b_items[pos], target);
					else j--;
				}
			} else if (patched !== b_left) {
				for (i = b_left - 1; i >= 0; i--)
					if (sources[i] === 0) {
						pos = i + b_start;
						b_val = b[pos];
						const next_pos = pos + 1;
						target = next_pos < b_length ? b_items[next_pos].s.start : anchor;
						b_items[pos] = create_item(target, b_val, pos, render_fn);
					}
			}
		}
		for_state.array = b;
		for_state.items = b_items;
	} else if (a_length > 0) reconcile_fast_clear(anchor, for_state, b);
}
function for_block(container, source_cell, render_fn) {
	const anchor = document.createTextNode("");
	container.appendChild(anchor);
	const for_state = {
		array: [],
		items: [],
	};
	const do_update = () => {
		const collection = source_cell.v;
		reconcile_by_ref(
			anchor,
			for_state,
			Array.isArray(collection) ? collection : collection == null ? [] : Array.from(collection),
			render_fn,
		);
	};
	const unsubscribe = bind(source_cell, do_update);
	do_update();
	const destroy = () => {
		unsubscribe();
		const items = for_state.items;
		for (let i = 0; i < items.length; i++) destroy_item(items[i]);
		for_state.array = [];
		for_state.items = [];
		anchor.remove();
	};
	return {
		update: do_update,
		destroy,
		get state() {
			return for_state;
		},
	};
}
var $tmpl_1 = template(
	'<input type="text" placeholder="Add todo item"><section class="todos"></section><p> </p><button>Clear completed</button>',
);
var $tmpl_2 = template('<label class="todo"><input type="checkbox"><span> </span></label>');
function TodoList() {
	const todos = {
		v: [
			{
				text: "Pick up groceries",
				completed: false,
			},
			{
				text: "Walk the dog",
				completed: false,
			},
			{
				text: "Read a book",
				completed: false,
			},
		],
		e: [],
	};
	function addTodo(event) {
		if (event.key === "Enter" && event.target.value.trim() !== "") {
			const newTodo = {
				text: event.target.value.trim(),
				completed: false,
			};
			todos.v = [...todos.v, newTodo];
			todos_for_block.update();
			todos.ref_1.nodeValue = todos.v.filter((todo) => !todo.completed).length + " remaining";
			event.target.value = "";
		}
	}
	function clearTodos() {
		todos.v = todos.v.filter((todo) => !todo.completed);
		todos_for_block.update();
		todos.ref_1.nodeValue = todos.v.filter((todo) => !todo.completed).length + " remaining";
	}
	let todos_for_block;
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);
		const input_1 = this.firstChild;
		const section_1 = input_1.nextSibling;
		const p_1 = section_1.nextSibling;
		const p_1_text = p_1.firstChild;
		const button_1 = p_1.nextSibling;
		input_1.__keydown = addTodo;
		button_1.__click = clearTodos;
		todos_for_block = for_block(section_1, todos, (anchor, todo, index) => {
			const label_1 = $tmpl_2().firstChild;
			const input_2 = label_1.firstChild;
			const span_1 = input_2.nextSibling;
			const span_1_text = span_1.firstChild;
			input_2.__change = () => {
				todo.completed = !todo.completed;
				todos.v = [...todos.v];
				todos_for_block.update();
				todos.ref_1.nodeValue = todos.v.filter((todo$1) => !todo$1.completed).length + " remaining";
			};
			input_2.checked = todo.completed;
			span_1.className = todo.completed ? "completed" : "";
			span_1_text.nodeValue = todo.text;
			anchor.before(label_1);
			return {
				start: label_1,
				end: label_1,
			};
		});
		p_1_text.nodeValue = todos.v.filter((todo) => !todo.completed).length + " remaining";
		todos.ref_1 = p_1_text;
	});
}
defineComponent("todo-list", TodoList);
delegate(["keydown", "click", "change"]);
