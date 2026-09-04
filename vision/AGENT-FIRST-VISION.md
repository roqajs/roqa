# Roqa Without a Compiler: An Earlier Agent-First Exploration

> Status: earlier exploratory draft. The current direction restores a narrowly
> scoped static-template compiler; see
> [Agent-first Roqa: current direction](./AGENT-FIRST-DESIGN.md).

## The idea

Roqa could become a UI framework designed first for coding agents rather than one designed to look familiar to human authors.

In this version of Roqa, both JSX and the Roqa compiler are removed. Static template cloning, direct DOM traversal, cells, bindings, delegated events, control-flow blocks, and custom-element lifecycle hooks become the authoring format. Coding agents write ordinary low-level JavaScript or TypeScript with those runtime primitives, guided by a Roqa skill and a few narrow CLI commands.

The bet is that an agent does not need syntax that resembles HTML inside JavaScript. It needs a compact, explicit, mechanically verifiable target with:

- a small number of concepts;
- predictable runtime behavior;
- strong examples and rules;
- fast feedback when it makes a mistake; and
- no Roqa-owned transformation between source and browser.

The end state is not a smaller compiler or a compiler hidden in a Vite plugin. There is no Roqa compilation step. The source already expresses the efficient DOM operations that the browser runs, and normal ecosystem tools only erase TypeScript, bundle, and minify it when a project chooses to use them.

## Why remove the compiler rather than only JSX?

JSX is useful because it makes component trees legible to people and gives JavaScript a familiar markup-shaped authoring experience. It also creates much of the complexity in Roqa:

- JSX must be parsed, analyzed, validated, and transformed.
- Static and dynamic regions must be distinguished.
- DOM paths and reactive dependencies must be inferred.
- control flow needs framework-specific JSX constructs.
- source behavior can be difficult to understand without reading generated output.
- compiler correctness and source maps become part of the framework's permanent maintenance burden.

Coding agents change the tradeoff. They can reliably produce repetitive, lower-level code when the target language is well documented and feedback is immediate. What is tedious for a person can be a good authoring format for an agent if it is explicit and constrained.

Removing JSX is therefore not only a syntax change. It removes the need for a framework compiler and moves ergonomics into an agent-facing layer made of runtime primitives, instructions, examples, diagnostics, and explicit source generators.

## The hard boundary: no framework compiler

This direction needs a crisp boundary so that convenience tooling does not gradually recreate the compiler under another name.

In the intended end state:

- application modules are normal `.js` or `.ts` files;
- importing `roqa` is sufficient to run an authored component;
- no Roqa Babel, TypeScript, Vite, or bundler transform is required;
- no build step infers templates, DOM paths, reactive dependencies, events, or cleanup; and
- the browser runs the operations visible in source, apart from ordinary ecosystem bundling and minification.

The CLI may still generate source. A source generator is different from a compiler:

- it runs only when an agent or person explicitly invokes it;
- it performs one narrow, deterministic task;
- it writes or prints ordinary source that is checked in and can be reviewed and edited;
- its output does not need the generator, hidden metadata, or a Roqa build plugin to run; and
- rerunning it is an authoring action, not part of serving or building the application.

For example, a command may parse a static HTML fragment and generate the direct `firstElementChild`, `firstChild`, and `nextSibling` statements needed to capture selected nodes. The agent then uses those references while writing bindings, event handlers, block ownership, and component behavior. The command should not accept an arbitrary component and infer the complete implementation; that would simply be a new compiler.

This also means letting go of some optimizations that only make sense when a compiler can rewrite the whole program. Roqa should preserve fine-grained DOM updates and avoid obviously wasteful runtime work, but it does not need to inline every cell read, subscription, or write into application code. A small amount of runtime indirection and some additional bytes are acceptable if they buy a much smaller framework, a stable public model, and source whose behavior is visible without inspecting generated output.

## What stays Roqa

This direction should preserve the properties that make Roqa distinct:

- **Fine-grained reactivity.** A state change runs only the bindings attached to that state, which then perform their focused DOM operations.
- **Static templates.** Stable markup is parsed once and cloned for each component instance.
- **Small runtime primitives.** Cells and bindings remain understandable as lightweight JavaScript.
- **Delegated events.** Event types are registered explicitly and dispatched from shared root listeners.
- **Native output.** Components remain custom elements made from standard DOM nodes and vanilla JavaScript.
- **No Shadow DOM by default.** Components continue to participate naturally in the page's styling model.
- **Explicit ownership and cleanup.** Dynamic blocks and effects have clear lifetimes.
- **Portability.** Authored components can run anywhere the browser APIs they use are available.

