# Roqa Compiler Spec

This document specifies the compilation pipeline for Roqa's builder API. It
describes how agent-authored `component()` declarations are transformed into
the high-performance output Roqa already produces today: `template()` clones,
cells, inlined updates, `forBlock`/`showBlock`, delegated events, and custom
elements.

The central design decision is **build-time execution**: the builder API
functions are real JavaScript that runs at build time inside the Vite plugin.
Rather than statically analyzing JS call expressions, the compiler executes the
component definition and collects a structured **Component IR** — then feeds
that IR to a backend code generator.

## Pipeline overview

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                        BUILD-TIME PIPELINE                          │
│                                                                     │
│  Agent-authored source (.ts)                                        │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  PHASE 1: EXTRACT                                          │     │
│  │  ──────────────────                                        │     │
│  │  Input: Source code                                        │     │
│  │  Output: Component definition AST nodes                    │     │
│  │                                                            │     │
│  │  Parse the source and locate all top-level `component()`   │     │
│  │  call expressions. Extract each one as a self-contained    │     │
│  │  unit for Phase 2.                                         │     │
│  └────────────────────────────────────────────────────────────┘     │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  PHASE 2: EXECUTE                                          │     │
│  │  ─────────────────                                         │     │
│  │  Input: Component definition code                          │     │
│  │  Output: ComponentIR (structured JSON-like object)         │     │
│  │                                                            │     │
│  │  Execute the builder API functions in a build-time          │     │
│  │  sandbox. `state.value()`, `view.div()`, `show()`,         │     │
│  │  `each()` etc. are real functions — but they return IR     │     │
│  │  descriptor objects rather than DOM nodes.                  │     │
│  │                                                            │     │
│  │  The `render` function is called with Proxy objects that   │     │
│  │  record reactive access patterns (.get() calls).           │     │
│  │                                                            │     │
│  │  Action and computed bodies are captured as source text,   │     │
│  │  not executed.                                             │     │
│  └────────────────────────────────────────────────────────────┘     │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  PHASE 3: VALIDATE                                         │     │
│  │  ──────────────────                                        │     │
│  │  Input: ComponentIR                                        │     │
│  │  Output: ComponentIR (unchanged) or diagnostics            │     │
│  │                                                            │     │
│  │  Structural validation on the IR:                          │     │
│  │  - No element has both `text` and `children`               │     │
│  │  - All `each()` sources reference reactive state           │     │
│  │  - All event handler names map to declared actions         │     │
│  │  - `show()` conditions reference reactive state            │     │
│  │  - Required props/attrs have no missing defaults           │     │
│  │  - No duplicate state/action/prop/attr names               │     │
│  └────────────────────────────────────────────────────────────┘     │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  PHASE 4: GENERATE                                         │     │
│  │  ─────────────────                                         │     │
│  │  Input: Validated ComponentIR                              │     │
│  │  Output: Intermediate JS (template + cells + bindings)     │     │
│  │                                                            │     │
│  │  Walk the IR and produce:                                  │     │
│  │  - Static HTML template strings                            │     │
│  │  - DOM traversal code (firstChild/nextSibling chains)      │     │
│  │  - Cell declarations from state descriptors                │     │
│  │  - Binding setup from recorded reactive accesses           │     │
│  │  - Event delegation assignments                            │     │
│  │  - forBlock() / showBlock() calls                          │     │
│  │  - defineComponent() wrapper                               │     │
│  └────────────────────────────────────────────────────────────┘     │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  PHASE 5: INLINE                                           │     │
│  │  ────────────────                                          │     │
│  │  Input: Intermediate JS from Phase 4                       │     │
│  │  Output: Final optimized JS + source map                   │     │
│  │                                                            │     │
│  │  Apply the existing inlining optimizations:                │     │
│  │  - cell(v) → { v: v, e: [] }                              │     │
│  │  - get(cell) → cell.v                                      │     │
│  │  - set(cell, v) → { cell.v = v; /* inlined updates */ }   │     │
│  │  - bind() removal + ref storage                            │     │
│  │  - Derived cell expansion                                  │     │
│  │                                                            │     │
│  │  This phase is the existing inline-get.js — reused as-is. │     │
│  └────────────────────────────────────────────────────────────┘     │
│       │                                                             │
│       ▼                                                             │
│  Final output (.js) + source map                                    │
└──────────────────────────────────────────────────────────────────────┘
```

The key insight: **Phases 4 and 5 are the existing Roqa compiler backend**,
largely unchanged. The new work is Phases 1–3, which replace the current JSX
parsing approach with builder execution.

## Phase 2: Build-time execution (detailed)

This is the novel phase. The builder API functions are real JavaScript — but
when executed at build time, they construct IR descriptors instead of DOM.

### Execution model

The Vite plugin imports the component source in a build-time context where all
`roqa` imports resolve to **IR-producing stubs** rather than runtime code.

```txt
Agent source                    Build-time stubs
─────────────                   ────────────────
import { component,       →    component()  → collects sections, returns ComponentIR
         state,           →    state.value()  → returns StateValueIR
         computed,        →    computed()  → captures source, returns ComputedIR
         command,         →    command()  → captures source, returns CommandIR
         view,            →    view.div()  → returns ElementIR
         show,            →    show()  → returns ShowIR
         each,            →    each()  → returns EachIR
         event,           →    event()  → returns EventIR
         prop,            →    prop.value()  → returns PropIR
         attr }           →    attr.value()  → returns AttrIR
