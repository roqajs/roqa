# Roqa Agent API Surface

This document proposes a future `roqa` authoring API designed for coding
agents. The API should be explicit, statically recognizable, easy to repair, and
able to lower into Roqa's existing high-performance custom-element engine.

The main design principle is:

> Provide one obvious way to express each UI intent, with strong TypeScript
> feedback and compiler diagnostics when code drifts outside the analyzable path.

## Goals

- Make Roqa easy for agents to author, inspect, debug, patch, and repair.
- Replace JSX/TSX as the primary authoring surface with an explicit JS/TS API.
- Preserve Roqa's current performance model:
  - cells as the reactive substrate
  - static template extraction and DOM cloning
  - aggressive compile-time inlining
  - built-in list reconciliation
  - conditional rendering primitives
  - event delegation
  - custom elements as the runtime boundary
- Provide a structured API that lowers into a compiler-friendly intermediate
  representation (IR).
- Keep the public surface explicit and predictable, even when it is more verbose
  than JSX.
- Avoid adding DSLs when normal JavaScript plus compiler diagnostics is enough.
- Prefer plain JavaScript objects and web-standard values as the primary
  authoring surface.

## Non-goals for the core API

The core package should not try to become a full application metaframework on
day one. These areas are important, but should start as optional packages or
later layers:

- forms and validation
- routing and app shells
- data-cache clients beyond basic resource loading
- documentation/story tooling
- high-level accessibility generators

The core should make these things possible and analyzable, but not own every
domain-specific abstraction.

## Architecture

The proposed API is not a runtime DOM builder and not a virtual DOM. It is a
compile-time authoring API.

```txt
Agent-authored builder API
        ->
Roqa component IR
        ->
Roqa compiler backend
        ->
template() + cloned DOM + cells + inlined updates
        + forBlock/showBlock + delegated events + custom elements
```

The builder API should produce a static structure the compiler can recognize.
Dynamic or imperative cases should be explicit escape hatches.

Core APIs should prefer:

- plain objects over custom wrapper containers when wrappers are not
  compiler-critical
- strings, arrays, booleans, numbers, functions, `URL`, `FormData`, and other
  familiar platform values
- named, exportable declarations that produce usable typed values
- typed handles over stringly lookup whenever the API can provide one

## API layers

Roqa should have three conceptual layers.

| Layer | Purpose | Examples |
| --- | --- | --- |
| Core compiler API | Components, state, rendering, events | `component`, `state`, `prop`, `attr`, `computed`, `command`, `view`, `show`, `each` |
| Agent safety diagnostics | Accessibility, static recognizability, invalid patterns, repair hints | compiler and CLI warnings |
| Application kits | Higher-level app features | `roqa/forms`, `roqa/router`, `roqa/kit` |

The default import surface should stay small.

```ts
import {
	component,
	state,
	prop,
	attr,
	computed,
	command,
	event,
	view,
	show,
	each,
} from "roqa";
```

Low-level backend targets may still exist, but they should be scoped away from
the main authoring surface.

```ts
import {
	defineComponent,
	template,
	forBlock,
	showBlock,
	delegate,
} from "roqa/compiler";
```

If the builder API lowers directly to final inlined output, lower-level cell
helpers such as `cell`, `get`, `set`, `put`, `bind`, and `notify` can remain
backend internals rather than stable public APIs.

Optional application layers should not be part of the default mental model.

```ts
import { form, field } from "roqa/forms";
import { app, route } from "roqa/router";
```

## Component API

`component()` defines a custom element through a structured object and returns a
typed component definition value.

```ts
const CounterButton = component("counter-button", {
	state: {},
	actions: {},
	render: ({ state, actions }) => {},
});
```

The returned value should be useful to tools and application code:

```ts
type CounterButton = typeof CounterButton;
```

Guidelines:

- Prefer one canonical object shape.
- Prefer canonical section order when sections are present.
- Omit unused sections rather than filling components with empty objects.
- Prefer named exported declarations.
- Avoid positional overloads when an options object would be clearer.
- Keep `render` as a static, compiler-recognizable declaration.
- Use escape hatches for dynamic markup or imperative integrations.

Example:

```ts
import { command, component, computed, state, view } from "roqa";

export const CounterButton = component("counter-button", {
	state: {
		count: state.value<number>({ initial: 0 }),
		doubled: computed(({ state }) => state.count.get() * 2),
	},

	actions: {
		increment: command(({ state }) => {
			state.count.set(state.count.get() + 1);
		}),
	},

	render: ({ state, actions }) =>
		view.button({
			id: "increment-button",
			onClick: actions.increment,
			children: ["Count is ", state.count.get(), " / doubled is ", state.doubled.get()],
		}),
});
```

Conceptual lowering:

```ts
defineComponent("counter-button", function Counter() {
	const count = cell(0);
	const doubled = cell(() => get(count) * 2);

	const increment = () => {
		set(count, get(count) + 1);
	};

	// Lowered further to template strings, DOM traversal, event assignments,
	// and direct cell ref updates.
});
```

Full post-compiler output (after all phases):

```ts
import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template('<button id="increment-button"> </button>');

defineComponent("counter-button", function Counter() {
	const count = { v: 0, e: [] };
	const doubled = { v: count.v * 2, e: [] };

	this.connected(() => {
		const button_1 = $tmpl_1().firstChild;
		const button_1_text = button_1.firstChild;

		button_1.__click = () => {
			count.v = count.v + 1;
			doubled.v = count.v * 2;
			count.ref_1.nodeValue = "Count is " + count.v + " / doubled is " + doubled.v;
		};

		button_1_text.nodeValue = "Count is " + count.v + " / doubled is " + doubled.v;
		count.ref_1 = button_1_text;

		this.appendChild(button_1);
	});
});

delegate(["click"]);
```

## State

State should be authored with higher-level helpers but lower to Roqa cells.
Prefer options objects for consistency. Writable state and derived state should
live in the same `state` object.

```ts
state.value<T>({ initial: T })
computed(({ state, props, attrs }) => expression)
```

Example:

```ts
component("status-panel", {
	state: {
		name: state.value<string>({ initial: "" }),
		count: state.value<number>({ initial: 0 }),
		loading: state.value<boolean>({ initial: false }),
		todos: state.value<Todo[]>({ initial: [] }),
		status: state.value<"idle" | "loading" | "error" | "ready">({
			initial: "idle",
		}),
		hasTodos: computed(({ state }) => state.todos.get().length > 0),
	},
});
```

Lowering:

```ts
// state.value<number>({ initial: 0 }) lowers directly to:
const count = { v: 0, e: [] };
const loading = { v: false, e: [] };
```

## Collection state

Collections should exist because agents frequently make mistakes with object and
array mutation. A collection is still state, but with compiler-known update
helpers that express mutation intent directly.

Inspired by Ripple's reactive collection primitives, Roqa provides a typed
collection variant for ordered lists.

### `state.collection<T>` — ordered list

```ts
state.collection<T>({
	key: keyof T | ((item: T) => string),
	initial?: T[],
})
```

Mutation API:

```ts
state.todos.get()
state.todos.set(nextTodos)
state.todos.insert(todo)
state.todos.update(id, patchOrUpdater)
state.todos.remove(id)
state.todos.removeWhere(predicate)
state.todos.move(fromId, toId)
state.todos.clear()
```

Derived views should use `computed()` rather than collection helpers:

```ts
state: {
	todos: state.collection<Todo>({ key: "id", initial: [] }),
	remaining: computed(({ state }) =>
		state.todos.get().filter((t) => !t.completed),
	),
}
```

The collection type lowers to a cell containing the underlying data structure
plus compiler-known update patterns.

## Props and attributes

Roqa should maintain a sharp distinction between JavaScript properties and DOM
attributes.

| Use | Purpose |
| --- | --- |
| `attrs` | Public HTML/config surface: strings, booleans, numbers, enums |
| `props` | Fast arbitrary JS values: primitives, objects, arrays, callbacks, services, platform objects |
| `state` | Component-owned mutable data |

### Props

Props are JavaScript values passed to custom elements. They lower to `getProp`
and `setProp` method calls on the `RoqaElement` base class — not JavaScript
getter/setter properties. This method-call path is measurably faster for custom
elements and should be preferred over serialized attributes for rich data.

```ts
prop.value<T>({ required?: boolean, default?: T })
```