The goal is not to replace Roqa with a virtual DOM, a runtime JSX implementation, or another template language.

## The authoring model

An agent-authored Roqa component would be a plain JavaScript or TypeScript module. It would use a deliberately small vocabulary:

| Area         | Primitives                                                                          |
| ------------ | ----------------------------------------------------------------------------------- |
| Templates    | `template`, `svgTemplate`                                                           |
| Reactivity   | `cell`, `get`, `set`, `put`, `bind`, `notify`                                       |
| Components   | `defineComponent`, `setProp`, component lifecycle methods                           |
| Events       | `delegate`, `__event` handler slots, `handleRootEvents`, component-scoped listeners |
| Control flow | `showBlock`, `forBlock`                                                             |
| Platform     | standard DOM properties, methods, and events                                        |

Static HTML belongs in a module-level template. A component clones that template, keeps direct references to the dynamic nodes it owns, and binds cells to the smallest possible DOM mutations. Conditional and repeated regions use explicit block primitives with explicit cleanup. Agents can ask the CLI to calculate fragile traversal statements, but the resulting statements remain normal application source.

For example, a counter could look roughly like this:

```js
import { bind, cell, defineComponent, delegate, get, set, template } from "roqa";

const counterTemplate = template(
	'<button type="button">Count is <span>0</span></button>' +
		"<p>Doubled: <span>0</span></p>",
);

function Counter() {
	const count = cell(0);

	this.connected(() => {
		const fragment = counterTemplate();
		const button = fragment.firstChild;
		const countValue = button.firstElementChild;
		const doubledValue = fragment.lastElementChild.firstElementChild;

		button.__click = () => set(count, get(count) + 1);

		const unbind = bind(count, (value) => {
			countValue.textContent = String(value);
			doubledValue.textContent = String(value * 2);
		});

		this.append(fragment);
		return unbind;
	});
}

defineComponent("counter-button", Counter);
delegate(["click"]);
```

The exact APIs may change. The important property is that the source says what the runtime does. There is no JSX AST and no transformation required to discover templates, node references, dependencies, event assignments, or cleanup.

## Event delegation is foundational

Delegated events should be a first-class part of the authoring format, not an optimization hidden behind tooling.

Each module explicitly registers the event types it uses with `delegate`. Elements expose handlers through `__event` properties such as `__click` and `__input`. Roqa installs one listener for each registered event type at the root and dispatches an event along its composed path.

```js
import { defineComponent, delegate, template } from "roqa";

const menuTemplate = template(
	'<nav aria-label="Account"><button type="button">Open profile</button></nav>',
);

function AccountMenu() {
	this.connected(() => {
		const fragment = menuTemplate();
		const button = fragment.firstElementChild.firstElementChild;

		button.__click = (event) => {
			this.emit("open-profile", { source: event.currentTarget });
		};

		this.append(fragment);
	});
}

defineComponent("account-menu", AccountMenu);
delegate(["click"]);
```

Delegation provides several useful guarantees for agent-authored code:

- event registration is visible at module scope;
- template instances do not allocate a native listener for each element;
- `event.currentTarget` points at the element whose delegated handler is running;
- normal bubbling and `stopPropagation` behavior are preserved;
- disabled elements do not invoke delegated handlers; and
- the same mechanism works across document and shadow roots through `handleRootEvents`.

The parameterized handler form should be the standard pattern inside repeated blocks. It avoids allocating one closure per rendered item:

```js
function removeTodo(todo, event) {
	event.preventDefault();
	console.log("Remove", todo.id);
}

removeButton.__click = [removeTodo, todo];
```

The runtime invokes this as `removeTodo(todo, event)` with `this` set to `removeButton`. The skill should teach the simple function form and parameterized array form as the only default event patterns. Native listeners and component-scoped listeners remain escape hatches for events that do not bubble, non-DOM event targets, or lifecycle-specific integration.

## More authoring examples

The examples below illustrate the level of code an agent would write directly. They are intentionally explicit: the skill supplies the pattern, and validation tooling checks its lifecycle and node references.