```

### What executes vs what is captured

Not everything in a component definition can (or should) execute at build
time. The division:

| Section | Build-time behavior | Why |
| --- | --- | --- |
| `state.value()` | **Executes** — returns `StateValueIR` with initial value | Initial values are static data |
| `state.collection()` | **Executes** — returns `CollectionIR` with key + initial | Same — static descriptor |
| `computed()` | **Captures source** — records the function body text + runs against proxy to detect dependencies | Body is runtime logic, but deps are discoverable |
| `command()` | **Captures source** — records the function body text | Body is runtime logic |
| `event()` | **Executes** — returns `EventIR` with event name | Static descriptor |
| `prop.value()` | **Executes** — returns `PropIR` with defaults/required | Static descriptor |
| `attr.value()` | **Executes** — returns `AttrIR` with defaults/reflect | Static descriptor |
| `render()` | **Executes against proxies** — produces the view IR tree | Structure is static; reactive accesses are recorded |
| `lifecycle` | **Captures source** — records hook function bodies | Body is runtime logic |

### The render proxy model

The `render` function is the most interesting part. It is called at build time
with proxy objects that record reactive accesses and produce view IR.

```ts
render: ({ state, actions }) =>
    view.button({
        onClick: actions.increment,
        children: ["Count is ", state.count.get()],
    })
```

When this executes at build time:

1. `state` is a **StateProxy** — accessing `state.count` returns a
   `StateRefDescriptor { kind: "state-ref", name: "count" }`.

2. Calling `.get()` on that descriptor returns a **ReactiveRead**
   `{ kind: "reactive-read", source: "state", name: "count" }` and records it
   in a reactive access log.

3. `actions` is an **ActionsProxy** — accessing `actions.increment` returns an
   `ActionRef { kind: "action-ref", name: "increment" }`.

4. `view.button(...)` receives these descriptors as prop values and returns an
   `ElementIR` that preserves them in its children/props/events.

5. The result is a complete view IR tree with all reactive access points
   explicitly marked — no static analysis needed.

#### StateProxy behavior

```ts
const stateProxy = new Proxy({}, {
    get(target, name) {
        // Return a StateRefDescriptor for each state property
        return createStateRef(name);
    }
});

