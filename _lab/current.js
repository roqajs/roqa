var { cloneNode } = Node.prototype;
const template = (html) => {
	const t = document.createElement("template");
	t.innerHTML = html;
	return () => cloneNode.call(t.content, true);
};
const bind = (cell$1, fn) => {
	cell$1.e.push(fn);
	return () => {
		const idx = cell$1.e.indexOf(fn);
		if (idx > -1) cell$1.e.splice(idx, 1);
	};
};
const notify = (cell$1) => {
	for (let i = 0; i < cell$1.e.length; i++) cell$1.e[i](cell$1.v);
};
var batching = false;
var pending = /* @__PURE__ */ new Set();
const batch = (fn) => {
	if (batching) {
		fn();
		return;
	}
	batching = true;
	try {
		fn();
	} finally {
		batching = false;
		for (const cell$1 of pending) notify(cell$1);
		pending.clear();
	}
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
function defineComponent(tagName, fn) {
	if (customElements.get(tagName)) return;
	customElements.define(tagName, class extends HTMLElement {
		_connectedCallbacks = /* @__PURE__ */ new Set();
		connectedCallback() {
			fn.call(this);
			for (const callback of this._connectedCallbacks) callback();
		}
		connected(fn$1) {
			this._connectedCallbacks.add(fn$1);
		}
	});
	handle_root_events(document);
}
var array_from = Array.from;
var is_array = Array.isArray;
var lis_result;
var lis_p;
var lis_max_len = 0;
function lis_algorithm(arr) {
	let arrI = 0, i = 0, j = 0, k = 0, u = 0, v = 0, c = 0;
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
				c = u + v >> 1;
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
		v: value
	};
}
function move_item(item, anchor) {
	const state = item.s;
	let node = state.start;
	const end = state.end;
	if (node !== end) while (node !== null) {
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
	let a_start = 0, b_start = 0, a_left = 0, b_left = 0, sources = new Int32Array(0), moved = false, pos = 0, patched = 0, i = 0, j = 0;
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
			if (j <= b_end) while (j <= b_end) {
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
			if (b_length < 4 || (a_left | b_left) < 32) for (i = a_start; i <= a_end; ++i) {
				a_val = a[i];
				if (patched < b_left) {
					for (j = b_start; j <= b_end; j++) if (a_val === (b_val = b[j])) {
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
				for (i = b_left - 1; i >= 0; i--) if (sources[i] === 0) {
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
		items: []
	};
	const do_update = () => {
		const collection = source_cell.v;
		reconcile_by_ref(anchor, for_state, is_array(collection) ? collection : collection == null ? [] : array_from(collection), render_fn);
	};
	const unsubscribe = bind(source_cell, do_update);
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
		}
	};
}
var $tmpl_1 = template("<div class=\"container\"><div class=\"jumbotron\"><div class=\"row\"><div class=\"col-md-6\"><h1>Riftttt</h1></div><div class=\"col-md-6\"><div class=\"row\"><div class=\"col-sm-6 smallpad\"><button type=\"button\" class=\"btn btn-primary btn-block\" id=\"run\">Create 1,000 rows</button></div><div class=\"col-sm-6 smallpad\"><button type=\"button\" class=\"btn btn-primary btn-block\" id=\"runlots\">Create 10,000 rows</button></div><div class=\"col-sm-6 smallpad\"><button type=\"button\" class=\"btn btn-primary btn-block\" id=\"add\">Append 1,000 rows</button></div><div class=\"col-sm-6 smallpad\"><button type=\"button\" class=\"btn btn-primary btn-block\" id=\"update\">Update every 10th row</button></div><div class=\"col-sm-6 smallpad\"><button type=\"button\" class=\"btn btn-primary btn-block\" id=\"clear\">Clear</button></div><div class=\"col-sm-6 smallpad\"><button type=\"button\" class=\"btn btn-primary btn-block\" id=\"swaprows\">Swap Rows</button></div></div></div></div></div><table class=\"table table-hover table-striped test-data\"><tbody></tbody></table><span class=\"preloadicon glyphicon glyphicon-remove\" aria-hidden=\"true\"></span></div>");
var $tmpl_2 = template("<tr><td class=\"col-md-1\"> </td><td class=\"col-md-4\"><a> </a></td><td class=\"col-md-1\"><a><span class=\"glyphicon glyphicon-remove\" aria-hidden=\"true\"></span></a></td><td class=\"col-md-6\"></td></tr>");
var adjectives = [
	"pretty",
	"large",
	"big",
	"small",
	"tall",
	"short",
	"long",
	"handsome",
	"plain",
	"quaint",
	"clean",
	"elegant",
	"easy",
	"angry",
	"crazy",
	"helpful",
	"mushy",
	"odd",
	"unsightly",
	"adorable",
	"important",
	"inexpensive",
	"cheap",
	"expensive",
	"fancy"
];
var colours = [
	"red",
	"yellow",
	"blue",
	"green",
	"pink",
	"brown",
	"purple",
	"brown",
	"white",
	"black",
	"orange"
];
var nouns = [
	"table",
	"chair",
	"house",
	"bbq",
	"desk",
	"car",
	"pony",
	"cookie",
	"sandwich",
	"burger",
	"pizza",
	"mouse",
	"keyboard"
];
var rand = (dict) => dict[Math.round(Math.random() * 1e3) % dict.length];
function App() {
	let rowId = 1;
	let items = {
		v: [],
		e: []
	};
	let selected_item = {
		v: null,
		e: []
	};
	function build_data(count = 1e3) {
		const data = new Array(count);
		for (let i = 0; i < count; i++) {
			const text = rand(adjectives) + " " + rand(colours) + " " + rand(nouns);
			data[i] = {
				id: rowId++,
				label: {
					v: text,
					e: []
				},
				is_selected: {
					v: false,
					e: []
				}
			};
		}
		return data;
	}
	const run = () => {
		items.v = build_data(1e3);
		for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
	};
	const runlots = () => {
		items.v = build_data(1e4);
		for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
	};
	const add = () => {
		items.v = [...items.v, ...build_data(1e3)];
		for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
	};
	const clear = () => {
		items.v = [];
		for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
		selected_item.v = null;
	};
	const update_rows = () => {
		batch(() => {
			for (let i = 0, row; row = items.v[i]; i += 10) {
				row.label.v = row.label.v + " !!!";
				for (let i$1 = 0; i$1 < row.label.e.length; i$1++) row.label.e[i$1](row.label.v);
			}
		});
	};
	const swaprows = () => {
		if (items.v.length > 998) {
			const clone = items.v.slice();
			const temp = clone[1];
			clone[1] = clone[998];
			clone[998] = temp;
			items.v = clone;
			for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
		}
	};
	const select = (row) => {
		const prev = selected_item.v;
		if (prev) {
			prev.is_selected.v = false;
			for (let i = 0; i < prev.is_selected.e.length; i++) prev.is_selected.e[i](prev.is_selected.v);
		}
		row.is_selected.v = true;
		for (let i = 0; i < row.is_selected.e.length; i++) row.is_selected.e[i](row.is_selected.v);
		selected_item.v = row;
	};
	const remove = (row) => {
		const clone = items.v.slice();
		clone.splice(clone.indexOf(row), 1);
		items.v = clone;
		for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
	};
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);
		const div_2 = this.firstChild.firstChild;
		const div_7 = div_2.firstChild.firstChild.nextSibling.firstChild.firstChild;
		const button_1 = div_7.firstChild;
		const div_8 = div_7.nextSibling;
		const button_2 = div_8.firstChild;
		const div_9 = div_8.nextSibling;
		const button_3 = div_9.firstChild;
		const div_10 = div_9.nextSibling;
		const button_4 = div_10.firstChild;
		const div_11 = div_10.nextSibling;
		const button_5 = div_11.firstChild;
		const button_6 = div_11.nextSibling.firstChild;
		const tbody_1 = div_2.nextSibling.firstChild;
		button_1.__click = run;
		button_2.__click = runlots;
		button_3.__click = add;
		button_4.__click = update_rows;
		button_5.__click = clear;
		button_6.__click = swaprows;
		for_block(tbody_1, items, (anchor, row, index) => {
			const tr_1 = $tmpl_2().firstChild;
			const td_1 = tr_1.firstChild;
			const td_1_text = td_1.firstChild;
			const td_2 = td_1.nextSibling;
			const a_1 = td_2.firstChild;
			const a_1_text = a_1.firstChild;
			const a_2 = td_2.nextSibling.firstChild;
			a_1.__click = [select, row];
			a_2.__click = [remove, row];
			tr_1.className = row.is_selected.v ? "danger" : "";
			bind(row.is_selected, (v) => {
				tr_1.className = v ? "danger" : "";
			});
			td_1_text.nodeValue = row.id;
			a_1_text.nodeValue = row.label.v;
			bind(row.label, (v) => {
				a_1_text.nodeValue = v;
			});
			anchor.before(tr_1);
			return {
				start: tr_1,
				end: tr_1
			};
		});
	});
}
defineComponent("bench-app", App);
delegate(["click"]);
