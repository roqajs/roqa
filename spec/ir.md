# Roqa Component IR

This document defines the intermediate representation (IR) that sits between
Roqa's authoring API and its code generator. Every component passes through
this format — it is the central data structure of the compiler.

## What is an IR and why does it matter?

An intermediate representation is a structured data format that a compiler uses
internally to represent a program between parsing and code generation. Instead
of going directly from source code to output, the compiler goes:

```txt
source → IR → output
```

This indirection exists because source code is optimized for humans to write
and output code is optimized for machines to execute — but neither is a good
format for the compiler to analyze and transform. The IR is the format
optimized for the compiler itself.

### Mental model: IR as a blueprint

Think of it like architecture. The agent writes a description of a building
(the component source). The IR is the blueprint — a precise structural drawing
that strips away prose and captures exactly what needs to be built. The code
generator is the construction crew that reads the blueprint and builds the
actual structure.

The blueprint doesn't contain opinions about *how* to write the description or
*how* to pour the concrete. It captures *what* exists: which rooms, which
walls, which doors, where the plumbing goes.

### Properties of a good IR

**1. Complete** — the IR must contain everything the code generator needs. If
information is lost in the translation from source to IR, the code generator
can't recover it. For Roqa, this means the IR must capture: the full view
tree structure, which values are reactive, which are static, all event
bindings, all state with initial values, all computed dependencies.

**2. Unambiguous** — every IR node has exactly one interpretation. A `kind`
field on every node means you can always pattern-match on it. There are no
cases where the code generator has to guess what something means.

**3. Minimal** — the IR shouldn't carry information that no downstream phase
uses. For example, TypeScript types are useful for diagnostics but the code
generator doesn't need them for output — so they're optional metadata fields,
not required structure.

**4. Normalized** — different ways of writing the same thing in source code
should produce the same IR. The class `"button"` and `["button"]` both produce
the same `ClassIR`. This means the code generator only handles one form.

**5. Frontend-independent** — the IR doesn't know whether it came from the
builder API, from JSX, or from a JSON file. Any frontend that can produce
valid IR can use the same backend. This is what makes the multi-frontend
architecture possible:

```txt
JSX frontend       \
                    → Component IR → Backend codegen
Builder frontend   /
```

### How to read IR type definitions

The IR is defined as TypeScript types using discriminated unions. If you're not
used to these, here's the pattern:

```ts
type NodeIR =
    | ElementIR
    | TextIR
    | ShowIR;
```

This means: "a `NodeIR` is one of `ElementIR`, `TextIR`, or `ShowIR`." Each
variant has a `kind` field that tells you which one it is:

```ts
type ElementIR = { kind: "element"; tag: string; ... };
type TextIR    = { kind: "text"; value: string; };
type ShowIR    = { kind: "show"; condition: ...; ... };
```

To process an IR node, you switch on `kind`:

```ts
function processNode(node: NodeIR) {
    switch (node.kind) {
        case "element": return processElement(node);
        case "text":    return processText(node);
        case "show":    return processShow(node);
    }
}
```

This pattern is sometimes called a "tagged union" — the `kind` field is the
tag. It's the standard way to represent tree-structured data in compilers.

### Two kinds of IR fields

IR nodes carry two kinds of information:

- **Structural fields** describe *what* to build. The `tag` on an `ElementIR`,
  the `children` array, the `condition` on a `ShowIR`. These drive code
  generation.

- **Metadata fields** provide extra context for validation, diagnostics, or
  tooling. Type annotations, source positions, contextAccess lists. These are
  optional and don't affect the generated output.

The distinction matters when evolving the IR: structural fields are hard to
change (everything downstream depends on them), metadata fields are easy to add.

### Static vs reactive: the core distinction

The most important concept in this IR is the difference between **static** and
**reactive** values.

A **static value** is known at build time and baked into the HTML template:

```ts
{ kind: "static", value: "increment-button" }  // becomes id="increment-button" in template
{ kind: "text", value: "Count is " }            // becomes literal text in template
```

A **reactive value** is a reference to state that can change at runtime:

```ts
{ kind: "reactive-read", source: "state", name: "count" }  // becomes a binding
{ kind: "state-ref", name: "todos" }                        // becomes a cell subscription
```

The code generator treats these fundamentally differently:
- Static values go into `template("<html>")` strings
- Reactive values become cell declarations, `bind()` calls, text node
  `nodeValue` updates, etc.

A **state-ref** (without `.get()`) vs a **reactive-read** (with `.get()`)
matters too:
- `state-ref` = "give me the cell itself" — used by `show()`, `each()`,
  `forBlock()`, `showBlock()` for subscription
- `reactive-read` = "give me the current value" — used in text content,
  attribute bindings, class conditions

---

## Component IR

The root type. One per `component()` call.

```ts
type ComponentIR = {
    tagName: string;              // Custom element tag (e.g., "counter-button")
    name: string;                 // Export name (e.g., "CounterButton")

    props: PropIR[];
    attrs: AttrIR[];
    state: StateIR[];
    emits: EmitIR[];
    actions: ActionIR[];
    lifecycle: LifecycleIR;
    render: NodeIR;               // The root of the view tree
};
```

Every section is an array (or object for lifecycle/render) so the code
generator can iterate uniformly. Empty sections are empty arrays, not absent
keys — this simplifies iteration.

---

## State IR

State declarations describe the reactive data the component owns.

```ts
type StateIR =
    | StateValueIR
    | StateCollectionIR
    | StateComputedIR;
```

### `StateValueIR` — simple reactive value

```ts
type StateValueIR = {
    kind: "value";
    name: string;                 // The state property name
    initial: unknown;             // The JS value (number, string, boolean, array, etc.)
    typeAnnotation?: string;      // Optional TS type for diagnostics
};
```

Authoring API:

```ts
count: state.value<number>({ initial: 0 })
```

Lowered output:

```ts
const count = cell(0);
// After inlining: const count = { v: 0, e: [] };
```

### `StateCollectionIR` — keyed list

```ts
type StateCollectionIR = {
    kind: "collection";
    name: string;
    key: string | null;           // String = keyof T, null = key function used
    keySource?: string;           // Source text of key function, if key is null
    initial: unknown[];           // Initial array contents
};
```

Authoring API:

```ts
todos: state.collection<Todo>({ key: "id", initial: [] })
```

Lowered output:

```ts
const todos = cell([]);
// Collection helpers (insert, remove, etc.) are inlined at action call sites
```

### `StateComputedIR` — derived value

```ts
type StateComputedIR = {
    kind: "computed";
    name: string;
    source: string;               // Function body as source text
    dependencies: string[];       // State/prop/attr names read via .get()
    contextAccess: string[];      // Which context properties the fn destructures
};
```

Authoring API:

```ts
remaining: computed(({ state }) =>
    state.todos.get().filter(t => !t.completed).length
)
```

Lowered output:

```ts
const remaining = cell(() => get(todos).filter(t => !t.completed).length);
// After inlining: const remaining = { v: () => todos.v.filter(...), e: [] };
```

The `dependencies` array (`["todos"]`) tells the code generator which cells
this computed reads, so it can set up proper update propagation.

---

## Node IR

The view tree. Every node the component renders is one of these types.

```ts
type NodeIR =
    | ElementIR
    | TextIR
    | ReactiveTextIR
    | ShowIR
    | EachIR
    | RawHtmlIR
    | FragmentIR;
```

### `ElementIR` — an HTML element

The most common node type. Represents a single DOM element with its props,
events, children, etc.

```ts
type ElementIR = {
    kind: "element";
    tag: string;                  // HTML tag name (e.g., "div", "button")
    ref?: string;                 // Named ref for lifecycle access
    props: Record<string, StaticValue | ReactiveRead>;
    events: EventBindingIR[];
    children: NodeIR[];
    classes?: ClassIR;
    styles?: Record<string, StaticValue | ReactiveRead>;
    attributes?: Record<string, StaticValue | ReactiveRead>;
};
```