function createStateRef(name) {
    const ref = {
        kind: "state-ref",
        name,
        get() {
            // Record a reactive read
            reactiveLog.push({ source: "state", name });
            return { kind: "reactive-read", source: "state", name };
        }
    };
    return ref;
}
```

When a `StateRefDescriptor` appears directly as a child value or in a `show()`
/ `each()` first argument, it represents a **cell reference** (for
subscription). When `.get()` is called, it represents a **value read** (the
current value of the cell at render time).

This distinction maps directly to the existing compiler's treatment:
- Cell reference → `bind(cell, ...)` or `forBlock(container, cell, ...)`
- Value read → `cell.v` (after inlining)

#### ActionsProxy behavior

```ts
const actionsProxy = new Proxy({}, {
    get(target, name) {
        const ref = (...args) => {
            // Calling an action with args returns a bound action
            return { kind: "bound-action", name, args };
        };
        ref.kind = "action-ref";
        ref.name = name;
        return ref;
    }
});
```

- `actions.increment` (no call) → `ActionRef` — used as-is for event handlers
- `actions.toggleTodo(todo.id)` (called with args) → `BoundActionRef` — the
  compiler generates the array-form delegated event handler

#### PropsProxy and AttrsProxy

These follow the same pattern as StateProxy — property access returns a
descriptor, `.get()` returns a reactive read:

```ts
const propsProxy = new Proxy({}, {
    get(target, name) {
        return {
            kind: "prop-ref",
            name,
            // Props support nested property access
            // props.story.url is recorded as a chain
        };
    }
});
```

For props specifically, nested property access (`props.story.url`) needs to be
handled. The proxy should return further proxies for nested access, recording
the full access path. This becomes relevant when the compiler generates
`this.getProp("story").url` at the use site.

### Source capture for commands and computed

Command and computed function bodies contain runtime logic — they can't be
meaningfully executed at build time. Instead, the builder captures their source
text and records metadata.

#### Command capture

```ts
command(({ state }, value: string) => {
    state.draft.set(value);
})
```

At build time, `command()` receives the function. It:

1. Captures the function's source text via `.toString()` or, more reliably,
   from source position metadata provided by the parse phase.
2. Returns a `CommandIR`:

```ts
{
    kind: "command",
    name: "setDraft",             // Assigned later by component() from object key
    source: "({ state }, value) => { state.draft.set(value); }",
    params: ["value"],
    paramTypes: ["string"],       // From TS type annotations if available
    contextAccess: ["state"],     // Which context properties the function destructures
}
```

The `contextAccess` field tells the code generator which context bindings to
wire up. A command that only accesses `state` doesn't need `props`, `emit`,
etc.

#### Computed capture

```ts
computed(({ state }) => state.todos.get().filter(t => !t.completed).length)
```

At build time, `computed()`:

1. Captures the function's source text.
2. Runs the function against the StateProxy to discover which state cells are
   read (via `.get()` calls). In this case: `["todos"]`.
3. Returns a `ComputedIR`:

```ts
{
    kind: "computed",
    name: "remaining",            // Assigned later from object key
    source: "({ state }) => state.todos.get().filter(t => !t.completed).length",
    dependencies: ["todos"],      // State cells this computed reads
    contextAccess: ["state"],
}
```

The `dependencies` array is the critical output — it tells Phase 4 which cells
to subscribe to for recomputation, mapping to the existing `cell(() => ...)`
pattern.

### View builder functions

Each `view.*()` call returns an `ElementIR` node. These are plain objects —
the entire view tree is data.

#### `view.div(props)`, `view.button(props)`, etc.

```ts
view.button({
    id: "increment-button",
    onClick: actions.increment,
    children: ["Count is ", state.count.get()],
})
```

Returns:

```ts
{
    kind: "element",
    tag: "button",
    props: {
        id: { kind: "static", value: "increment-button" },
    },
    events: [
        { event: "click", handler: { kind: "action-ref", name: "increment" } },
    ],
    children: [
        { kind: "text", value: "Count is " },
        { kind: "reactive-read", source: "state", name: "count" },
    ],
    ref: undefined,
    classes: undefined,
    styles: undefined,
    attributes: undefined,
}
```

Key observations:

- **Static vs reactive children are distinguishable.** `"Count is "` is a
  plain string (static text). `state.count.get()` produced a `reactive-read`
  descriptor. The code generator knows exactly which text nodes need bindings.

- **Events are already structured.** `onClick` was parsed by the builder into
  an `event` entry with the action ref. No need to pattern-match JSX attribute
  names.

- **Class bindings preserve structure.** `class: ["todo", { completed: todo.completed }]`
  becomes `{ kind: "class-list", items: [...] }` in the IR.

#### `show(condition, options)`

```ts
show(state.hasCompleted, {
    render: () => view.button({ text: "Clear" }),
})
```

Returns:

```ts
{
    kind: "show",
    condition: { kind: "state-ref", name: "hasCompleted" },
    render: { kind: "element", tag: "button", ... },
    fallback: undefined,
}
```

The `condition` is a `StateRefDescriptor` (not a `.get()` read) — this tells
the code generator to subscribe to the cell directly, matching the existing
`showBlock(container, cell, renderFn)` signature.

The `render` and `fallback` values are the results of calling the render/
fallback lambdas at build time — they are already fully resolved IR trees.

#### `each(source, options)`

```ts
each(state.todos, {
    id: "todo-items",
    key: "id",
    render: (todo) => view.label({ ... }),
})
```

At build time, `each()`:

1. Records the `source` — a `StateRefDescriptor` for the cell to subscribe to.
2. Calls the `render` callback with an **ItemProxy** representing a generic
   list item. Property accesses on this proxy are recorded as item field
   references.
3. Returns an `EachIR`:

```ts
{
    kind: "each",
    source: { kind: "state-ref", name: "todos" },
    key: "id",
    blockId: "todo-items",
    itemFields: ["id", "completed", "text"],  // Fields accessed on each item
    render: { kind: "element", tag: "label", ... },
}
```

The `itemFields` array informs the code generator which item properties are
used, enabling precise update code in the `forBlock` render callback.

The **ItemProxy** is the trickiest part of the execution model. When the render
callback accesses `todo.completed`, the proxy must return a descriptor that
makes sense in the IR tree. For example, in:

```ts
class: ["todo", { completed: todo.completed }]
```

`todo.completed` should produce an `ItemFieldRef`:

```ts
{ kind: "item-field-ref", field: "completed" }
```

This tells the code generator: "this value comes from the current list item's
`completed` field." The code generator maps this to the appropriate variable
in the `forBlock` render callback.

## Component IR schema

The complete IR schema is defined in [ir.md](./ir.md). That document includes
the full type definitions, a crash course on how IRs work, and a worked example
showing a component's IR alongside what the code generator produces from it.

Below is a summary of the root type for quick reference:

```ts
type ComponentIR = {
    tagName: string;
    name: string;                 // Export name (e.g., "CounterButton")

    props: PropIR[];
    attrs: AttrIR[];
    state: StateIR[];
    emits: EmitIR[];
    actions: ActionIR[];
    lifecycle: LifecycleIR;
    render: NodeIR;
};
```

## Phase 4: Code generation (detailed)

Phase 4 walks the validated `ComponentIR` and produces intermediate JavaScript.
This is the equivalent of the current Phase 3 (codegen.js) but reads from the
IR rather than walking JSX AST nodes.

### 4.1 Template extraction

Walk the `NodeIR` tree depth-first. For each `ElementIR`, emit its tag and
static attributes into an HTML string. Dynamic content (reactive text, events,
classes, `show`, `each`) becomes:

- **Reactive text children**: A space placeholder `' '` in the template string,
  creating a text node for `nodeValue` updates.
- **Show blocks**: A comment node placeholder in the template. The `showBlock()`
  call gets the container from traversal.
- **Each blocks**: Same as show — comment placeholder, `forBlock()` gets the
  container.
- **Event handlers**: No template impact — wired up in traversal code.
- **Reactive attributes/classes**: Static initial value in template, binding
  updates the property.

Example IR → template:

```ts
// IR:
{
    kind: "element", tag: "button",
    props: { id: { kind: "static", value: "increment-button" } },
    children: [
        { kind: "text", value: "Count is " },
        { kind: "reactive-read", source: "state", name: "count" },
    ]
}