### Reactive text, attributes, and properties

One binding can update the related DOM state for a cell. The binding runs immediately, so the template only needs a safe static default.

```js
import { bind, cell, defineComponent, delegate, get, set, template } from "roqa";

const nameTemplate = template(
	'<label>Name <input type="text" autocomplete="name"></label>' +
		'<p aria-live="polite"></p>',
);

function NameEditor() {
	const name = cell("");

	this.connected(() => {
		const fragment = nameTemplate();
		const input = fragment.querySelector("input");
		const output = fragment.lastElementChild;

		input.__input = (event) => set(name, event.currentTarget.value);

		const unbind = bind(name, (value) => {
			if (input.value !== value) input.value = value;
			output.textContent = value ? `Hello, ${value}.` : "Enter your name.";
			output.toggleAttribute("data-empty", value.length === 0);
		});

		this.append(fragment);
		return unbind;
	});
}

defineComponent("name-editor", NameEditor);
delegate(["input"]);
```

This example uses a query to keep the draft readable. The preferred generated pattern would capture stable nodes through verified traversal paths and avoid selectors in mounting and update code.

### Conditional regions with `showBlock`

A conditional region owns the nodes and subscriptions it creates. Its render function inserts nodes before the block anchor and returns the first node, last node, and optional cleanup.

```js
import { bind, cell, defineComponent, delegate, get, set, showBlock, template } from "roqa";

const disclosureTemplate = template(
	'<button type="button" aria-expanded="false">Toggle details</button><div></div>',
);

const detailsTemplate = template("<section><h2>Details</h2><p></p></section>");

function Disclosure() {
	const open = cell(false);
	const message = cell("Everything is working.");

	this.connected(() => {
		const fragment = disclosureTemplate();
		const button = fragment.firstElementChild;
		const container = fragment.lastElementChild;

		button.__click = () => set(open, !get(open));

		const unbindExpanded = bind(open, (value) => {
			button.setAttribute("aria-expanded", String(value));
		});

		const details = showBlock(container, open, (anchor) => {
			const detailsFragment = detailsTemplate();
			const section = detailsFragment.firstElementChild;
			const messageNode = section.lastElementChild;
			const unbindMessage = bind(message, (value) => {
				messageNode.textContent = value;
			});

			anchor.before(detailsFragment);
			return {
				start: section,
				end: section,
				cleanup: unbindMessage,
			};
		});

		this.append(fragment);
		return () => {
			unbindExpanded();
			details.destroy();
		};
	});
}

defineComponent("detail-disclosure", Disclosure);
delegate(["click"]);
```

### Repeated regions with `forBlock`

`forBlock` owns list reconciliation. The item render function owns a single item's nodes, delegated handlers, and cleanup.

```js
import { cell, defineComponent, delegate, forBlock, get, set, template } from "roqa";

const todoListTemplate = template("<section><h2>Todos</h2><ul></ul></section>");

const todoTemplate = template(
	'<li><span></span><button type="button">Remove</button></li>',
);

function TodoList() {
	const todos = cell([
		{ id: 1, label: "Read the Roqa skill" },
		{ id: 2, label: "Build a component" },
	]);

	const removeTodo = (todo) => {
		set(
			todos,
			get(todos).filter((candidate) => candidate.id !== todo.id),
		);
	};

	this.connected(() => {
		const fragment = todoListTemplate();
		const list = fragment.firstElementChild.lastElementChild;

		const block = forBlock(list, todos, (anchor, todo) => {
			const itemFragment = todoTemplate();
			const item = itemFragment.firstElementChild;
			const label = item.firstElementChild;
			const removeButton = item.lastElementChild;

			label.textContent = todo.label;
			removeButton.__click = [removeTodo, todo];

			anchor.before(itemFragment);
			return { start: item, end: item };
		});

		this.append(fragment);
		return block.destroy;
	});
}

defineComponent("todo-list", TodoList);
delegate(["click"]);
```

Items are reconciled by reference in the current primitive. The authoring contract and skill must state identity semantics plainly, and tooling should flag patterns that accidentally recreate every item object during an otherwise local update.

### Native component composition

Component composition uses the platform rather than a framework-only component syntax. Static custom elements live in templates, rich values use `setProp`, attributes represent serialized state, and custom events travel through delegated handlers.