The code generator splits this into:
- **Template**: the tag + static attributes → HTML string
- **Traversal**: firstChild/nextSibling chains to reach dynamic points
- **Bindings**: reactive props/classes/attributes → bind() calls
- **Events**: event bindings → `element.__click = handler` assignments

### `TextIR` — static text

```ts
type TextIR = {
    kind: "text";
    value: string;
};
```

Goes directly into the template HTML string. No binding needed.

### `ReactiveTextIR` — dynamic text value

```ts
type ReactiveTextIR = {
    kind: "reactive-read";
    source: "state" | "prop" | "attr" | "computed";
    name: string;
};
```

A space placeholder `' '` goes into the template (creating a text node), and a
binding updates `textNode.nodeValue` when the source changes.

### `ShowIR` — conditional rendering

```ts
type ShowIR = {
    kind: "show";
    condition: StateRef;          // Cell to subscribe to
    render: NodeIR;               // View tree when truthy
    fallback?: NodeIR;            // Optional view tree when falsy
};
```

Lowered to `showBlock(container, conditionCell, renderFn)`.

The `condition` is a **state-ref** (not a reactive-read) — the code generator
passes the cell directly to `showBlock()` for subscription.

### `EachIR` — list rendering

```ts
type EachIR = {
    kind: "each";
    source: StateRef;             // Cell containing the array
    key?: string | null;          // Key field name or null for key function
    blockId: string;              // Unique identifier for this list block
    itemFields: string[];         // Item properties accessed in render
    render: NodeIR;               // View tree for each item
};
```

Lowered to `forBlock(container, sourceCell, renderFn)`.

`itemFields` tells the code generator which properties of each list item are
accessed, so it can generate precise variables in the render callback.

### `RawHtmlIR` — trusted HTML escape hatch

```ts
type RawHtmlIR = {
    kind: "raw-html";
    html: string | ReactiveRead;
    ref?: string;
};
```

### `FragmentIR` — multiple root nodes

```ts
type FragmentIR = {
    kind: "fragment";
    children: NodeIR[];
};
```

Used when a component returns multiple root elements without a wrapper.

---

## Ref types

These appear throughout the IR as values in props, children, conditions, etc.
They are the "pointers" that connect the view tree to the component's state,
props, actions, and list items.

### `StaticValue` — build-time constant

```ts
type StaticValue = {
    kind: "static";
    value: string | number | boolean;
};
```

### `ReactiveRead` — current value of a cell

```ts
type ReactiveRead = {
    kind: "reactive-read";
    source: "state" | "prop" | "attr" | "computed";
    name: string;
};
```

Produced when `.get()` is called. Means "read this value now and update when it
changes."

### `StateRef` — reference to a cell itself

```ts
type StateRef = {
    kind: "state-ref";
    name: string;
};
```

Produced when a state property is passed directly (without `.get()`). Used by
`show()` and `each()` to subscribe to the cell.

### `PropRef` — reference to a prop value

```ts
type PropRef = {
    kind: "prop-ref";
    name: string;
    path?: string[];              // For nested access: props.story.url → ["url"]
};
```

### `ActionRef` — reference to an action handler

```ts
type ActionRef = {
    kind: "action-ref";
    name: string;
};
```

Used as event handlers: `onClick: actions.save`.

### `BoundActionRef` — action with pre-bound arguments

```ts
type BoundActionRef = {
    kind: "bound-action";
    name: string;
    args: unknown[];
};
```

Used for parameterized handlers: `onChange: actions.toggleTodo(todo.id)`.
Lowers to the array-form delegated event: `el.__change = [toggleTodo, id]`.

### `ItemFieldRef` — field of a list item