// Template output:
const $tmpl_1 = template('<button id="increment-button"> </button>');
//                                                       ^ space = text node placeholder
```

### 4.2 DOM traversal generation

From the template structure, generate `firstChild` / `nextSibling` traversal
code to obtain references to every dynamic node.

```ts
// Generated traversal:
const button_1 = $tmpl_1().firstChild;
const button_1_text = button_1.firstChild;   // The space placeholder text node
```

This is identical to the current traversal generation — the IR simply provides
a cleaner input than walking JSX nodes.

### 4.3 Cell generation

For each `StateIR` entry:

```ts
// state.value<number>({ initial: 0 })
const count = cell(0);

// state.collection<Todo>({ key: "id", initial: [] })
const todos = cell([]);

// computed(({ state }) => state.todos.get().filter(...).length)
const remaining = cell(() => get(todos).filter(t => !t.completed).length);
```

The `computed` case rewrites the captured source:
1. Replace `state.X.get()` with `get(X)` where `X` is the local cell variable
2. Replace `state.X.set(v)` with `set(X, v)` (shouldn't appear in computed,
   but handled for safety)

### 4.4 Action generation

For each `ActionIR`, generate a function that receives the correct context:

```ts
// command(({ state }, value) => { state.draft.set(value); })
const setDraft = (value) => {
    set(draft, value);
};
```

The source rewriting for actions:
- `state.X.get()` → `get(X)`
- `state.X.set(v)` → `set(X, v)`
- `state.X.insert(v)` → collection mutation helper
- `actions.Y()` → `Y()` (direct function call to sibling action)
- `emit.eventName(detail)` → `this.emit("event-name", detail)`

### 4.5 Binding generation

For each `reactive-read` in the IR tree, generate a `bind()` call:

```ts
// ReactiveRead { source: "state", name: "count" } as text child
button_1_text.nodeValue = "Count is " + get(count);
bind(count, (v) => { button_1_text.nodeValue = "Count is " + v; });
```

For reactive class bindings:

```ts
// class: ["todo", { completed: todo.completed }]
// In forBlock render callback:
label_1.className = "todo" + (item.completed ? " completed" : "");
bind(/* item cell */, () => {
    label_1.className = "todo" + (item.completed ? " completed" : "");
});
```

### 4.6 Event generation

For each `EventBindingIR`:

```ts
// ActionRef: onClick → actions.increment
button_1.__click = increment;

