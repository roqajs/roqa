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
| Core compiler API | Components, state, rendering, events, async data | `component`, `state`, `prop`, `attr`, `computed`, `action`, `resource`, `view`, `show`, `each` |
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
	action,
	resource,
	event,
	view,
	show,
	each,
} from "roqa";
```

Low-level primitives should continue to exist for advanced users and compiler
output.

```ts
import {
	cell,
	get,
	set,
	put,
	bind,
	notify,
	template,
	forBlock,
	showBlock,
	defineComponent,
	delegate,
} from "roqa";
```

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
	view: ({ state, actions }) => {},
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
- Keep `view` as a static, compiler-recognizable declaration.
- Use escape hatches for dynamic markup or imperative integrations.

Example:

```ts
import { action, component, computed, state, view } from "roqa";

export const CounterButton = component("counter-button", {
	state: {
		count: state.number({ initial: 0 }),
		doubled: computed(({ state }) => state.count.get() * 2),
	},

	actions: {
		increment: action(({ state }) => {
			state.count.set(state.count.get() + 1);
		}),
	},

	view: ({ state, actions }) =>
		view.button({
			id: "increment-button",
			onClick: actions.increment,
			children: ["Count is ", state.count, " / doubled is ", state.doubled],
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

## State

State should be authored with higher-level helpers but lower to Roqa cells.
Prefer options objects for consistency. Writable state and derived state should
live in the same `state` object.

```ts
state.value<T>({ initial: value })
state.string({ initial?: string })
state.number({ initial?: number })
state.boolean({ initial?: boolean })
state.array<T>({ initial?: T[] })
state.object<T>({ initial: T })
state.enum<T extends string>(values: T[], { initial: T })
computed(({ state, props, attrs, resources }) => expression)
```

Example:

```ts
component("status-panel", {
	state: {
		name: state.string({ initial: "" }),
		count: state.number({ initial: 0 }),
		loading: state.boolean({ initial: false }),
		todos: state.array<Todo>({ initial: [] }),
		status: state.enum(["idle", "loading", "error", "ready"], {
			initial: "idle",
		}),
		hasTodos: computed(({ state }) => state.todos.get().length > 0),
	},
});
```

Lowering:

```ts
const count = cell(0);
const loading = cell(false);
```

Lowering after compiler optimizations:

```ts
const count = { v: 0, e: [] };
const loading = { v: false, e: [] };
```

## Collection state

Collections should exist because agents frequently make mistakes with object and
array mutation. A collection is still state, but with compiler-known update
helpers.

```ts
state.collection<T>({
	key: keyof T | ((item: T) => string),
	initial?: T[],
})
```

Authoring API:

```ts
state.todos.get()
state.todos.set(nextTodos)
state.todos.insert(todo)
state.todos.update(id, patchOrUpdater)
state.todos.remove(id)
state.todos.removeWhere(predicate)
state.todos.clear()
state.todos.notify()
```

Example:

```ts
component("todo-list", {
	state: {
		todos: state.collection<Todo>({
			key: "id",
			initial: [],
		}),
	},

	actions: {
		toggleTodo: action(({ state }, id: string) => {
			state.todos.update(id, (todo) => ({
				...todo,
				completed: !todo.completed,
			}));
		}),
	},
});
```

This can lower to a cell containing an array plus compiler-known update
patterns.

Derived state should be read-only. It should lower to a derived `cell(() => ...)`
or another compiler-known derived binding.

## Props and attributes

Roqa should maintain a sharp distinction between JavaScript properties and DOM
attributes.

| Use | Purpose |
| --- | --- |
| `attrs` | Public HTML/config surface: strings, booleans, numbers, enums |
| `props` | Fast arbitrary JS values: primitives, objects, arrays, callbacks, services, platform objects |
| `state` | Component-owned mutable data |

### Props

Props are JavaScript values passed to custom elements. They should lower to
property access mechanisms rather than serialized attributes. Props are the fast
path and should support arbitrary JS values. Prefer props unless semantic
custom-element attributes are specifically needed.

```ts
prop.value<T>({ required?: boolean, default?: T })
```

Example:

```ts
component("story-item", {
	props: {
		story: prop.value<Story>({ required: true }),
		index: prop.value<number>({ default: 0 }),
	},

	view: ({ props }) =>
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
attr.string({ default?: string, reflect?: boolean })
attr.boolean({ default?: boolean, reflect?: boolean })
attr.number({ default?: number, reflect?: boolean })
attr.enum(["small", "medium", "large"], {
	default?: "small" | "medium" | "large",
	reflect?: boolean,
})
```

Example:

```ts
component("app-button", {
	attrs: {
		disabled: attr.boolean({ default: false, reflect: true }),
		variant: attr.enum(["primary", "secondary"], {
			default: "primary",
			reflect: true,
		}),
	},

	view: ({ attrs }) =>
		view.button({
			disabled: attrs.disabled,
			class: ["btn", `btn-${attrs.variant}`],
		}),
});
```

Lowering should use `observedAttributes`, `attributeChangedCallback`, and
internal cells when reactive attribute bindings are needed.

## Actions

Actions are named component commands. They are the canonical place for event
handling, state mutation, imperative work, and async mutations.

Actions should be exposed as typed named object members, not dynamically looked
up by string.

The core API should not include a separate top-level `tasks` concept. Agents
should not need to decide whether something is an action or a task. The simpler
rule is:

- actions do things
- resources hold async data
- derived state lives in `state`

TypeScript should infer payload types from the action function signature.

```ts
action(fn)
action.async(fn)
```

Examples:

```ts
actions: {
	clearCompleted: action(({ state }) => {
		state.todos.removeWhere((todo) => todo.completed);
	}),

	setDraft: action(({ state }, value: string) => {
		state.draft.set(value);
	}),

	handleKeydown: action(({ actions }, event: KeyboardEvent) => {
		if (event.key === "Enter") actions.addTodo();
	}),

	saveTodo: action.async(async ({ state }, text: string) => {
		const saved = await saveTodo(text);
		state.todos.insert(saved);
	}),
}
```

Actions receive a structured context:

```ts
type ActionContext = {
	host: RoqaElement;
	props: Props;
	attrs: Attrs;
	state: State;
	actions: Actions;
	resources: Resources;
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

### Normalized input events

Typed form-control helpers may expose normalized event props for the common
cases agents otherwise get wrong.

```ts
view.input({
	type: "text",
	value: state.draft,
	onValue: actions.setDraft,
});

view.input({
	type: "checkbox",
	checked: todo.completed,
	onChecked: actions.toggleTodo(todo.id),
});
```

Recommended normalized props:

| Prop | Payload |
| --- | --- |
| `onValue` | `string` for text-like controls |
| `onChecked` | `boolean` for checkboxes and switches |
| `onSubmit` | `SubmitEvent` for low-level forms, or validated payload in `roqa/forms` |

### Bound actions

Action handles should read like verbs. Passing an action directly uses it as the
handler. Calling an action with arguments returns a bound handler.

```ts
onClick: actions.clearCompleted
onChecked: actions.toggleTodo(todo.id)
```

## Resources

Resources are declarative async values with lifecycle state. They should cover
the common loading/error/data/reload pattern so agents do not hand-roll it in
every component.

```ts
resource<T, Input = void>({
	initial: T,
	load: (ctx: ResourceContext, input: Input) => Promise<T>,
	refresh?: {
		onConnect?: true,
	},
})
```

Resource context should include cancellation support.

```ts
type ResourceContext = {
	host: RoqaElement;
	props: Props;
	attrs: Attrs;
	state: State;
	signal: AbortSignal;
};
```

Generated resource shape:

```ts
resources.stories.data
resources.stories.status.isIdle
resources.stories.status.isLoading
resources.stories.status.isReady
resources.stories.status.isError
resources.stories.error
resources.stories.reload(input?)
```

Example:

```ts
resources: {
	stories: resource<Story[]>({
		initial: [],
		refresh: { onConnect: true },
		load: async ({ signal }) => {
			const response = await fetch("/api/stories", { signal });
			if (!response.ok) throw new Error("Failed to load stories");
			return response.json();
		},
	}),
}
```

Required semantics:

- reloads must be race-safe
- stale responses must not overwrite newer responses
- `AbortSignal` should cancel obsolete requests
- resources should clean up on disconnect

## Lifecycle

Lifecycle hooks should map to the existing `RoqaElement` methods.

```ts
lifecycle: {
	onConnect?: ActionName | ((ctx) => void | (() => void));
	onDisconnect?: ActionName | ((ctx) => void);
}
```

Example:

```ts
lifecycle: {
	onConnect: "start",
	onDisconnect: "stop",
}
```

Lowering:

```ts
this.connected(...);
this.disconnected(...);
```

Async lifecycle work should usually be represented by an async action or a
resource with `refresh: { onConnect: true }`.

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
	addTodo: action(({ state, emit }) => {
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

The view API is the core builder layer. It should describe static markup,
dynamic bindings, events, list blocks, and conditionals in a compiler-friendly
way.

### Elements

```ts
view.element(tagName, props)
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
	class: {
		button: true,
		"is-active": state.hasCompleted,
	},
	text: "Clear completed",
	disabled: state.noCompleted,
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
values, state refs, derived state refs, and view nodes.

```ts
view.p({
	id: "remaining-count",
	children: [state.remaining, " remaining"],
});
```

The compiler should warn when an element has both `text` and `children`.

### Classes

Class bindings should be structured and analyzable.

Supported canonical shapes:

```ts
class: "button"
class: ["button", "primary"]
class: {
	button: true,
	completed: todo.completed,
}
```

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
			class: {
				todo: true,
				completed: todo.completed,
			},
			children: [
				view.input({
					type: "checkbox",
					checked: todo.completed,
					onChecked: actions.toggleTodo(todo.id),
				}),
				view.span({ text: todo.text }),
			],
		}),
});
```

This should lower to `forBlock()`.

## Accessibility

Accessibility should be enforced through typed element props and compiler
diagnostics.

Prefer discoverable props on controls:

```ts
view.input({
	id: "new-todo-input",
	type: "text",
	label: "New todo",
	value: state.draft,
	onValue: actions.setDraft,
	placeholder: "Add todo item",
});
```

The compiler and CLI should warn about:

- missing labels on form controls
- inaccessible custom controls
- unsafe ARIA combinations
- missing error associations
- click handlers on non-interactive elements
- keyboard traps and missing keyboard affordances when detectable

High-level accessible form generation should live in `roqa/forms`, not the core
API.

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

The `roqa` API should lower into a component IR before code generation.

Possible IR concepts:

- `ComponentDefinition`
- `StateCell`
- `CollectionCell`
- `DerivedCell`
- `PropDefinition`
- `AttributeDefinition`
- `ActionDefinition`
- `ResourceDefinition`
- `LifecycleHook`
- `ElementNode`
- `TextNode`
- `DynamicTextBinding`
- `DynamicAttributeBinding`
- `EventBinding`
- `ListBlock`
- `ShowBlock`
- `PropBinding`
- `CustomEventDefinition`

This would allow multiple frontends and backends:

```txt
JSX frontend       \
Builder frontend   -> Roqa IR -> Backend codegen
JSON frontend      /
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
		view.span({ text: state.title }),
	],
});
```

Harder:

```ts
const tag = Math.random() > 0.5 ? "div" : "section";
view.element(tag, props);
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
import { action, component, computed, each, event, show, state, view } from "roqa";

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
		draft: state.string({ initial: "" }),
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
		setDraft: action(({ state }, value: string) => {
			state.draft.set(value);
		}),

		addTodo: action(({ state, emit }) => {
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

		toggleTodo: action(({ state }, id: string) => {
			state.todos.update(id, (todo) => ({
				...todo,
				completed: !todo.completed,
			}));
		}),

		clearCompleted: action(({ state }) => {
			state.todos.removeWhere((todo) => todo.completed);
		}),
	},

	view: ({ state, actions }) =>
		view.section({
			id: "todo-list-root",
			children: [
				view.input({
					id: "new-todo-input",
					type: "text",
					label: "New todo",
					value: state.draft,
					onValue: actions.setDraft,
					onEnter: actions.addTodo,
					placeholder: "Add todo item",
				}),

				each(state.todos, {
					id: "todo-items",
					key: "id",
					render: (todo) =>
						view.label({
							id: `todo-${todo.id}`,
							class: {
								todo: true,
								completed: todo.completed,
							},
							children: [
								view.input({
									type: "checkbox",
									checked: todo.completed,
									onChecked: actions.toggleTodo(todo.id),
								}),
								todo.text,
							],
						}),
				}),

				view.p({
					id: "remaining-count",
					children: [state.remaining, " remaining"],
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

	view: ({ props }) =>
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
		size: attr.enum(["compact", "full"], {
			default: "full",
			reflect: true,
		}),
		disabled: attr.boolean({ default: false, reflect: true }),
	},

	state: {
		isCompact: computed(({ attrs }) => attrs.size === "compact"),
	},

	view: ({ props, attrs, state }) =>
		view.article({
			class: {
				"user-card": true,
				"is-compact": state.isCompact,
				"is-disabled": attrs.disabled,
			},
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

### Resource-driven view states

This stresses loading, error, empty, and ready states without introducing extra
framework concepts.

```ts
type Story = {
	id: string;
	title: string;
	url: string;
};

export const StoryFeed = component("story-feed", {
	resources: {
		stories: resource<Story[]>({
			initial: [],
			refresh: { onConnect: true },
			load: async ({ signal }) => {
				const response = await fetch("/api/stories", { signal });
				if (!response.ok) throw new Error("Failed to load stories");
				return response.json();
			},
		}),
	},

	state: {
		isEmpty: computed(({ resources }) => resources.stories.data.length === 0),
	},

	view: ({ resources, state }) =>
		view.section({
			id: "story-feed",
			children: [
				show(resources.stories.status.isLoading, {
					render: () => view.p({ text: "Loading..." }),
				}),
				show(resources.stories.status.isError, {
					render: () =>
						view.p({
							role: "alert",
							text: resources.stories.error.message,
						}),
				}),
				show(resources.stories.status.isReady && state.isEmpty.get(), {
					render: () => view.p({ text: "No stories yet." }),
				}),
				each(resources.stories.data, {
					id: "story-items",
					key: "id",
					render: (story) =>
						view.article({
							id: `story-${story.id}`,
							children: [view.a({ href: story.url, text: story.title })],
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
		selected: state.enum(["all", "active", "completed"], {
			initial: "all",
		}),
	},

	emits: {
		filterChanged: event<{ filter: Filter }>({ name: "filter-changed" }),
	},

	actions: {
		selectFilter: action(({ state, emit }, filter: Filter) => {
			state.selected.set(filter);
			emit.filterChanged({ filter });
		}),
	},

	view: ({ state, actions }) =>
		view.div({
			role: "tablist",
			children: each(["all", "active", "completed"], {
				id: "filter-tabs",
				key: (filter) => filter,
				render: (filter) =>
					view.button({
						role: "tab",
						class: {
							tab: true,
							"is-selected": state.selected.get() === filter,
						},
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
		dragging: state.boolean({ initial: false }),
		activeCount: computed(({ state }) =>
			state.items.get().filter((item) => item.status === "uploading").length,
		),
		hasFailures: computed(({ state }) =>
			state.items.get().some((item) => item.status === "error"),
		),
	},

	actions: {
		setDragging: action(({ state }, dragging: boolean) => {
			state.dragging.set(dragging);
		}),

		retryItem: action(({ state }, id: string) => {
			state.items.update(id, (item) => ({
				...item,
				status: "queued",
				progress: 0,
			}));
		}),

		clearFinished: action(({ state }) => {
			state.items.removeWhere((item) => item.status === "done");
		}),
	},

	view: ({ state, actions }) =>
		view.section({
			class: {
				"upload-queue": true,
				"is-dragging": state.dragging,
			},
			children: [
				view.header({
					children: [
						view.h2({ text: "Uploads" }),
						view.p({
							children: [state.activeCount, " active"],
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
							class: {
								upload: true,
								[`is-${item.status}`]: true,
							},
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

	view: () =>
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

	view: ({ props }) =>
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