```js
import { defineComponent, delegate, setProp, template } from "roqa";

const profileTemplate = template(
	"<article><user-avatar></user-avatar>" +
		'<button type="button">Edit profile</button></article>',
);

function UserProfile(props) {
	this.connected(() => {
		const fragment = profileTemplate();
		const article = fragment.firstElementChild;
		const avatar = article.firstElementChild;
		const editButton = article.lastElementChild;

		setProp(avatar, "user", props.user);
		editButton.__click = () => this.emit("edit-profile", { user: props.user });

		this.append(fragment);
	});
}

defineComponent("user-profile", UserProfile);
delegate(["click"]);
```

## What today's compiler output teaches us

The `counter-button`, `todo-list`, `flight-booker`, and `message-passing` examples were built and their production JavaScript inspected while drafting this vision. The output validates much of the proposed model and clarifies where directly authored code should differ from compiler internals.

### Static templates are compact and traversal is positional

The counter compiler output hoists a compact template and captures nodes through direct paths:

```js
var $tmpl_1 = template("<button> </button>");

this.connected(() => {
	const $root_1 = $tmpl_1();
	this.appendChild($root_1);
	const button_1 = this.firstChild;
	const button_1_text = button_1.firstChild;
	// ...
});
```

Compactness is semantically important. Leading, trailing, or inter-element formatting whitespace becomes real text nodes and changes `firstChild` and `nextSibling` paths. Inside a dynamic block, untracked whitespace nodes could also survive cleanup.

Agent-authored templates should therefore follow one of two validated patterns:

- compact strings with no unintentional structural whitespace; or
- readable strings processed by a future template helper that has explicit, tested whitespace semantics.

The checker should compare each traversal path with the parsed template and ensure that a block's returned `start` and `end` encompass every node inserted by its render function.

### Delegation is already explicit in the final program

The built counter contains the same event protocol proposed for direct authoring:

```js
button_1.__click = increment;

defineComponent("counter-button", App);
delegate(["click"]);
```

The todo list registers all event types once:

```js
delegate(["keydown", "click", "change"]);
```

This is not merely a compiler implementation detail. It is a small, readable protocol that should remain visible in authored source. The skill and checker can reliably derive a module's required `delegate` list from its `__event` assignments and report missing or unused registrations.

The built list currently emits a closure for an item-specific change handler. Direct agent-authored code should prefer the runtime's parameterized array form when a handler only needs the item:

```js
checkbox.__change = [toggleTodo, todo];
```

This makes the agent-first source at least as allocation-conscious as compiler output without requiring handler analysis.

### The compiler specializes reactive writes

The current compiler inlines cells and writes DOM references onto them:

```js
const count = {
	v: 0,
	e: [],
};

const increment = () => {
	count.v = count.v + 1;
	count.ref_1.nodeValue = "Count is " + count.v;
};
```

The flight-booker output follows the same pattern for properties and classes:

```js
returnDateDisabled.v = !isRoundTrip();
returnDateDisabled.ref_1.disabled = returnDateDisabled.v;

showDateError.v = !canBook();
showDateError.ref_1.className = showDateError.v ? "error visible" : "error";
```

These `ref_N` fields and inlined updates are effective generated code, but they are not a good stable authoring API:

- reference names are positional rather than descriptive;
- every write site must know every dependent DOM update;
- application code becomes coupled to the cell's internal representation; and
- missed updates become silent correctness bugs.

The agent-first format should instead use named public primitives such as `cell`, `set`, and `bind`, as the examples in this document do. That gives agents one explicit place to describe each reactive DOM effect and gives tooling a clear subscription/cleanup graph to validate. Ordinary bundling and minification can inline small helpers. A Roqa-specific optimizer is deliberately outside this vision because it would restore a framework compilation stage and split behavior between authored and generated code.

This is an intentional performance trade rather than an optimization task deferred to later. Calls such as `get(count)` and `set(count, value)`, the cell's subscriber list, and `bind` callbacks may remain in production. The relevant question is whether their measured cost is acceptable for real interfaces, not whether the new approach reproduces the most aggressively inlined output of the old compiler.

### Control flow needs explicit controller ownership

The built todo list makes the list controller visible and updates it after every list write:

```js
let todos_forBlock;

todos.v = [...todos.v, newTodo];
todos_forBlock.update();

todos_forBlock = forBlock(section_1, todos, (anchor, todo, index) => {
	// Create and insert one item.
});
```

Directly authored source can rely on `set` plus `forBlock`'s cell subscription, but it should still retain the controller and destroy it with the component. The important invariant is explicit ownership: the code that creates a block is responsible for its lifetime.

The current `forBlock` reconciles items by object reference. The checker and skill must prevent accidental identity churn and make replacement, reordering, and duplicate-reference behavior testable.

### Native events and component events have distinct jobs

The message-passing build demonstrates both event paths:

```js
button_1.__click = passDataIntoCounter;

this.on("count-changed", (event) => {
	counterCount.v = event.detail.count;
	// ...
});

delegate(["input", "click"]);
```

Delegated `__event` handlers are the default for events originating on owned template nodes. `this.on` remains appropriate for custom events observed at the component host and provides lifecycle cleanup through the component's abort controller. The skill should preserve this distinction rather than replacing every listener mechanically.

### Past compiler output is research, not the future authoring pipeline

The current compiler output is useful evidence about efficient DOM operations: helpers are inlined, identifiers are positional, and updates are pushed into write sites. Agent-authored source should instead optimize for reliable generation and human review: public primitives, descriptive names, explicit cleanup, and canonical structure.

The target is therefore not a byte-for-byte transcription of generated output. It is a stable, low-level source language that maps directly to the same browser operations without requiring JSX analysis. During the transition, compiled examples remain a useful performance baseline. In the final workflow, production output is simply the authored modules processed by whichever standard bundler or minifier the application already uses.

## An authoring contract for agents

The primitive layer should be treated as a target language with a narrow contract, not as permission to generate arbitrary DOM code.

Agent-authored components should follow rules such as:

1. Hoist static `template` and `svgTemplate` declarations to module scope.
2. Keep template strings free of unintentional structural whitespace and clone a template once for each mounted component or dynamic block.
3. Capture each dynamic node once; do not repeatedly query the DOM during updates.
4. Bind each reactive value to the smallest DOM mutation that represents it.
5. Register bubbling event types once with `delegate` and assign handlers through `__event` properties.
6. Return or register cleanup for every binding, listener, and nested block.
7. Use `showBlock` and `forBlock` instead of rebuilding dynamic regions ad hoc.
8. Prefer DOM properties for live state and attributes for serialized state.
9. Keep component boundaries native: communicate through properties, attributes, methods, and events.
10. Do not introduce a second templating abstraction in application code.

These rules should be precise enough for automated validation. If an important rule can only be communicated as prose, the tooling is incomplete.

## The Roqa skill

The skill is the primary developer experience for creating and changing Roqa interfaces with a coding agent. It should be versioned alongside the runtime so its guidance always describes the installed APIs.

The skill would include:

- the authoring contract and primitive reference;
- canonical recipes for text, attributes, classes, styles, properties, events, refs, and forms;
- recipes for conditional rendering, lists, nested blocks, and cleanup;
- component composition and custom-element interoperability;
- accessibility requirements and semantic HTML guidance;
- TypeScript conventions;
- examples of good component structure;
- explicit anti-patterns and their corrections;
- a verification checklist the agent must run before finishing; and
- migration guidance from JSX-based Roqa.

The skill should optimize for retrieval. Short decision tables and focused examples are more useful to an agent than a long narrative manual. Each pattern should show the authored source, its lifecycle, and the command that verifies it.

Projects could install the skill in a standard agent-readable location, for example:

```text
.agents/
└── skills/
    └── create-roqa/
        ├── SKILL.md
        ├── references/
        │   ├── primitives.md
        │   ├── patterns.md
        │   └── accessibility.md
        └── examples/
```

## A deliberately small CLI

Removing the compiler should reduce tooling, not replace one toolchain with another. The CLI exists to give agents deterministic assistance where language models are weaker than simple programs. It is never required to build or run an application.

The initial surface should stay close to three jobs:

1. install or update the skill and minimal project conventions;
2. generate small pieces of reviewable source, especially template traversal; and
3. validate the authoring contract.

Exact command names remain open, but a possible shape is:

```sh
roqa init
roqa generate component counter-button
roqa generate traversal --template counterTemplate
roqa check
```

### Generate component structure