Lowering:

```ts
// Reading a prop inside the component
props.story.url
// lowers to:
this.getProp("story").url

// Setting a prop from outside the component
element.setProp("story", newStory)
```

Example:

```ts
component("story-item", {
	props: {
		story: prop.value<Story>({ required: true }),
		index: prop.value<number>({ default: 0 }),
	},

	render: ({ props }) =>
		view.article({
			id: "story-item",
			children: [
				view.a({
					href: props.story.url,
					text: props.story.title,
				}),
			],
		}),
});
```

### Attributes

Attributes are serialized DOM attributes observed by the custom element.

```ts
attr.value<T extends string | number | boolean>({ default?: T, reflect?: boolean })
```

String unions should be expressed directly in the type:

```ts
attr.value<"small" | "medium" | "large">({
	default: "medium",
	reflect: true,
})
```

Example:

```ts
component("app-button", {
	attrs: {
		disabled: attr.value<boolean>({ default: false, reflect: true }),
		variant: attr.value<"primary" | "secondary">({
			default: "primary",
			reflect: true,
		}),
	},

	render: ({ attrs }) =>
		view.button({
			disabled: attrs.disabled.get(),
			class: ["btn", `btn-${attrs.variant.get()}`],
		}),
});
```

Lowering should target `RoqaElement` attribute helpers and internal attribute
accessors rather than exposing raw `observedAttributes` and
`attributeChangedCallback` as the authored abstraction.

## Actions

Actions are named component commands. They are the canonical place for event
handling, state mutation, imperative work, and async mutations.

Actions should be exposed as typed named object members, not dynamically looked
up by string.

The basic mental model is:

- actions do things
- derived state lives in `state`

The primitive should be named `command()` to avoid the same naming overlap that
`render` solved for `view`.

TypeScript should infer payload types from the command function signature.

```ts
command(fn)
```

Examples:

```ts
actions: {
	clearCompleted: command(({ state }) => {
		state.todos.removeWhere((todo) => todo.completed);
	}),

	setDraft: command(({ state }, value: string) => {
		state.draft.set(value);
	}),

	handleKeydown: command(({ actions }, event: KeyboardEvent) => {
		if (event.key === "Enter") actions.addTodo();
	}),
}
```

Commands receive a structured context:

```ts
type CommandContext = {
	host: RoqaElement;
	props: Props;
	attrs: Attrs;
	state: State;
	actions: Actions;
	emit: Emit;
};
```

## Event bindings

Event bindings should have one canonical adapter.

### DOM events

Standard DOM event props pass DOM events.

```ts
view.button({
	onClick: actions.save,
});

view.input({
	onInput: actions.handleInputEvent,
});
```

### Custom events

Custom element events should follow the same `onName` convention:

```ts
view.element("todo-list", {
	onTodoAdded: actions.handleTodoAdded,
});

actions: {
	handleTodoAdded: command(({}, event: CustomEvent<Todo>) => {
		trackTodoAdded(event.detail.id);
	}),
}
```

### Bound actions

Action handles should read like verbs. Passing an action directly uses it as the
handler. Calling an action with arguments returns a bound handler.

```ts
onClick: actions.clearCompleted
onChange: actions.toggleTodo(todo.id)
```

## Lifecycle

Lifecycle hooks should map to the existing `RoqaElement` methods.

```ts
lifecycle: {
	onConnect?: (ctx: LifecycleContext) => void | (() => void);
	onDisconnect?: (ctx: LifecycleContext) => void;
}
```

```ts
type LifecycleContext = CommandContext & {
	refs: Refs;
};
```

Example:

```ts
lifecycle: {
	onConnect({ actions }) {
		actions.start();
	},
	onDisconnect({ actions }) {
		actions.stop();
	},
}
```

Lowering:

```ts
this.connected(...);
this.disconnected(...);
```

Async lifecycle work should usually be represented by a command.

## Emitted custom events

Components should be able to declare custom events they emit. Use `emits`
instead of `events` to avoid confusion with DOM event handlers.

`emits` should produce typed named handles, not just string keys, so component
code does not need to call `emit("some-name", payload)` directly.