// BoundActionRef: onChange → actions.toggleTodo(todo.id)
input_1.__change = [toggleTodo, todo.id];
```

Collect all event types and emit `delegate(["click", "change", ...])` at file
end.

### 4.7 Show/Each generation

```ts
// show(state.hasCompleted, { render: () => ... })
showBlock(section_1, hasCompleted, (anchor) => {
    const button_1 = $tmpl_2().firstChild;
    // ... bindings ...
    anchor.before(button_1);
    return { start: button_1, end: button_1 };
});

// each(state.todos, { key: "id", render: (todo) => ... })
forBlock(ul_1, todos, (anchor, item, index) => {
    const label_1 = $tmpl_3().firstChild;
    // ... bindings using item.X ...
    anchor.before(label_1);
    return { start: label_1, end: label_1 };
});
```

### 4.8 Component wrapper

Wrap everything in `defineComponent()`:

```ts
defineComponent("counter-button", function CounterButton() {
    // Cell declarations (from 4.3)
    const count = cell(0);

    // Action functions (from 4.4)
    const increment = () => { set(count, get(count) + 1); };

    // Connected callback containing:
    this.connected(() => {
        // Template cloning + traversal (from 4.1, 4.2)
        const button_1 = $tmpl_1().firstChild;
        const button_1_text = button_1.firstChild;

        // Event assignments (from 4.6)
        button_1.__click = increment;

        // Initial values + bindings (from 4.5)
        button_1_text.nodeValue = "Count is " + get(count);
        bind(count, (v) => { button_1_text.nodeValue = "Count is " + v; });

        // Mount
        this.appendChild(button_1);
    });
});
```

This intermediate output is then passed to Phase 5 (the existing
`inlineGetCalls`) which inlines `cell()`, `get()`, `set()`, and `bind()`.

## Phase 5: Inlining (existing)

Phase 5 is the existing `inline-get.js` — no changes required. It operates on
the intermediate JS from Phase 4 and produces final output:

```ts
const $tmpl_1 = template('<button id="increment-button"> </button>');

defineComponent("counter-button", function CounterButton() {
    const count = { v: 0, e: [] };

    this.connected(() => {
        const button_1 = $tmpl_1().firstChild;
        const button_1_text = button_1.firstChild;

        button_1.__click = () => {
            count.v = count.v + 1;
            count.ref_1.nodeValue = "Count is " + count.v;
        };

        button_1_text.nodeValue = "Count is " + count.v;
        count.ref_1 = button_1_text;

        this.appendChild(button_1);
    });
});

