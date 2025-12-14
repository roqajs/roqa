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
		reconcile_by_ref(anchor, for_state, Array.isArray(collection) ? collection : collection == null ? [] : Array.from(collection), render_fn);
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
		}
	};
}
function show_block(container, condition, render_fn, deps) {
	const anchor = document.createTextNode("");
	container.appendChild(anchor);
	let currentState = null;
	let isShowing = false;
	const isCell = condition && typeof condition === "object" && "v" in condition;
	const isGetter = typeof condition === "function";
	const getConditionValue = () => {
		if (isCell) return !!condition.v;
		if (isGetter) return !!condition();
		return !!condition;
	};
	const create = () => {
		if (currentState) return;
		currentState = render_fn(anchor);
		isShowing = true;
	};
	const destroy_current = () => {
		if (!currentState) return;
		if (currentState.cleanup) currentState.cleanup();
		let node = currentState.start;
		const end = currentState.end;
		while (node !== null) {
			const next = node.nextSibling;
			node.remove();
			if (node === end) break;
			node = next;
		}
		currentState = null;
		isShowing = false;
	};
	const do_update = () => {
		const shouldShow = getConditionValue();
		if (shouldShow && !isShowing) create();
		else if (!shouldShow && isShowing) destroy_current();
	};
	const unsubscribes = [];
	if (isCell) unsubscribes.push(bind(condition, do_update));
	else if (deps && deps.length > 0) for (const dep of deps) unsubscribes.push(bind(dep, do_update));
	do_update();
	const destroy = () => {
		for (const unsub of unsubscribes) unsub();
		destroy_current();
		anchor.remove();
	};
	return {
		update: do_update,
		destroy,
		get isShowing() {
			return isShowing;
		}
	};
}
const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const ENDPOINTS = {
	top: "topstories",
	new: "newstories",
	best: "beststories",
	ask: "askstories",
	show: "showstories",
	job: "jobstories"
};
const FEEDS = {
	top: "top",
	new: "new",
	best: "best",
	ask: "ask",
	show: "show",
	job: "job"
};
var $tmpl_1$5 = template("<header><div class=\"header-content\"><a href=\"#\" class=\"logo\"><span class=\"logo-icon\">Y</span><span class=\"logo-text\">Hacker News</span></a><nav class=\"nav-links\"><button>top</button><button>new</button><button>best</button><button>ask</button><button>show</button><button>job</button></nav></div></header>");
function Header({ changeFeed }) {
	const currentFeed = {
		v: FEEDS.top,
		e: []
	};
	const activeClass = (current, feed) => current === feed ? "nav-link active" : "nav-link";
	const handleFeedClick = (feed) => {
		currentFeed.v = feed;
		currentFeed.ref_1.className = activeClass(currentFeed.v, FEEDS.top);
		currentFeed.ref_2.className = activeClass(currentFeed.v, FEEDS.new);
		currentFeed.ref_3.className = activeClass(currentFeed.v, FEEDS.best);
		currentFeed.ref_4.className = activeClass(currentFeed.v, FEEDS.ask);
		currentFeed.ref_5.className = activeClass(currentFeed.v, FEEDS.show);
		currentFeed.ref_6.className = activeClass(currentFeed.v, FEEDS.job);
		changeFeed(feed);
	};
	this.connected(() => {
		const $root_1 = $tmpl_1$5();
		this.appendChild($root_1);
		const button_1 = this.firstChild.firstChild.firstChild.nextSibling.firstChild;
		const button_2 = button_1.nextSibling;
		const button_3 = button_2.nextSibling;
		const button_4 = button_3.nextSibling;
		const button_5 = button_4.nextSibling;
		const button_6 = button_5.nextSibling;
		button_1.__click = [handleFeedClick, FEEDS.top];
		button_2.__click = [handleFeedClick, FEEDS.new];
		button_3.__click = [handleFeedClick, FEEDS.best];
		button_4.__click = [handleFeedClick, FEEDS.ask];
		button_5.__click = [handleFeedClick, FEEDS.show];
		button_6.__click = [handleFeedClick, FEEDS.job];
		button_1.className = activeClass(currentFeed.v, FEEDS.top);
		currentFeed.ref_1 = button_1;
		button_2.className = activeClass(currentFeed.v, FEEDS.new);
		currentFeed.ref_2 = button_2;
		button_3.className = activeClass(currentFeed.v, FEEDS.best);
		currentFeed.ref_3 = button_3;
		button_4.className = activeClass(currentFeed.v, FEEDS.ask);
		currentFeed.ref_4 = button_4;
		button_5.className = activeClass(currentFeed.v, FEEDS.show);
		currentFeed.ref_5 = button_5;
		button_6.className = activeClass(currentFeed.v, FEEDS.job);
		currentFeed.ref_6 = button_6;
	});
}
defineComponent("hn-header", Header);
delegate(["click"]);
var $tmpl_1$4 = template("<article class=\"story\"><span class=\"rank\"> </span><div class=\"story-content\"><div class=\"story-title\"><a target=\"_blank\" rel=\"noopener noreferrer\" class=\"title-link\"> </a><span class=\"domain\"> </span></div><div class=\"story-meta\"><span class=\"score\"> </span><span class=\"separator\">|</span><span class=\"author\"> </span><span class=\"separator\">|</span><span class=\"time\"> </span><span class=\"separator\">|</span><a href=\"#\" class=\"comments\"> </a></div></div></article>");
function StoryItem({ story, index }) {
	const timeAgo = (timestamp) => {
		const seconds = Math.floor(Date.now() / 1e3 - timestamp);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	};
	const getDomain = (url) => {
		if (!url) return "";
		try {
			return new URL(url).hostname.replace("www.", "");
		} catch {
			return "";
		}
	};
	const handleCommentsClick = (e) => {
		e.preventDefault();
		this.dispatchEvent(new CustomEvent("viewcomments", {
			bubbles: true,
			detail: { storyId: story.id }
		}));
	};
	const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
	const domain = getDomain(story.url);
	const domainDisplay = domain ? `(${domain})` : "";
	this.connected(() => {
		const $root_1 = $tmpl_1$4();
		this.appendChild($root_1);
		const span_1 = this.firstChild.firstChild;
		const span_1_text = span_1.firstChild;
		const div_2 = span_1.nextSibling.firstChild;
		const a_1 = div_2.firstChild;
		const a_1_text = a_1.firstChild;
		const span_2_text = a_1.nextSibling.firstChild;
		const span_3 = div_2.nextSibling.firstChild;
		const span_3_text = span_3.firstChild;
		const span_5 = span_3.nextSibling.nextSibling;
		const span_5_text = span_5.firstChild;
		const span_7 = span_5.nextSibling.nextSibling;
		const span_7_text = span_7.firstChild;
		const a_2 = span_7.nextSibling.nextSibling;
		const a_2_text = a_2.firstChild;
		a_2.__click = handleCommentsClick;
		span_1_text.nodeValue = index + 1 + ".";
		a_1.href = storyUrl;
		a_1_text.nodeValue = story.title;
		span_2_text.nodeValue = domainDisplay;
		span_3_text.nodeValue = story.score + " points";
		span_5_text.nodeValue = "by " + story.by;
		span_7_text.nodeValue = timeAgo(story.time);
		a_2_text.nodeValue = (story.descendants || 0) + " comments";
	});
}
defineComponent("story-item", StoryItem);
delegate(["click"]);
var $tmpl_1$3 = template("<section class=\"story-list\"></section>");
var $tmpl_2$3 = template("<div class=\"loading visible\"><div class=\"loading-spinner\"></div><span>Loading stories...</span></div>");
var $tmpl_3$1 = template("<div class=\"error visible\"><p>Failed to load stories. Please try again.</p></div>");
var $tmpl_4 = template("<div class=\"stories visible\"></div>");
var $tmpl_5 = template("<story-item></story-item>");
function StoryList() {
	const stories = {
		v: [],
		e: []
	};
	const loading = {
		v: true,
		e: []
	};
	const error = {
		v: false,
		e: []
	};
	this.setStories = (value) => {
		stories.v = value;
		for (let i = 0; i < stories.e.length; i++) stories.e[i](stories.v);
	};
	this.setLoading = (value) => {
		loading.v = value;
		for (let i = 0; i < loading.e.length; i++) loading.e[i](loading.v);
	};
	this.setError = (value) => {
		error.v = value;
		for (let i = 0; i < error.e.length; i++) error.e[i](error.v);
	};
	this.connected(() => {
		const $root_1 = $tmpl_1$3();
		this.appendChild($root_1);
		const section_1 = this.firstChild;
		show_block(section_1, loading, (anchor) => {
			const $root_2_first = $tmpl_2$3().firstChild;
			anchor.before($root_2_first);
			return {
				start: $root_2_first,
				end: $root_2_first
			};
		});
		show_block(section_1, error, (anchor) => {
			const $root_3_first = $tmpl_3$1().firstChild;
			anchor.before($root_3_first);
			return {
				start: $root_3_first,
				end: $root_3_first
			};
		});
		show_block(section_1, () => !loading.v && !error.v, (anchor) => {
			const div_4 = $tmpl_4().firstChild;
			for_block(div_4, stories, (anchor$1, story, index) => {
				const story_item_1 = $tmpl_5().firstChild;
				setProp(story_item_1, "story", story);
				setProp(story_item_1, "index", index);
				anchor$1.before(story_item_1);
				return {
					start: story_item_1,
					end: story_item_1
				};
			});
			anchor.before(div_4);
			return {
				start: div_4,
				end: div_4
			};
		}, [loading, error]);
	});
}
defineComponent("story-list", StoryList);
var $tmpl_1$2 = template("<div class=\"comment-wrapper\"><div><div><button class=\"collapse-btn\"> </button><span class=\"comment-author\"> </span><span class=\"comment-time\"> </span><span> </span></div><div><div></div><span>[deleted]</span></div></div><div><div>Loading replies...</div></div></div>");
var $tmpl_2$2 = template("<comment-item></comment-item>");
function CommentItem({ comment, depth = 0 }) {
	const collapsed = {
		v: false,
		e: []
	};
	const childComments = {
		v: [],
		e: []
	};
	const loadingChildren = {
		v: false,
		e: []
	};
	const childrenLoaded = {
		v: false,
		e: []
	};
	const HN_API_BASE$1 = "https://hacker-news.firebaseio.com/v0";
	const timeAgo = (timestamp) => {
		if (!timestamp) return "";
		const seconds = Math.floor(Date.now() / 1e3 - timestamp);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	};
	const fetchChildComments = async () => {
		if (!comment || !comment.kids || comment.kids.length === 0) return;
		if (childrenLoaded.v) return;
		loadingChildren.v = true;
		loadingChildren.ref_1.className = loadingChildren.v ? "loading-children visible" : "loading-children";
		try {
			const commentPromises = comment.kids.map(async (id) => {
				return (await fetch(`${HN_API_BASE$1}/item/${id}.json`)).json();
			});
			childComments.v = (await Promise.all(commentPromises)).filter((c) => c && !c.deleted && !c.dead);
			childComments_for_block.update();
			childrenLoaded.v = true;
			for (let i = 0; i < childrenLoaded.e.length; i++) childrenLoaded.e[i](childrenLoaded.v);
		} catch (err) {
			console.error("Failed to fetch child comments:", err);
		} finally {
			loadingChildren.v = false;
			loadingChildren.ref_1.className = loadingChildren.v ? "loading-children visible" : "loading-children";
		}
	};
	const toggleCollapse = () => {
		const wasCollapsed = collapsed.v;
		collapsed.v = !wasCollapsed;
		collapsed.ref_1.className = isDeleted ? "comment deleted" : collapsed.v ? "comment collapsed" : "comment";
		collapsed.ref_2.className = collapsed.v && hasChildren ? "child-count visible" : "child-count";
		collapsed.ref_3.className = isDeleted ? "deleted-text" : collapsed.v ? "comment-body hidden" : "comment-body";
		collapsed.ref_4.className = isDeleted || collapsed.v || !hasChildren ? "comment-children hidden" : "comment-children";
		collapsed.ref_1.nodeValue = collapsed.v ? "[+]" : "[-]";
		if (wasCollapsed && !childrenLoaded.v && comment?.kids?.length > 0) fetchChildComments();
	};
	this.connected(() => {
		const textEl = this.querySelector(".comment-text");
		if (textEl && comment?.text) textEl.innerHTML = comment.text;
		if (depth === 0 && comment?.kids?.length > 0) requestAnimationFrame(() => {
			fetchChildComments();
		});
	});
	const authorName = comment?.by || "[unknown]";
	const commentTime = comment?.time ? timeAgo(comment.time) : "";
	const hasChildren = comment?.kids && comment.kids.length > 0;
	const isDeleted = comment?.deleted || comment?.dead;
	const childCount = comment?.kids?.length || 0;
	let childComments_for_block;
	this.connected(() => {
		const $root_1 = $tmpl_1$2();
		this.appendChild($root_1);
		const div_2 = this.firstChild.firstChild;
		const div_3 = div_2.firstChild;
		const button_1 = div_3.firstChild;
		const button_1_text = button_1.firstChild;
		const span_1 = button_1.nextSibling;
		const span_1_text = span_1.firstChild;
		const span_2 = span_1.nextSibling;
		const span_2_text = span_2.firstChild;
		const span_3 = span_2.nextSibling;
		const span_3_text = span_3.firstChild;
		const div_4 = div_3.nextSibling;
		const div_5 = div_4.firstChild;
		const span_4 = div_5.nextSibling;
		const div_6 = div_2.nextSibling;
		const div_7 = div_6.firstChild;
		button_1.__click = toggleCollapse;
		childComments_for_block = for_block(div_6, childComments, (anchor, childComment, index) => {
			const comment_item_1 = $tmpl_2$2().firstChild;
			setProp(comment_item_1, "comment", childComment);
			setProp(comment_item_1, "depth", depth + 1);
			anchor.before(comment_item_1);
			return {
				start: comment_item_1,
				end: comment_item_1
			};
		});
		div_2.className = isDeleted ? "comment deleted" : collapsed.v ? "comment collapsed" : "comment";
		collapsed.ref_1 = div_2;
		div_3.className = isDeleted ? "comment-header hidden" : "comment-header";
		button_1_text.nodeValue = collapsed.v ? "[+]" : "[-]";
		collapsed.ref_1 = button_1_text;
		span_1_text.nodeValue = authorName;
		span_2_text.nodeValue = commentTime;
		span_3.className = collapsed.v && hasChildren ? "child-count visible" : "child-count";
		collapsed.ref_2 = span_3;
		span_3_text.nodeValue = "(" + childCount + " " + (childCount === 1 ? "reply" : "replies") + ")";
		div_4.className = isDeleted ? "deleted-text" : collapsed.v ? "comment-body hidden" : "comment-body";
		collapsed.ref_3 = div_4;
		div_5.className = isDeleted ? "hidden" : "comment-text";
		span_4.className = isDeleted ? "" : "hidden";
		div_6.className = isDeleted || collapsed.v || !hasChildren ? "comment-children hidden" : "comment-children";
		collapsed.ref_4 = div_6;
		div_7.className = loadingChildren.v ? "loading-children visible" : "loading-children";
		loadingChildren.ref_1 = div_7;
	});
}
defineComponent("comment-item", CommentItem);
delegate(["click"]);
var $tmpl_1$1 = template("<section class=\"comment-page\"><div><div class=\"loading-spinner\"></div><span>Loading comments...</span></div><div><p>Failed to load story. Please try again.</p><button class=\"back-btn\">← Back to stories</button></div><div><button class=\"back-btn\">← Back to stories</button><article class=\"story-detail\"><h1 class=\"story-title\"><a target=\"_blank\" rel=\"noopener noreferrer\" class=\"title-link\"> </a><span class=\"domain\"> </span></h1><div class=\"story-meta\"><span class=\"score\"> </span><span class=\"separator\">|</span><span class=\"author\"> </span><span class=\"separator\">|</span><span class=\"time\"> </span><span class=\"separator\">|</span><span class=\"comment-count\"> </span></div><div class=\"story-text\"></div></article><div class=\"comments-section\"><h2 class=\"comments-header\">Comments</h2><div>No comments yet.</div><div class=\"comments-list\"></div></div></div></section>");
var $tmpl_2$1 = template("<comment-item></comment-item>");
function CommentPage() {
	const story = {
		v: null,
		e: []
	};
	const comments = {
		v: [],
		e: []
	};
	const loading = {
		v: false,
		e: []
	};
	const error = {
		v: false,
		e: []
	};
	let pendingStoryId = null;
	const HN_API_BASE$1 = "https://hacker-news.firebaseio.com/v0";
	const timeAgo = (timestamp) => {
		const seconds = Math.floor(Date.now() / 1e3 - timestamp);
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	};
	const getDomain = (url) => {
		if (!url) return "";
		try {
			return new URL(url).hostname.replace("www.", "");
		} catch {
			return "";
		}
	};
	const fetchComments = async (kids) => {
		if (!kids || kids.length === 0) return [];
		const commentPromises = kids.map(async (id) => {
			return (await fetch(`${HN_API_BASE$1}/item/${id}.json`)).json();
		});
		return (await Promise.all(commentPromises)).filter((c) => c && !c.deleted && !c.dead);
	};
	const handleBackClick = () => {
		this.dispatchEvent(new CustomEvent("back", { bubbles: true }));
	};
	this.loadStory = (storyId) => {
		pendingStoryId = storyId;
	};
	this.connected(() => {
		const checkPending = () => {
			if (pendingStoryId !== null) {
				const storyId = pendingStoryId;
				pendingStoryId = null;
				doLoad(storyId);
			}
		};
		requestAnimationFrame(checkPending);
		this.loadStory;
		this.loadStory = (storyId) => {
			requestAnimationFrame(() => doLoad(storyId));
		};
	});
	const doLoad = async (storyId) => {
		loading.v = true;
		loading.ref_1.className = loading.v ? "loading visible" : "loading";
		loading.ref_2.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		error.v = false;
		error.ref_1.className = error.v ? "error visible" : "error";
		error.ref_2.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		story.v = null;
		story.ref_1.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		story.ref_2.href = story.v?.url || "#";
		story.ref_1.nodeValue = story.v?.title || "";
		story.ref_2.nodeValue = story.v?.url ? "(" + getDomain(story.v.url) + ")" : "";
		story.ref_3.nodeValue = (story.v?.score || 0) + " points";
		story.ref_4.nodeValue = "by " + (story.v?.by || "");
		story.ref_5.nodeValue = story.v ? timeAgo(story.v.time) : "";
		story.ref_6.nodeValue = (story.v?.descendants || 0) + " comments";
		comments.v = [];
		comments_for_block.update();
		comments.ref_1.className = comments.v.length === 0 ? "no-comments visible" : "no-comments";
		try {
			const storyData = await (await fetch(`${HN_API_BASE$1}/item/${storyId}.json`)).json();
			if (!storyData) {
				error.v = true;
				error.ref_1.className = error.v ? "error visible" : "error";
				error.ref_2.className = !loading.v && !error.v && story.v ? "content visible" : "content";
				return;
			}
			story.v = storyData;
			story.ref_1.className = !loading.v && !error.v && story.v ? "content visible" : "content";
			story.ref_2.href = story.v?.url || "#";
			story.ref_1.nodeValue = story.v?.title || "";
			story.ref_2.nodeValue = story.v?.url ? "(" + getDomain(story.v.url) + ")" : "";
			story.ref_3.nodeValue = (story.v?.score || 0) + " points";
			story.ref_4.nodeValue = "by " + (story.v?.by || "");
			story.ref_5.nodeValue = story.v ? timeAgo(story.v.time) : "";
			story.ref_6.nodeValue = (story.v?.descendants || 0) + " comments";
			requestAnimationFrame(() => {
				const textEl = this.querySelector(".story-text");
				if (textEl && storyData.text) textEl.innerHTML = storyData.text;
			});
			if (storyData.kids && storyData.kids.length > 0) {
				const topComments = await fetchComments(storyData.kids);
				console.log("Fetched top comments:", topComments);
				console.log("Setting comments, length:", topComments.length);
				comments.v = topComments;
				comments_for_block.update();
				comments.ref_1.className = comments.v.length === 0 ? "no-comments visible" : "no-comments";
				console.log("Comments set done");
			}
		} catch (err) {
			console.error("Failed to fetch story:", err);
			error.v = true;
			error.ref_1.className = error.v ? "error visible" : "error";
			error.ref_2.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		} finally {
			loading.v = false;
			loading.ref_1.className = loading.v ? "loading visible" : "loading";
			loading.ref_2.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		}
	};
	let comments_for_block;
	this.connected(() => {
		const $root_1 = $tmpl_1$1();
		this.appendChild($root_1);
		const div_1 = this.firstChild.firstChild;
		const div_3 = div_1.nextSibling;
		const button_1 = div_3.firstChild.nextSibling;
		const div_4 = div_3.nextSibling;
		const button_2 = div_4.firstChild;
		const article_1 = button_2.nextSibling;
		const h1_1 = article_1.firstChild;
		const a_1 = h1_1.firstChild;
		const a_1_text = a_1.firstChild;
		const span_2_text = a_1.nextSibling.firstChild;
		const span_3 = h1_1.nextSibling.firstChild;
		const span_3_text = span_3.firstChild;
		const span_5 = span_3.nextSibling.nextSibling;
		const span_5_text = span_5.firstChild;
		const span_7 = span_5.nextSibling.nextSibling;
		const span_7_text = span_7.firstChild;
		const span_9_text = span_7.nextSibling.nextSibling.firstChild;
		const div_8 = article_1.nextSibling.firstChild.nextSibling;
		const div_9 = div_8.nextSibling;
		button_1.__click = handleBackClick;
		button_2.__click = handleBackClick;
		comments_for_block = for_block(div_9, comments, (anchor, comment, index) => {
			const comment_item_1 = $tmpl_2$1().firstChild;
			console.log("Rendering comment:", comment);
			setProp(comment_item_1, "comment", comment);
			setProp(comment_item_1, "depth", 0);
			anchor.before(comment_item_1);
			return {
				start: comment_item_1,
				end: comment_item_1
			};
		});
		div_1.className = loading.v ? "loading visible" : "loading";
		loading.ref_1 = div_1;
		div_3.className = error.v ? "error visible" : "error";
		error.ref_1 = div_3;
		div_4.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		loading.ref_2 = div_4;
		div_4.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		error.ref_2 = div_4;
		div_4.className = !loading.v && !error.v && story.v ? "content visible" : "content";
		story.ref_1 = div_4;
		a_1.href = story.v?.url || "#";
		story.ref_2 = a_1;
		a_1_text.nodeValue = story.v?.title || "";
		story.ref_1 = a_1_text;
		span_2_text.nodeValue = story.v?.url ? "(" + getDomain(story.v.url) + ")" : "";
		story.ref_2 = span_2_text;
		span_3_text.nodeValue = (story.v?.score || 0) + " points";
		story.ref_3 = span_3_text;
		span_5_text.nodeValue = "by " + (story.v?.by || "");
		story.ref_4 = span_5_text;
		span_7_text.nodeValue = story.v ? timeAgo(story.v.time) : "";
		story.ref_5 = span_7_text;
		span_9_text.nodeValue = (story.v?.descendants || 0) + " comments";
		story.ref_6 = span_9_text;
		div_8.className = comments.v.length === 0 ? "no-comments visible" : "no-comments";
		comments.ref_1 = div_8;
	});
}
defineComponent("comment-page", CommentPage);
delegate(["click"]);
var $tmpl_1 = template("<hn-header></hn-header><main></main>");
var $tmpl_2 = template("<story-list></story-list>");
var $tmpl_3 = template("<comment-page></comment-page>");
function App() {
	const currentFeed = {
		v: FEEDS.top,
		e: []
	};
	const showStoryList = {
		v: true,
		e: []
	};
	const currentStoryId = {
		v: null,
		e: []
	};
	const fetchStory = async (id) => {
		return (await fetch(`${HN_API_BASE}/item/${id}.json`)).json();
	};
	const fetchFeed = async (feed) => {
		const storyList = this.querySelector("story-list");
		storyList.setLoading(true);
		storyList.setError(false);
		storyList.setStories([]);
		try {
			const endpoint = ENDPOINTS[feed];
			const storyPromises = (await (await fetch(`${HN_API_BASE}/${endpoint}.json`)).json()).slice(0, 30).map(fetchStory);
			const validStories = (await Promise.all(storyPromises)).filter((story) => story && !story.deleted);
			storyList.setStories(validStories);
		} catch (err) {
			console.error("Failed to fetch stories:", err);
			storyList.setError(true);
		} finally {
			storyList.setLoading(false);
		}
	};
	const handleFeedChange = (feed) => {
		currentFeed.v = feed;
		for (let i = 0; i < currentFeed.e.length; i++) currentFeed.e[i](currentFeed.v);
		showStoryList.v = true;
		for (let i = 0; i < showStoryList.e.length; i++) showStoryList.e[i](showStoryList.v);
		fetchFeed(feed);
	};
	const handleViewComments = (storyId) => {
		currentStoryId.v = storyId;
		for (let i = 0; i < currentStoryId.e.length; i++) currentStoryId.e[i](currentStoryId.v);
		showStoryList.v = false;
		for (let i = 0; i < showStoryList.e.length; i++) showStoryList.e[i](showStoryList.v);
		requestAnimationFrame(() => {
			const commentPage = this.querySelector("comment-page");
			if (commentPage) commentPage.loadStory(storyId);
		});
	};
	this.connected(() => {
		requestAnimationFrame(() => {
			fetchFeed(currentFeed.v);
		});
		this.on("viewcomments", (e) => {
			handleViewComments(e.detail.storyId);
		});
		this.on("back", () => {
			showStoryList.v = true;
			for (let i = 0; i < showStoryList.e.length; i++) showStoryList.e[i](showStoryList.v);
			currentStoryId.v = null;
			for (let i = 0; i < currentStoryId.e.length; i++) currentStoryId.e[i](currentStoryId.v);
		});
	});
	this.connected(() => {
		const $root_1 = $tmpl_1();
		const hn_header_1 = $root_1.firstChild;
		setProp(hn_header_1, "changeFeed", handleFeedChange);
		this.appendChild($root_1);
		const main_1 = hn_header_1.nextSibling;
		show_block(main_1, showStoryList, (anchor) => {
			const $root_2_first = $tmpl_2().firstChild;
			anchor.before($root_2_first);
			return {
				start: $root_2_first,
				end: $root_2_first
			};
		});
		show_block(main_1, () => !showStoryList.v, (anchor) => {
			const $root_3_first = $tmpl_3().firstChild;
			anchor.before($root_3_first);
			return {
				start: $root_3_first,
				end: $root_3_first
			};
		}, [showStoryList]);
	});
}
defineComponent("hacker-news", App);