```ts
emits: {
	todoAdded: event<{ id: string; text: string }>({ name: "todo-added" }),
	selectionChanged: event<{ id: string | null }>({
		name: "selection-changed",
	}),
}
```

Usage:

```ts
actions: {
	addTodo: command(({ state, emit }) => {
		const todo = { id: crypto.randomUUID(), text: state.draft.get() };
		state.todos.insert(todo);
		emit.todoAdded(todo);
	}),
}
```

Lowering should still use the existing `this.emit(...)` custom event helper, but
the public authoring API should prefer typed named handles over string event
names.

## View API

The view API is the core builder layer. It is named `view` rather than `h`
(hyperscript) or `dom` because `view.button(...)` reads as a declarative
statement — aligned with the goal of code that reads like a sentence — and does
not imply imperative DOM manipulation. The shorter alternatives (`h`, `el`) are
too terse for agent-authored code.

The component property that returns the view is called `render` to align with
the universal convention and to avoid naming overlap with the `view` primitive
in scope.

### Elements

`view.element()` is for statically known tag names and stays on the analyzable
path.

```ts
view.element("progress", props)
```

Agents should usually use typed helpers instead:

```ts
view.div(...)
view.section(...)
view.article(...)
view.header(...)
view.footer(...)
view.main(...)
view.nav(...)
view.form(...)
view.label(...)
view.input(...)
view.textarea(...)
view.select(...)
view.option(...)
view.button(...)
view.a(...)
view.ul(...)
view.ol(...)
view.li(...)
view.p(...)
view.span(...)
view.h1(...)
view.h2(...)
view.h3(...)
view.img(...)
view.svg(...)
view.canvas(...)
```

Canonical props shape:

```ts
view.button({
	id: "clear-completed-button",
	class: ["button", { "is-active": state.hasCompleted.get() }],
	text: "Clear completed",
	disabled: state.noCompleted.get(),
	onClick: actions.clearCompleted,
});
```

### Text and children

Use one canonical shape.

Use `text` only for leaf elements:

```ts
view.button({ text: "Save" })
```

Use `children` for mixed content. Children may directly contain text-like
values, state refs, computed refs, and view nodes.

```ts
view.p({
	id: "remaining-count",
	children: [state.remaining.get(), " remaining"],
});
```

The compiler should warn when an element has both `text` and `children`.

### Classes

Class bindings should be structured and analyzable.

Supported canonical shapes:

```ts
class: "button"
class: ["button", "primary"]
class: ["button", { completed: todo.completed }]
class: {
	completed: todo.completed,
}
```

Prefer array form when combining fixed and conditional classes. It reads more
naturally and avoids `static-class: true` noise.

### Arbitrary element attributes

Common HTML props should stay first-class, but custom attributes and
`data-*` attributes need an explicit escape hatch:

```ts
view.div({
	attributes: {
		"data-testid": "todo-list",
		"x-state": "ready",
	},
})
```

Use `attributes` for uncommon, vendor-specific, or `data-*` cases. Keep common
attributes such as `id`, `role`, `href`, `disabled`, and typed ARIA props as
top-level fields.

Avoid a conditional helper such as `when(condition, "class")`; it overloads the
meaning of conditional rendering.

### Inline styles

Inline styles may be supported:

```ts
style: {
	display: "flex",
	gap: "1rem",
}
```

Large inline style objects should be discouraged for production apps unless
intentionally desired.

## Control flow

### `show()`

Conditional rendering should use `show()`.

```ts
show(condition, {
	render: () => ViewNode,
	fallback?: () => ViewNode,
})
```

Example:

```ts
show(state.loading, {
	render: () =>
		view.div({
			id: "loading-state",
			class: "loading",
			text: "Loading...",
		}),
	fallback: () => contentView(),
});
```

This should lower to `showBlock()`.

### `each()`

List rendering:

```ts
each(source, {
	id: string,
	key?: keyof T | ((item: T) => string),
	render: (item, index) => ViewNode,
})
```

Example:

```ts
each(state.todos, {
	id: "todo-items",
	key: "id",
	render: (todo) =>
		view.label({
			id: `todo-${todo.id}`,
			class: ["todo", { completed: todo.completed }],
			children: [
				view.input({
					type: "checkbox",
					checked: todo.completed,
					onChange: actions.toggleTodo(todo.id),
				}),
				view.span({ text: todo.text }),
			],
		}),
});
```