The component generator should create a known-good module with a hoisted template, component lifecycle, explicit mounting point, cleanup function, and test skeleton. It should not attempt to generate behavior from a declarative component description.

### Generate DOM traversal

DOM traversal is an ideal deterministic tool boundary. Given static HTML and temporary semantic labels for the nodes an agent needs, the generator can:

1. parse the fragment using browser-equivalent HTML semantics;
2. produce a compact template string with the temporary labels removed;
3. emit direct traversal statements with descriptive local names;
4. emit TypeScript-safe node checks or types when requested; and
5. verify that every generated path resolves to the intended node.

Its output should look like code an agent could have written:

```js
const fragment = counterTemplate();
const button = fragment.firstElementChild;
const countValue = button.firstElementChild;
```

The output belongs in the component module and may be changed normally. It is not a generated runtime artifact that must be refreshed on every build. Other generators should meet the same bar: narrow input, deterministic source output, and no ongoing tool dependency. Possible later candidates include delegated-event registration and cleanup skeletons, but only after repeated agent failures prove that prose and validation are insufficient.

### Validate authored source

A fast static validator should enforce the authoring contract and produce diagnostics written for both agents and humans:

```sh
roqa check
```

Useful checks include:

- bindings or blocks without cleanup;
- bindings created inside another reactive callback;
- template clones that are never mounted;
- repeated DOM queries in update paths;
- unsafe dynamic HTML;
- invalid custom-element names;
- delegated handlers without a matching `delegate` registration;
- native listeners used where a delegated handler is the canonical pattern;
- event handlers assigned in update loops;
- malformed parameterized handler arrays;
- node traversal that does not match the static template;
- missing keys or unstable identity where a list primitive requires them; and
- common accessibility errors.

Diagnostics should identify a fix, not merely reject code. Stable diagnostic codes would let the skill link each error to a focused repair recipe. A verbose or machine-readable check mode can summarize templates, node references, bindings, events, blocks, and cleanup without requiring a separate inspection subsystem.

### Use ecosystem build and test tools

Roqa should not wrap Vite, TypeScript, or a test runner merely to create a branded workflow. Projects use their existing development server and browser test runner. Component scaffolds can include tests for initial DOM, updates, delegated event propagation, parameterized handlers, list reconciliation, disconnect cleanup, and accessibility, while the skill tells agents which project-native commands to run.

There should be no successor to the current Vite compilation plugin. At most, editor integrations or an optional `roqa check --watch` process can surface diagnostics; neither changes application modules.

## Package shape

A possible distribution is:

- `roqa`: the browser runtime and public types;
- `@roqajs/cli`: skill installation, narrow source generators, validation, and temporary migration commands; and
- `@roqajs/skill`: the versioned agent skill and references.

Additional packages should be added only when a concrete need cannot be met by the platform or existing ecosystem tools. The runtime must not depend on agent tooling. A component authored with the primitives remains ordinary ESM that can be built and served without the CLI.

### Review applications

The vision includes two review-only applications:

- [`agent-first-example`](./agent-first-example/README.md) is a deliberately small
  dashboard for studying the core component, binding, and block patterns.
- [`figleaf-example`](./figleaf-example/README.md) translates the substantially
  larger Figleaf DAW interface into a more ergonomic speculative vocabulary. It
  combines typed template references and component props, typed event-first
  `on(event.click, ...)` registration, `computed`/`effect`/`batch`, explicitly keyed
  blocks, scoped cleanup, typed actions, and reconnect-safe mounting. These APIs are
  locally declared for syntax review and are not implemented by the current runtime.

The second example is not a proposal to rewrite Figleaf. It is a syntax and
reviewability probe: a realistic source sample for deciding which patterns feel
clear, which feel overly mechanical, and which should be generated or wrapped.

## Humans are still part of the loop

Agent-first should not mean agent-only. Primitive source must remain reviewable, debuggable, and editable by a person. The framework should favor:

- descriptive local names over generated identifiers;
- one obvious pattern for each operation;
- browser-native stack traces;
- source that formats cleanly with standard JavaScript tools;
- explicit behavior over clever compression; and
- comments only where intent cannot be expressed in names and structure.

The skill can ask agents to write slightly more verbose code when that code is easier to audit. Production size can still be handled by ordinary minification.

## Migration from today's Roqa

Migration can be incremental:

1. **Document the emitted model.** Stabilize and document the primitives already used by compiled output.
2. **Make primitives first-class.** Complete their public types, lifecycle guarantees, and tests.
3. **Ship the skill and traversal generator.** Prove that agents can author representative components without asking a model to count sibling nodes.
4. **Ship the checker.** Validate lifecycle, traversal, event, and accessibility invariants without transforming source.
5. **Dogfood on examples.** Rewrite the example suite and compare correctness, bundle size, runtime performance, and maintenance cost.
6. **Add a temporary migration command.** Use the existing compiler's knowledge to emit readable primitive source for JSX projects.
7. **Retire the compiler.** Remove the compiler, JSX runtime shims, parser dependencies, Vite transform, compiler configuration, and JSX-specific documentation once the primitive workflow is proven.

The migration command is intentionally transitional. Unlike ongoing source generators, it may parse a complete legacy JSX component, but it must emit standalone source and must never become part of the new build loop. If a compatibility package is offered during a deprecation window, it should have an explicit removal plan.

## How to evaluate the bet

This direction succeeds only if it improves the complete authoring loop, not merely the runtime package.

A prototype should measure:

- agent success rate across a fixed suite of UI tasks;
- retries and tool calls required to reach passing tests;
- correctness of cleanup and dynamic control flow;
- accessibility of generated interfaces;
- source size and reviewability;
- runtime and bundle-size differences from compiled JSX, evaluated against acceptable budgets rather than exact parity;
- time to diagnose intentionally introduced mistakes;
- skill size and sensitivity to model choice; and
- the maintenance cost removed with the compiler versus the cost added by validation tooling.

The benchmark suite should include more than counters: forms, keyed and reordered lists, nested conditionals, asynchronous state, reusable components, SVG, focus management, and a small application.

## Risks and open questions

### Fragile node traversal

Direct `firstChild` and `nextSibling` paths are efficient but can drift when a static template changes. This is the primary reason for a traversal generator. The checker should verify authored and generated paths against the static template so an edit fails clearly instead of targeting the wrong node.

### Too much generated ceremony

Primitive code may be larger and harder for people to scan than JSX. Canonical structure, good names, formatting, generated traversal, and clear `roqa check` diagnostics need to make that cost acceptable.

### Agent reliability

Models may produce plausible code that leaks bindings or mishandles a block boundary. The contract and validator must cover correctness properties that code review cannot reliably catch.

### Type safety

DOM traversal naturally produces broad nullable node types. The traversal command should be able to emit explicit checked helpers or typed local declarations into the application module. The type information must remain visible source; sidecar metadata or a required TypeScript transform would recreate a hidden compiler.

### Security

An agent may reach for `innerHTML` when updating dynamic content. The default patterns and checker should strongly prefer text and DOM properties, make unsafe HTML explicit, and define a trusted-content story.

### Skill portability

Agent products discover and invoke skills differently. Roqa should publish one canonical skill source while supporting adapters or installation commands for common environments.

### Is source still a public API?

If agents author runtime-shaped code directly, low-level behavior becomes a compatibility commitment. Primitive semantics, cleanup contracts, and block return shapes must be versioned with more care than compiler internals are today.

### Where should optimization live?

The initial answer is that explicit primitive source is the Roqa optimization boundary and ordinary bundlers handle dead-code elimination and minification. Runtime helper calls and subscription dispatch are acceptable when they stay within measured budgets. If the prototype exposes a meaningful bottleneck, the first response should be to improve primitive design or authored patterns, not chase compiler-output parity or quietly reintroduce a mandatory optimizer.

## A focused prototype

Before changing the main framework, build a narrow experiment:

1. publish a draft skill for the current public primitives;
2. add any missing types needed to author without JSX;
3. implement the one-shot DOM traversal generator;
4. implement `roqa check` for cleanup, events, and template traversal;
5. hand-author a representative subset of examples using only the skill, runtime, and explicit generators;
6. ask multiple coding agents to complete the same unseen UI tasks; and
7. compare their results with the JSX workflow.

The prototype should answer one question: **can a skill plus deterministic tooling make low-level Roqa primitives a better target for coding agents than JSX?**

If the answer is yes, Roqa can become smaller in both implementation and concept: runtime primitives for agents to write, browsers to run, and humans to review, with no Roqa compiler between them.