delegate(["click"]);
```

## Vite plugin integration

The Vite plugin orchestrates the pipeline:

```ts
// packages/vite-plugin/src/index.js
export default function roqaPlugin() {
    return {
        name: "roqa",
        enforce: "pre",

        config() {
            return {
                esbuild: {
                    // Don't transform TS — we handle it
                    // But do strip type annotations
                    jsx: "preserve",
                },
            };
        },

        async transform(code, id) {
            if (!id.endsWith(".ts") && !id.endsWith(".js")) return null;

            // Quick bail: only process files that import from "roqa"
            if (!code.includes("from \"roqa\"") && !code.includes("from 'roqa'")) {
                return null;
            }

            return compile(code, id);
        },
    };
}
```

The `compile()` entry point runs all five phases:

```ts
export function compile(code, filename) {
    const components = extract(code, filename);       // Phase 1
    const irs = components.map(c => execute(c));      // Phase 2
    const validated = irs.map(ir => validate(ir));    // Phase 3
    const intermediate = generate(validated, code);   // Phase 4
    const final = inlineGetCalls(intermediate.code);  // Phase 5
    return final;
}
```

## Source rewriting rules

Action and computed bodies are captured as source text. The code generator must
rewrite certain patterns when embedding them in the output. The complete set of
rewrite rules:

| Input pattern | Output pattern | Context |
| --- | --- | --- |
| `state.X.get()` | `get(X)` | Read state value |
| `state.X.set(v)` | `set(X, v)` | Write state value |
| `state.X.insert(v)` | `X.v.push(v); notify(X)` | Collection insert (simplified) |
| `state.X.update(id, fn)` | Collection update helper call | Collection update |
| `state.X.remove(id)` | Collection remove helper call | Collection remove |
| `state.X.removeWhere(fn)` | Collection filter + set | Collection bulk remove |
| `state.X.move(a, b)` | Collection reorder helper | Collection move |
| `state.X.clear()` | `set(X, [])` | Collection clear |
| `props.X` | `this.getProp("X")` | Read prop |
| `attrs.X.get()` | Attribute accessor | Read attribute |
| `actions.Y()` | `Y()` | Call sibling action |
| `emit.eventName(d)` | `this.emit("event-name", d)` | Emit custom event |

These rewrites are mechanical string transforms on the captured source — they
operate on well-known patterns that the builder API guarantees. This is simpler
than the current approach of analyzing arbitrary JSX expressions because the
input patterns are constrained by the API design.

## Error handling and diagnostics

### Phase 2 errors (execution failures)

If the builder API execution throws, the error includes:
- The component name and tag
- The section that failed (state, render, etc.)
- The original error message
- A source location pointing to the component definition

Common Phase 2 failures:
- Side effects in render (network calls, DOM access) → clear error message
- Circular computed dependencies → detected by proxy, reported with chain

### Phase 3 diagnostics (validation warnings)

Structural issues caught by IR validation:

| Diagnostic | Severity | Message |
| --- | --- | --- |
| `text-and-children` | error | Element has both `text` and `children` |
| `unreachable-action` | warning | Action declared but never referenced in render or lifecycle |
| `unsubscribed-state` | warning | State declared but never read in render |
| `missing-key` | warning | `each()` without a `key` — may cause inefficient reconciliation |
| `dynamic-show-condition` | warning | `show()` condition is not a state/computed ref — will not be reactive |
| `duplicate-id` | error | Multiple elements with the same `id` in the same component |

### Phase 4 errors (generation failures)

These indicate bugs in the compiler itself and should not occur with valid IR.

## Open questions

### Source capture fidelity

The spec proposes capturing function bodies via `.toString()`. This works for
most cases but has edge cases:
- Minified source loses formatting
- TypeScript type annotations need stripping before capture
- Source maps need to map from the rewritten output back to the original

Alternative: use source position metadata from the Phase 1 parse to extract
exact source ranges, avoiding `.toString()` entirely. This is more reliable
and preserves source map accuracy.

### Collection mutation lowering

The spec defines `state.todos.insert()`, `.remove()`, etc. These need to lower
to efficient cell operations. Two options:

1. **Inline the mutation**: `insert(todo)` → `set(todos, [...get(todos), todo])`
   - Simple, but creates a new array on every mutation
   - Triggers full reconciliation in `forBlock`

2. **Runtime collection helpers**: `insert(todo)` → `collectionInsert(todos, todo)`
   - A small runtime helper that mutates + notifies efficiently
   - Could enable partial reconciliation hints

The first approach is simpler and aligns with how the current `forBlock` already
works (full array diffing via LIS). Recommend starting with option 1.

### ItemProxy depth

Inside `each()` render callbacks, `todo.completed` needs to produce an
`ItemFieldRef`. But what about deeper nesting? `todo.address.city` would need
recursive proxy behavior. The initial implementation should support one level
of property access and error on deeper chains unless there's a clear use case.

### TypeScript integration

The Phase 1 parser needs to handle TypeScript source (type annotations,
generics on `state.value<number>()`, etc.). Options:

1. Strip types before execution using a fast TS→JS transform (e.g., esbuild's
   `transform` API)
2. Use `tsx` or `ts-node` style evaluation that handles types natively

Recommend option 1 — esbuild's transform is already available in the Vite
context and is fast enough for build-time use.