This should lower to `forBlock()`.

## Escape hatches

Escape hatches are necessary but should be explicit and uncommon.

```ts
view.rawHtml({
	id: "trusted-content",
	html: trustedHtml,
});
```

```ts
view.dynamicElement(tag, props, children);
```

Use `view.element()` when the tag is statically known. Use
`view.dynamicElement()` only when the tag itself is a runtime value and you are
intentionally leaving the fully analyzable path.

```ts
view.canvas({
	id: "scene-canvas",
	ref: "canvas",
});
```

```ts
lifecycle: {
	onConnect({ refs }) {
		const chart = createChart(refs.canvas);
		return () => chart.destroy();
	},
}
```

Agents should treat these as exceptional, not the default path.

## Internal IR

The `roqa` API should lower into a component IR before code generation. See
[ir.md](./ir.md) for the full IR schema and [compiler.md](./compiler.md) for
the compilation pipeline.

Summary IR shape:

```ts
type ComponentIR = {
	name: string;
	tagName: string;
	props: PropIR[];
	attrs: AttrIR[];
	state: StateIR[];
	emits: EventIR[];
	lifecycle: LifecycleIR;
	render: NodeIR;
};

type StateIR =
	| { kind: "value"; name: string; initial: ExpressionIR }
	| { kind: "collection"; name: string; key: KeyIR; initial: ExpressionIR }
	| { kind: "computed"; name: string; expr: ExpressionIR };

type NodeIR =
	| ElementIR
	| TextIR
	| ShowIR
	| EachIR
	| RawHtmlIR;

type ElementIR = {
	kind: "element";
	tag: string;
	ref?: string;
	props: ElementPropIR[];
	attributes: AttributeBindingIR[];
	classes?: ClassListIR;
	styles?: StyleIR[];
	events: EventBindingIR[];
	children: NodeIR[];
};

type ShowIR = {
	kind: "show";
	condition: ExpressionIR;
	render: NodeIR;
	fallback?: NodeIR;
};

type EachIR = {
	kind: "each";
	source: ExpressionIR;
	key?: KeyIR;
	blockId: string;
	renderItem: ExpressionIR;
};
```

This keeps the IR centered on compiler-relevant structure rather than mirroring
every authoring helper one-for-one.

This would allow multiple frontends and backends:

```txt
JSX frontend       \
                    -> Roqa IR -> Backend codegen
Builder frontend   /
```

## Backend preservation requirements

Any agent API must preserve these implementation properties:

| Existing mechanism | Required preservation strategy |
| --- | --- |
| Cells | `state.*` lowers to `cell`, `get`, `set`, `put`, `bind`, and `notify` semantics. |
| Template cloning | Static view nodes lower to `template("<...>")` and cloned DOM. |
| Aggressive inlining | `state.count.get()` / `state.count.set()` can inline like `get(count)` / `set(count, value)`. |
| List reconciliation | `each(...)` lowers to `forBlock()`. |
| Conditional rendering | `show(...)` lowers to `showBlock()`. |
| Event delegation | `onClick` and related handlers lower to `element.__click = handler` plus `delegate(["click"])`. |
| Custom elements | `component(...)` lowers to `defineComponent(...)`. |
| No virtual DOM | Builders produce compile-time structure, not runtime VDOM nodes. |

## Static recognizability

The compiler should be able to statically recognize most view definitions.

Good:

```ts
view.div({
	id: "card",
	class: "card",
	children: [
		view.span({ text: state.title.get() }),
	],
});
```

Harder:

```ts
const tag = Math.random() > 0.5 ? "div" : "section";
view.element(tag, props); // should fail static analysis
```

Dynamic cases should be explicit escape hatches:

```ts
view.dynamicElement(tag, props, children);
```

Plain JavaScript expressions should remain acceptable inside compiler-recognized
boundaries. A separate `expr.*` mini-language should not be part of the initial
public API unless real compiler limitations prove it necessary.

## Authoring rules

The core API should optimize for reliable authoring.

- Prefer typed handles over string keys.
- Prefer declarations that return typed values.
- Prefer one canonical shape for each concept.
- Prefer explicit object composition over hidden convention.
- Prefer code that reads almost like a sentence when it is spoken aloud.