```ts
type ItemFieldRef = {
    kind: "item-field-ref";
    field: string;
};
```

Produced inside `each()` render callbacks when accessing properties of the
current item. `todo.completed` → `{ kind: "item-field-ref", field: "completed" }`.

---

## Event binding IR

```ts
type EventBindingIR = {
    event: string;                // DOM event name: "click", "input", etc.
    handler:
        | ActionRef
        | BoundActionRef
        | InlineHandler;
};

type InlineHandler = {
    kind: "inline-handler";
    source: string;               // Function body source text (escape hatch)
};
```

---

## Class IR

Classes have their own IR because they support multiple authoring forms that
normalize to structured data.

```ts
type ClassIR =
    | StaticClassIR
    | ClassListIR;

type StaticClassIR = {
    kind: "static-class";
    value: string;                // e.g., "button primary"
};

type ClassListIR = {
    kind: "class-list";
    items: ClassItemIR[];
};

type ClassItemIR =
    | string                                          // Static class name
    | { name: string; condition: ReactiveRead };      // Conditional class
```

Example normalization — all of these produce the same IR:

```ts
// Source forms:
class: "button"
class: ["button"]
class: { button: true }

// All normalize to:
{ kind: "static-class", value: "button" }
```

```ts
// Source:
class: ["todo", { completed: todo.completed }]

// IR:
{
    kind: "class-list",
    items: [
        "todo",
        { name: "completed", condition: { kind: "item-field-ref", field: "completed" } }
    ]
}
```

---

## Action IR

```ts
type ActionIR = {
    kind: "command";
    name: string;                 // The action property name
    source: string;               // Function body as source text
    params: string[];             // Parameter names (after context object)
    contextAccess: string[];      // Context properties destructured: ["state", "emit"], etc.
};
```

Action bodies are captured as source text because they contain runtime logic.
The code generator rewrites `state.X.get()` → `get(X)`, `state.X.set(v)` →
`set(X, v)`, etc. when embedding them in the output.

---

## Prop, Attr, Emit IR

### Props — rich JS values passed to custom elements

```ts
type PropIR = {
    kind: "prop";
    name: string;
    required: boolean;
    default?: unknown;
    typeAnnotation?: string;
};
```

### Attrs — serialized DOM attributes

```ts
type AttrIR = {
    kind: "attr";
    name: string;
    default?: unknown;
    reflect: boolean;             // Whether changes are reflected back to the DOM attribute
    typeAnnotation?: string;
};
```

### Emits — custom events the component dispatches

```ts
type EmitIR = {
    kind: "emit";
    name: string;                 // Typed handle name (e.g., "todoAdded")
    eventName: string;            // DOM event name (e.g., "todo-added")
    typeAnnotation?: string;
};
```

---

## Lifecycle IR

```ts
type LifecycleIR = {
    onConnect?: {
        source: string;           // Function body as source text
        contextAccess: string[];  // Context properties destructured
    };
    onDisconnect?: {
        source: string;
        contextAccess: string[];
    };
};
```

Like actions, lifecycle hooks contain runtime logic and are captured as source
text. The code generator rewrites them the same way and places them inside
`this.connected()` / `this.disconnected()`.

---

## Complete example

Here is the full IR for the CounterButton component from the agent API spec.

### Source

```ts
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

### IR

```json
{
    "tagName": "counter-button",
    "name": "CounterButton",

    "props": [],
    "attrs": [],
    "emits": [],

    "state": [
        {
            "kind": "value",
            "name": "count",
            "initial": 0,
            "typeAnnotation": "number"
        },
        {
            "kind": "computed",
            "name": "doubled",
            "source": "({ state }) => state.count.get() * 2",
            "dependencies": ["count"],
            "contextAccess": ["state"]
        }
    ],

    "actions": [
        {
            "kind": "command",
            "name": "increment",
            "source": "({ state }) => { state.count.set(state.count.get() + 1); }",
            "params": [],
            "contextAccess": ["state"]
        }
    ],

    "lifecycle": {},

    "render": {
        "kind": "element",
        "tag": "button",
        "props": {
            "id": { "kind": "static", "value": "increment-button" }
        },
        "events": [
            {
                "event": "click",
                "handler": { "kind": "action-ref", "name": "increment" }
            }
        ],
        "children": [
            { "kind": "text", "value": "Count is " },
            { "kind": "reactive-read", "source": "state", "name": "count" },
            { "kind": "text", "value": " / doubled is " },
            { "kind": "reactive-read", "source": "state", "name": "doubled" }
        ]
    }
}
```

### What the code generator does with this IR

1. **Reads `state`** → emits `const count = cell(0)` and
   `const doubled = cell(() => get(count) * 2)`

2. **Reads `actions`** → rewrites the source and emits
   `const increment = () => { set(count, get(count) + 1); }`

3. **Walks `render`** → sees `kind: "element"`, `tag: "button"`:
   - Extracts static HTML: `<button id="increment-button"> </button>`
     (spaces are placeholders for reactive text nodes)
   - Generates traversal: `const button_1 = $tmpl_1().firstChild`
   - Generates text node ref: `const button_1_text = button_1.firstChild`

4. **Processes `events`** → sees `click` with `action-ref` "increment":
   - Emits `button_1.__click = increment`
   - Records "click" for `delegate()` call

5. **Processes `children`** → sees two static text nodes and two reactive reads:
   - The reactive reads generate a binding that updates `nodeValue` with the
     concatenated string
   - Emits `bind(count, ...)` and `bind(doubled, ...)`

6. **Wraps everything** in `defineComponent("counter-button", function() { ... })`

7. **Phase 5** inlines all `cell()`, `get()`, `set()`, `bind()` calls into the
   final optimized output.

---

## IR versioning

The IR should carry a version number:

```ts
type ComponentIR = {
    version: 1;                   // Increment on breaking changes
    tagName: string;
    // ...
};
```

This allows:
- Cached IR to be invalidated when the format changes
- Multiple IR versions to coexist during migration
- Clear error messages when a frontend produces an outdated IR format

---

## Design decisions and rationale

### Why discriminated unions (tagged `kind` fields)?

Every IR node has a `kind` field. This is deliberate:

1. **Exhaustive matching** — TypeScript will warn if you add a new IR variant
   but forget to handle it in a switch statement.
2. **Serializable** — the IR can be JSON-serialized for caching or debugging.
   The `kind` field survives serialization (unlike `instanceof` checks).
3. **Inspectable** — you can `console.log(node)` and immediately see what
   it is. No need to check constructor names or prototype chains.

### Why source text for actions/computed instead of AST?

Actions and computed bodies are captured as source text strings, not as parsed
AST nodes. Reasons:

1. **Serializable** — strings can be JSON-serialized. AST nodes contain
   circular references and platform-specific metadata.
2. **Frontend-independent** — the IR doesn't force a particular parser. The
   source text can be re-parsed by the code generator using whatever parser
   it prefers.
3. **Simpler** — the code generator already applies string-based rewrite rules
   (`state.X.get()` → `get(X)`). Working with source text is a natural fit.

The tradeoff is that source text is less structured than AST — but the rewrite
rules are simple enough that regex-based transforms work reliably for the
constrained patterns the builder API produces.

### Why separate `state-ref` from `reactive-read`?

These represent fundamentally different operations:

- `state-ref` = "I need the cell object" → used for subscription
  (`forBlock`, `showBlock`, `bind`)
- `reactive-read` = "I need the current value" → used for rendering
  (`nodeValue`, `className`, attribute values)

Collapsing them into one type would force the code generator to infer intent
from context, which is exactly the kind of ambiguity an IR should eliminate.

In the authoring API, the distinction maps to:
- `state.todos` (no `.get()`) → `state-ref`
- `state.count.get()` → `reactive-read`