## North-star example

```ts
import { command, component, computed, each, event, show, state, view } from "roqa";

type Todo = {
	id: string;
	text: string;
	completed: boolean;
};

export const TodoList = component("todo-list", {
	state: {
		todos: state.collection<Todo>({
			key: "id",
			initial: [],
		}),
		draft: state.value<string>({ initial: "" }),
		remaining: computed(({ state }) =>
			state.todos.get().filter((todo) => !todo.completed).length,
		),
		hasCompleted: computed(({ state }) =>
			state.todos.get().some((todo) => todo.completed),
		),
	},

	emits: {
		todoAdded: event<Todo>({ name: "todo-added" }),
	},

	actions: {
		setDraft: command(({ state }, value: string) => {
			state.draft.set(value);
		}),

		addTodo: command(({ state, emit }) => {
			const text = state.draft.get().trim();
			if (!text) return;

			const todo = {
				id: crypto.randomUUID(),
				text,
				completed: false,
			};

			state.todos.insert(todo);
			emit.todoAdded(todo);

			state.draft.set("");
		}),

		toggleTodo: command(({ state }, id: string) => {
			state.todos.update(id, (todo) => ({
				...todo,
				completed: !todo.completed,
			}));
		}),

		clearCompleted: command(({ state }) => {
			state.todos.removeWhere((todo) => todo.completed);
		}),
	},

	render: ({ state, actions }) =>
		view.section({
			id: "todo-list-root",
			children: [
				view.input({
					id: "new-todo-input",
					type: "text",
					label: "New todo",
					value: state.draft.get(),
					onInput: actions.setDraft,
					placeholder: "Add todo item",
				}),

				each(state.todos, {
					id: "todo-items",
					key: "id",
					render: (todo) =>
						view.label({
							id: `todo-${todo.id}`,
							class: ["todo", { completed: todo.completed }],
							children: [
								view.input({
									type: "checkbox",
									checked: todo.completed,
									onChange: actions.toggleTodo(todo.id),
								}),
								todo.text,
							],
						}),
				}),

				view.p({
					id: "remaining-count",
					children: [state.remaining.get(), " remaining"],
				}),

				show(state.hasCompleted, {
					render: () =>
						view.button({
							id: "clear-completed-button",
							text: "Clear completed",
							onClick: actions.clearCompleted,
						}),
				}),
			],
		}),
});
```

## Core API stress samples

These examples are not new APIs. They are light stress tests of the core
surface: different scales, awkward edges, mixed concerns, and cases where agent
authored code is likely to drift.

### Minimal presentational component

Small components should stay small and omit unused sections.

```ts
export const UserChip = component("user-chip", {
	props: {
		name: prop.value<string>({ required: true }),
	},

	render: ({ props }) =>
		view.span({
			class: "user-chip",
			text: props.name,
		}),
});
```

### Props and attrs in the same component

This stresses the distinction between rich JS props and serialized DOM attrs.

```ts
type User = {
	id: string;
	name: string;
	email: string;
};

export const UserCard = component("user-card", {
	props: {
		user: prop.value<User>({ required: true }),
	},

	attrs: {
		size: attr.value<"compact" | "full">({
			default: "full",
			reflect: true,
		}),
		disabled: attr.value<boolean>({ default: false, reflect: true }),
	},

	state: {
		isCompact: computed(({ attrs }) => attrs.size === "compact"),
	},

	render: ({ props, attrs, state }) =>
		view.article({
			class: [
				"user-card",
				{
					"is-compact": state.isCompact.get(),
					"is-disabled": attrs.disabled.get(),
				},
			],
			children: [
				view.h2({ text: props.user.name }),
				show(state.isCompact, {
					render: () => view.p({ text: props.user.email }),
					fallback: () =>
						view.div({
							children: [
								view.p({ children: ["User ID: ", props.user.id] }),
								view.p({ text: props.user.email }),
							],
						}),
				}),
			],
		}),
});
```

### Typed emits plus bound actions

This stresses typed event handles, per-item actions, and normalized input.

```ts
type Filter = "all" | "active" | "completed";

export const TodoFilters = component("todo-filters", {
	state: {
		selected: state.value<Filter>({
			initial: "all",
		}),
	},

	emits: {
		filterChanged: event<{ filter: Filter }>({ name: "filter-changed" }),
	},

	actions: {
		selectFilter: command(({ state, emit }, filter: Filter) => {
			state.selected.set(filter);
			emit.filterChanged({ filter });
		}),
	},

	render: ({ state, actions }) =>
		view.div({
			role: "tablist",
			children: each(["all", "active", "completed"], {
				id: "filter-tabs",
				key: (filter) => filter,
				render: (filter) =>
					view.button({
						role: "tab",
						class: ["tab", { "is-selected": state.selected.get() === filter }],
						ariaSelected: state.selected.get() === filter,
						text: filter,
						onClick: actions.selectFilter(filter),
					}),
			}),
		}),
});
```

### Large local state with collection helpers

This stresses a heavier component with multiple state cells, collection updates,
derived values, and multiple conditional regions.

```ts
type Upload = {
	id: string;
	name: string;
	progress: number;
	status: "queued" | "uploading" | "done" | "error";
};

export const UploadQueue = component("upload-queue", {
	state: {
		items: state.collection<Upload>({
			key: "id",
			initial: [],
		}),
		dragging: state.value<boolean>({ initial: false }),
		activeCount: computed(({ state }) =>
			state.items.get().filter((item) => item.status === "uploading").length,
		),
		hasFailures: computed(({ state }) =>
			state.items.get().some((item) => item.status === "error"),
		),
	},

	actions: {
		setDragging: command(({ state }, dragging: boolean) => {
			state.dragging.set(dragging);
		}),

		retryItem: command(({ state }, id: string) => {
			state.items.update(id, (item) => ({
				...item,
				status: "queued",
				progress: 0,
			}));
		}),

		clearFinished: command(({ state }) => {
			state.items.removeWhere((item) => item.status === "done");
		}),
	},

	render: ({ state, actions }) =>
		view.section({
			class: ["upload-queue", { "is-dragging": state.dragging.get() }],
			children: [
				view.header({
					children: [
						view.h2({ text: "Uploads" }),
						view.p({
							children: [state.activeCount.get(), " active"],
						}),
					],
				}),
				show(state.hasFailures, {
					render: () =>
						view.p({
							role: "alert",
							text: "Some uploads failed.",
						}),
				}),
				each(state.items, {
					id: "upload-items",
					key: "id",
					render: (item) =>
						view.article({
							id: `upload-${item.id}`,
							class: ["upload", `is-${item.status}`],
							children: [
								view.p({ text: item.name }),
								view.element("progress", {
									max: 100,
									value: item.progress,
								}),
								show(item.status === "error", {
									render: () =>
										view.button({
											text: "Retry",
											onClick: actions.retryItem(item.id),
										}),
								}),
							],
						}),
				}),
				view.footer({
					children: [
						view.button({
							text: "Clear finished",
							onClick: actions.clearFinished,
						}),
					],
				}),
			],
		}),
});
```

### Lifecycle plus refs

This stresses the imperative boundary without adding new abstractions.

```ts
export const FocusTrap = component("focus-trap", {
	lifecycle: {
		onConnect({ refs }) {
			const first = refs.firstFocusable;
			if (first) first.focus();
		},
	},

	render: () =>
		view.div({
			children: [
				view.button({
					ref: "firstFocusable",
					text: "Start",
				}),
				view.button({
					text: "End",
				}),
			],
		}),
});
```

### Escape hatch: dynamic elements

This is intentionally less analyzable. The spec should keep it explicit.

```ts
export const PolymorphicText = component("polymorphic-text", {
	props: {
		tag: prop.value<string>({ default: "span" }),
		text: prop.value<string>({ required: true }),
	},

	render: ({ props }) =>
		view.dynamicElement(props.tag, {}, [props.text]),
});
```

## Strategic positioning

Roqa should not be positioned as "a tiny JSX framework" if this direction is
adopted.

Potential positioning:

> Roqa is the compile-time web application framework designed for coding agents:
> explicit, inspectable, patchable, validated, and production-grade by default.

The public API should optimize for deterministic authoring and compiler-guided
repair. The backend should remain ruthlessly performance-oriented.
