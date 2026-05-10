# JSX Frontend Specification

This document specifies how the Roqa JSX frontend translates JSX/TSX source
code into Roqa IR (`ComponentIR`). The JSX frontend lives in `packages/roqa-jsx/`
and implements the `RoqaFrontend` interface defined in
[`spec/frontend-guide.md`](./frontend-guide.md).

## Overview

```txt
.tsx/.jsx source → Babel parse → AST → walk → ComponentIR (Roqa IR) → compile() → JS
```

The JSX frontend:

1. Parses JSX/TSX using `@babel/parser` (with `jsx` and `typescript` plugins)
2. Walks the Babel AST to extract components, state, actions, and render trees
3. Converts each component function into a `ComponentIR` object
4. Returns the IR to the Vite plugin, which passes it to the backend compiler

### Design decisions

- **In-memory IR** — v1 passes `ComponentIR` objects directly to `compile()`.
  No `.roqa` files written to disk. Disk-cached IR is a future optimization
  (see [`spec/ROADMAP.md`](./ROADMAP.md) §Incremental compilation).

- **Babel for parsing** — Babel is already a dependency of the `roqa` package.
  The JSX frontend reuses `@babel/parser`, `@babel/traverse`, and
  `@babel/types`.

- **No type checking** — the frontend strips TypeScript annotations during
  parsing. Type errors are the user's IDE's responsibility.

---

## Package structure

```
packages/roqa-jsx/
├── package.json
├── src/
│   ├── index.js          # RoqaFrontend implementation (handles + toIR)
│   ├── parse.js           # Babel parse wrapper
│   ├── extract.js         # AST → component extraction
│   ├── state.js           # cell() / cell(() => ...) → StateIR
│   ├── actions.js         # Function declarations → ActionIR
│   ├── render.js          # JSX tree → NodeIR[]
│   ├── expressions.js     # Babel AST expressions → ExprIR
│   └── utils.js           # Shared helpers
├── tests/
│   ├── parse.test.js
│   ├── state.test.js
│   ├── actions.test.js
│   ├── render.test.js
│   ├── expressions.test.js
│   └── integration.test.js  # Full .tsx → IR round-trips
└── types/
    └── index.d.ts
```

### `package.json`

```json
{
  "name": "@roqajs/jsx",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "types": "./types/index.d.ts",
      "import": "./src/index.js"
    }
  },
  "dependencies": {
    "@babel/parser": "catalog:default",
    "@babel/traverse": "catalog:default",
    "@babel/types": "catalog:default"
  },
  "peerDependencies": {
    "roqa": "workspace:*"
  }
}
```

### Vite integration

```js
// vite.config.js (user-facing)
import roqa from "@roqajs/vite-plugin";
import jsx from "@roqajs/jsx";

export default {
  plugins: [roqa({ frontend: jsx() })],
};
```

---

## The `RoqaFrontend` implementation

```js
// packages/roqa-jsx/src/index.js

export default function jsx() {
  return {
    handles(id) {
      return /\.[jt]sx$/.test(id);
    },

    toIR(code, id) {
      const ast = parse(code, id);
      const components = extractComponents(ast, id);
      return components.length === 1 ? components[0] : components;
    },
  };
}
```

---

## JSX authoring API

The JSX frontend recognizes the following Roqa API patterns in source code.
These are the same patterns used by the existing `examples/jsx/` applications.

### Component definition

```tsx
import { defineComponent, cell, get, set } from "roqa";

function CounterButton() {
  const count = cell(0);
  const increment = () => set(count, get(count) + 1);
  return <button onclick={increment}>Count: {get(count)}</button>;
}

defineComponent("counter-button", CounterButton);
```

The frontend recognizes `defineComponent(tagName, fn)` calls to pair a
custom element name with a component function. The function body is analyzed
to extract state, actions, and the render tree (the JSX returned).

### Cell creation patterns

```tsx
// Simple reactive value → StateValueIR { kind: "value" }
const count = cell(0);
const name = cell("World");
const items = cell([]);

// Computed (derived) value → StateComputedIR { kind: "computed" }
const doubled = cell(() => get(count) * 2);
const remaining = cell(() => get(todos).filter((t) => !t.completed).length);
```

The frontend distinguishes `cell(value)` from `cell(() => expr)`:

- **Literal/value argument** → `StateValueIR`
- **Arrow function argument** → `StateComputedIR` (the body becomes the
  structured `ExprIR`)

### Reading state

```tsx
get(count); // → StateReadExpr { kind: "state-read", name: "count" }
get(doubled); // → ComputedReadExpr { kind: "computed-read", name: "doubled" }
```

The frontend resolves `get(x)` by looking up which variable `x` refers to
and producing the appropriate read expression (`state-read` for values/
collections, `computed-read` for computed cells).

### Writing state

```tsx
set(count, get(count) + 1);
// → StateWriteExpr { kind: "state-write", name: "count", value: BinaryExpr }

set(todos, [...get(todos), newTodo]);
// → StateWriteExpr { kind: "state-write", name: "todos", value: ... }
```

### Props

```tsx
// Destructured parameter → PropIR[]
function NameTag({ name, message }: { name: string; message: () => void }) {
  return <h1>Hello, {name}!</h1>;
}
```

Component functions with a destructured object parameter produce `PropIR`
entries. Each destructured key becomes a prop. Reading these in JSX produces
`PropReadExpr`.

### Lifecycle hooks

```tsx
function MyComponent(this: RoqaElement) {
  this.connected(() => {
    console.log("mounted");
  });

  this.disconnected(() => {
    console.log("unmounted");
  });

  return <p>Hello</p>;
}
```

`this.connected(fn)` → `LifecycleIR.onConnect`
`this.disconnected(fn)` → `LifecycleIR.onDisconnect`

### Conditional rendering

The JSX frontend supports several patterns that all normalize to `ShowIR`:

```tsx
// Pattern 1: logical AND (show without fallback)
{
  get(visible) && <p>Visible content</p>;
}
// → ShowIR { condition: cell-ref("visible"), render: [...], fallback: undefined }

// Pattern 2: ternary (show with fallback)
{
  get(visible) ? <p>Visible</p> : <p>Hidden</p>;
}
// → ShowIR { condition: cell-ref("visible"), render: [...], fallback: [...] }
```

The frontend must recognize that the condition references a cell and produce
a `cell-ref` (not a `state-read`), since `showBlock()` subscribes to the
cell directly.

### List rendering

```tsx
import { For } from "roqa";

<For each={todos}>{(todo) => <li>{todo.text}</li>}</For>;
// → EachIR { source: cell-ref("todos"), itemAlias: "todo", render: [...] }
```

The `<For>` component is a JSX-level construct that the frontend translates
to `EachIR`. The `each` prop becomes the `source` cell-ref, and the render
callback's parameter becomes the `itemAlias`.

Inside the `<For>` render callback, property accesses on the item variable
(e.g., `todo.text`, `todo.completed`) become `ItemFieldReadExpr` nodes.

### Event handlers

```tsx
// Named function → ActionCallExpr (both styles accepted)
<button onclick={increment}>Click</button>
<button onClick={increment}>Click</button>
// → EventBindingIR { event: "click", handler: ActionCallExpr }

// Inline arrow → ClosureExpr
<input oninput={(e) => set(name, e.target.value)} />
<input onInput={(e) => set(name, e.target.value)} />
// → EventBindingIR { event: "input", handler: ClosureExpr }
```

Event attribute names accept both lowercase DOM conventions (`onclick`) and
camelCase React conventions (`onClick`). Both normalize to the same DOM event
name in the MIR.

### Fragments

```tsx
return (
  <>
    <p>First</p>
    <p>Second</p>
  </>
);
```

JSX fragments produce multiple root-level `NodeIR` entries in the `render`
array (i.e., the component has no single root element).

### Custom element children

```tsx
<status-badge label="Active" count={get(total)}></status-badge>
```

When a JSX element's tag contains a hyphen (custom element), its JSX attributes
are analyzed:

- **Literal values** → static attributes in `ElementIR.attributes`
- **Reactive values** → the backend handles these as props (`setProp()`)

---

## Translation rules

This section defines the precise mapping from Babel AST nodes to Roqa IR nodes.
The reference algorithms in [`spec/archive/reference-algorithms.md`](./archive/reference-algorithms.md)
describe the old compiler's patterns — the approach applies here, but the
output target is Roqa IR instead of JavaScript.

### Component extraction

**Input:** A Babel `Program` AST.

**Algorithm:**

1. Find all `defineComponent(tagName, fn)` call expressions
2. For each call:
   a. Extract `tagName` from the first argument (must be a string literal)
   b. Resolve `fn` to a function declaration or expression
   c. Analyze the function body to produce `ComponentIR`
3. Return the array of `ComponentIR` objects

**Multiple components per file:**

```tsx
defineComponent("parent-app", ParentApp);
defineComponent("child-card", ChildCard);
```

→ Returns `[parentIR, childIR]`.

### State extraction

**Input:** Variable declarations inside the component function body.

**Algorithm:**

1. Find all `const x = cell(init)` declarations
2. Classify the initializer:
   - `cell(literal)` → `StateValueIR { kind: "value", name: x, initial: literal }`
   - `cell(arrayLiteral)` → `StateValueIR` (or `StateCollectionIR` if used
     with `<For>` and a key field is identifiable)
   - `cell(() => expr)` → `StateComputedIR { kind: "computed", name: x, body: convertExpr(expr) }`
3. Track which variables are cells for later resolution of `get()` / `set()`
   calls

**Identifying collections:**

A `cell([])` or `cell([...items])` becomes a `StateCollectionIR` when:

- It is used as the `each` prop of a `<For>` component
- A `key` can be inferred from the render callback's item field accesses,
  or from an explicit key prop on `<For>`

Otherwise it remains a `StateValueIR` (arrays without list rendering don't need
collection semantics).

### Action extraction

**Input:** Function declarations and arrow function expressions inside the
component body that are **not** the return value and **not** cell initializers.

**Algorithm:**

1. Find all `const fn = (...) => { ... }` and `function fn(...) { ... }`
2. For each, analyze the body:
   a. Convert the body to `ExprIR` using expression conversion rules
   b. Extract parameter names
3. Produce `ActionIR { kind: "action", name, params, body }`

**Heuristic for action vs local helper:**

- If the function is referenced in an event handler → it's an action
- If the function contains `set()` calls → it's an action
- If the function contains `emit()` calls → it's an action
- Otherwise → it may be a local helper (still emitted as an action for
  simplicity in v1; optimization can prune unreferenced actions later)

### JSX → `NodeIR` conversion

**Input:** The JSX expression returned by the component function.

**Algorithm:**

For each JSX node:

| JSX form                              | MIR node                                       |
| ------------------------------------- | ---------------------------------------------- |
| `<div>`                               | `ElementIR { tag: "div" }`                     |
| `"literal text"`                      | `TextIR { value: "literal text" }`             |
| `{get(x)}`                            | `ReactiveTextIR { source: StateReadExpr }`     |
| `{expr}` (non-get)                    | `ReactiveTextIR { source: convertExpr(expr) }` |
| `<>...</>`                            | Multiple root `NodeIR` entries                 |
| `<For each={x}>{(item) => ...}</For>` | `EachIR`                                       |
| `{get(x) && <el/>}`                   | `ShowIR` (no fallback)                         |
| `{get(x) ? <a/> : <b/>}`              | `ShowIR` (with fallback)                       |

#### Element attributes

For each JSX attribute on an element:

| JSX attribute                                   | MIR mapping                                                 |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `id="my-id"`                                    | `attributes.id: LiteralExpr`                                |
| `value={get(x)}`                                | `attributes.value: StateReadExpr`                           |
| `class="btn"`                                   | `attributes.class: LiteralExpr` or `classes: StaticClassIR` |
| `class={expr}`                                  | `classes: ClassListIR` (if conditional)                     |
| `onclick={fn}` / `onClick={fn}`                 | `events: [{ event: "click", handler: ActionCallExpr }]`     |
| `oninput={(e) => ...}` / `onInput={(e) => ...}` | `events: [{ event: "input", handler: ClosureExpr }]`        |
| `ref={name}`                                    | `ElementIR.ref = name`                                      |

#### Event attribute naming

The JSX frontend accepts both lowercase DOM-style and camelCase React-style
event attributes. Both forms normalize to the same MIR:

```
onclick    → event: "click"       (DOM-style)
onClick    → event: "click"       (React-style)
oninput    → event: "input"
onInput    → event: "input"
onkeydown  → event: "keydown"
onKeyDown  → event: "keydown"
onchange   → event: "change"
onChange   → event: "change"
```

**Normalization algorithm:**

1. Strip the `on` / `on` prefix (case-insensitive match on the first two chars)
2. Lowercase the remaining string to get the DOM event name

This means `onClick`, `onclick`, and `ONCLICK` all produce `event: "click"`.
Authors can use whichever convention they prefer — the MIR is identical.

### Expression conversion: Babel AST → `ExprIR`

This is the core of the JSX frontend. Every JavaScript expression inside the
component must be converted to a structured `ExprIR`.

| Babel AST node                | ExprIR                                            |
| ----------------------------- | ------------------------------------------------- |
| `NumericLiteral(42)`          | `LiteralExpr { value: 42 }`                       |
| `StringLiteral("hi")`         | `LiteralExpr { value: "hi" }`                     |
| `BooleanLiteral(true)`        | `LiteralExpr { value: true }`                     |
| `NullLiteral`                 | `LiteralExpr { value: null }`                     |
| `TemplateLiteral`             | `TemplateLiteralExpr { parts: [...] }`            |
| `BinaryExpression(+, l, r)`   | `BinaryExpr { op: "+", left, right }`             |
| `UnaryExpression(!, x)`       | `UnaryExpr { op: "!", operand }`                  |
| `ConditionalExpression`       | `ConditionalExpr { test, consequent, alternate }` |
| `MemberExpression(o, p)`      | `MemberExpr { object, property }`                 |
| `CallExpression(get, [x])`    | `StateReadExpr` or `ComputedReadExpr` (see below) |
| `CallExpression(set, [x, v])` | `StateWriteExpr`                                  |
| `CallExpression(fn, args)`    | `CallExpr { callee, args }`                       |
| `ArrowFunctionExpression`     | `ClosureExpr { params, body }`                    |
| `ObjectExpression`            | `ObjectExpr { properties }`                       |
| `SpreadElement`               | `SpreadExpr { argument }`                         |
| `Identifier(x)`               | Context-dependent (see resolution rules)          |

#### Identifier resolution

When the expression converter encounters an `Identifier`, it must resolve it
against the component's scope:

| Identifier refers to         | ExprIR                                       |
| ---------------------------- | -------------------------------------------- |
| A `cell()` variable          | **Depends on context** — see `get()`/`set()` |
| An action function           | `ActionCallExpr` (if used as event handler)  |
| A prop (destructured param)  | `PropReadExpr`                               |
| A closure parameter          | `ParamReadExpr`                              |
| An `each` item alias         | `ParamReadExpr` (inside `<For>`)             |
| A module-level import        | `ImportedRefExpr`                            |
| A global (`Math`, `console`) | `ExternalRefExpr`                            |

#### `get()` and `set()` recognition

The frontend recognizes specific Roqa API calls:

**`get(cellVar)`:**

1. Resolve `cellVar` to its declaration
2. If it's a `StateValueIR` or `StateCollectionIR` → `StateReadExpr { name }`
3. If it's a `StateComputedIR` → `ComputedReadExpr { name }`

**`set(cellVar, valueExpr)`:**

1. Resolve `cellVar` to its declaration
2. Convert `valueExpr` to `ExprIR`
3. → `StateWriteExpr { name, value }`

**Note on cell-ref production:**

When a cell variable appears as the `each` prop of `<For>` or as the condition
in a `&&`/ternary pattern, the frontend produces a `cell-ref` instead of
wrapping in `get()`:

```tsx
<For each={todos}>     // todos is NOT wrapped in get()
                       // → cell-ref("todos")

{get(visible) && ...}  // visible IS inside get()
                       // frontend must produce cell-ref("visible"), not state-read
```

The `&&` and ternary patterns are special: even though the source says
`get(visible)`, the frontend recognizes this as a `ShowIR` condition and
produces a `cell-ref` because `showBlock()` needs the cell itself.

#### Item field access inside `<For>`

```tsx
<For each={todos}>{(todo) => <li>{todo.text}</li>}</For>
```

Inside the `<For>` render callback, member access on the item parameter
(`todo.text`, `todo.completed`) becomes `ItemFieldReadExpr`:

```json
{ "kind": "item-field-read", "field": "text" }
```

The frontend tracks which variable is the `<For>` item alias and converts
property accesses on it accordingly.

### Lifecycle extraction

**`this.connected(fn)`:**

```tsx
this.connected(() => {
  console.log("mounted");
});
```

The callback body is converted to `ExprIR` and stored as
`LifecycleIR.onConnect`.

**`this.disconnected(fn)`:**

Same pattern → `LifecycleIR.onDisconnect`.

The `this` reference requires the component function to use `function`
declaration syntax (not arrow functions, which don't have their own `this`).

### Import extraction

```tsx
import { formatDate } from "./utils.js";
```

Module imports (excluding `roqa` imports) are collected into
`ComponentMetadata.imports`:

```json
{
  "metadata": {
    "imports": [
      { "kind": "import", "source": "./utils.js", "bindings": ["formatDate"] }
    ]
  }
}
```

When `formatDate` is used in an expression, it produces:

```json
{ "kind": "imported-ref", "source": "./utils.js", "name": "formatDate" }
```

Roqa imports (`cell`, `get`, `set`, `defineComponent`, `For`) are **not**
included in the MIR — they are framework primitives that the frontend
consumes during translation, not runtime dependencies.

---

## Normalization rules

The JSX frontend must normalize source patterns to canonical IR forms.
Different ways of writing the same thing in JSX should produce the same IR.

### Class normalization

```tsx
// All of these:
<div class="btn">           // string literal
<div class={"btn"}>         // expression with string
<div className="btn">       // React-style (accepted as alias)

// Produce the same MIR:
// attributes.class: { kind: "literal", value: "btn" }
```

```tsx
// Conditional classes:
<div class={active ? "btn active" : "btn"}>

// Normalizes to:
// classes: { kind: "class-list", items: ["btn", { name: "active", condition: ... }] }
```

### Event handler normalization

```tsx
// All of these produce the same MIR (ActionCallExpr with event: "click"):
<button onclick={increment}>
<button onClick={increment}>
<button onclick={() => increment()}>  // arrow wrapping a no-arg call
<button onClick={() => increment()}>

// All normalize to:
// { event: "click", handler: { kind: "action-call", name: "increment", args: [] } }
```

When the arrow function body does more than call a single action, it stays
as a `ClosureExpr`.

### Fragment normalization

```tsx
// Fragment wrapper:
return (
  <>
    <p>A</p>
    <p>B</p>
  </>
);

// Equivalent to render: [ElementIR("p", "A"), ElementIR("p", "B")]
// (fragments are unwrapped — they don't produce a wrapper node)
```

### Boolean attributes

```tsx
<button disabled>
<input checked={get(isChecked)}>
```

- `disabled` (no value) → `attributes.disabled: LiteralExpr(true)`
- `checked={expr}` → `attributes.checked: convertExpr(expr)`

---

## Edge cases and design decisions

### Multi-expression action bodies

```tsx
const addTodo = () => {
  set(todos, [...get(todos), { text: get(draft), completed: false }]);
  set(draft, "");
};
```

When an action body contains multiple statements, they are wrapped in a
`BlockExpr`:

```json
{
  "kind": "block",
  "body": [
    { "kind": "state-write", "name": "todos", "value": "..." },
    {
      "kind": "state-write",
      "name": "draft",
      "value": { "kind": "literal", "value": "" }
    }
  ]
}
```

### `this` access for `RoqaElement` methods

```tsx
function App(this: RoqaElement) {
  const message = () => alert("From <" + this.tagName.toLowerCase() + ">");
}
```

The `this` keyword inside component functions refers to the `RoqaElement`
instance. The frontend preserves `this` references using `ExternalRefExpr`
with appropriate member access:

```json
{
  "kind": "method-call",
  "object": {
    "kind": "member",
    "object": { "kind": "external-ref", "name": "this" },
    "property": "tagName"
  },
  "method": "toLowerCase",
  "args": []
}
```

### Emit / custom events

```tsx
this.on("count-changed", handler); // listening (parent side)
this.emit("count-changed", detail); // dispatching
```

Event emission in actions produces `EmitExpr`:

```json
{
  "kind": "emit",
  "event": "count-changed",
  "detail": { "kind": "state-read", "name": "count" }
}
```

### TypeScript stripping

TypeScript annotations are stripped during parsing — they do not appear in
the MIR. Type assertions (`as HTMLInputElement`) are unwrapped to their
expression:

```tsx
(e.target as HTMLInputElement).value;
// → MemberExpr { object: MemberExpr { object: ParamRead("e"), property: "target" }, property: "value" }
```

### CSS imports

```tsx
import "./styles.css";
```

CSS imports are passed through to the Vite pipeline unchanged — the JSX
frontend does not process them. They are not included in the MIR.

---

## Reference translations

These show complete source → MIR translations for the canonical examples.

### Counter button

**Source** (`examples/jsx/counter-button/src/main.tsx`):

```tsx
import { defineComponent, cell, get, set } from "roqa";

function App() {
  const count = cell(0);
  const increment = () => set(count, get(count) + 1);
  return <button onclick={increment}>Count is {get(count)}</button>;
}

defineComponent("counter-button", App);
```

**MIR output:**

```json
{
  "version": 1,
  "tagName": "counter-button",
  "name": "App",
  "state": [{ "kind": "value", "name": "count", "initial": 0 }],
  "actions": [
    {
      "kind": "action",
      "name": "increment",
      "params": [],
      "body": {
        "kind": "state-write",
        "name": "count",
        "value": {
          "kind": "binary",
          "op": "+",
          "left": { "kind": "state-read", "name": "count" },
          "right": { "kind": "literal", "value": 1 }
        }
      }
    }
  ],
  "props": [],
  "attrs": [],
  "emits": [],
  "lifecycle": {},
  "render": [
    {
      "kind": "element",
      "tag": "button",
      "attributes": {},
      "events": [
        {
          "event": "click",
          "handler": { "kind": "action-call", "name": "increment", "args": [] }
        }
      ],
      "children": [
        { "kind": "text", "value": "Count is " },
        {
          "kind": "reactive-text",
          "source": { "kind": "state-read", "name": "count" }
        }
      ]
    }
  ]
}
```

### Derived state

**Source** (`examples/jsx/derived-count/src/main.tsx`):

```tsx
function DerivedCount() {
  const count = cell(0);
  const doubled = cell(() => get(count) * 2);
  const quadrupled = cell(() => get(doubled) * 2);

  const increment = () => set(count, get(count) + 1);

  return (
    <>
      <button onclick={increment}>Increment count</button>
      <p>Count: {get(count)}</p>
      <p>Doubled: {get(doubled)}</p>
      <p>Quadrupled: {get(quadrupled)}</p>
    </>
  );
}
```

**MIR output:**

```json
{
  "version": 1,
  "tagName": "derived-count",
  "name": "DerivedCount",
  "state": [
    { "kind": "value", "name": "count", "initial": 0 },
    {
      "kind": "computed",
      "name": "doubled",
      "body": {
        "kind": "binary",
        "op": "*",
        "left": { "kind": "state-read", "name": "count" },
        "right": { "kind": "literal", "value": 2 }
      }
    },
    {
      "kind": "computed",
      "name": "quadrupled",
      "body": {
        "kind": "binary",
        "op": "*",
        "left": { "kind": "computed-read", "name": "doubled" },
        "right": { "kind": "literal", "value": 2 }
      }
    }
  ],
  "actions": [
    {
      "kind": "action",
      "name": "increment",
      "params": [],
      "body": {
        "kind": "state-write",
        "name": "count",
        "value": {
          "kind": "binary",
          "op": "+",
          "left": { "kind": "state-read", "name": "count" },
          "right": { "kind": "literal", "value": 1 }
        }
      }
    }
  ],
  "props": [],
  "attrs": [],
  "emits": [],
  "lifecycle": {},
  "render": [
    {
      "kind": "element",
      "tag": "button",
      "attributes": {},
      "events": [
        {
          "event": "click",
          "handler": { "kind": "action-call", "name": "increment", "args": [] }
        }
      ],
      "children": [{ "kind": "text", "value": "Increment count" }]
    },
    {
      "kind": "element",
      "tag": "p",
      "attributes": {},
      "events": [],
      "children": [
        { "kind": "text", "value": "Count: " },
        {
          "kind": "reactive-text",
          "source": { "kind": "state-read", "name": "count" }
        }
      ]
    },
    {
      "kind": "element",
      "tag": "p",
      "attributes": {},
      "events": [],
      "children": [
        { "kind": "text", "value": "Doubled: " },
        {
          "kind": "reactive-text",
          "source": { "kind": "computed-read", "name": "doubled" }
        }
      ]
    },
    {
      "kind": "element",
      "tag": "p",
      "attributes": {},
      "events": [],
      "children": [
        { "kind": "text", "value": "Quadrupled: " },
        {
          "kind": "reactive-text",
          "source": { "kind": "computed-read", "name": "quadrupled" }
        }
      ]
    }
  ]
}
```

### Hello world (two-way binding)

**Source** (`examples/jsx/hello-world/src/main.tsx`):

```tsx
function HelloWorld() {
  const name = cell("World");
  const updateName = (e: Event) =>
    set(name, (e.target as HTMLInputElement).value);

  return (
    <>
      <label for="name">Enter name:</label>
      <input id="name" type="text" value={get(name)} oninput={updateName} />
      <p id="msg">Hello {get(name)}!</p>
    </>
  );
}
```

**MIR output:**

```json
{
  "version": 1,
  "tagName": "hello-world",
  "name": "HelloWorld",
  "state": [{ "kind": "value", "name": "name", "initial": "World" }],
  "actions": [
    {
      "kind": "action",
      "name": "updateName",
      "params": ["e"],
      "body": {
        "kind": "state-write",
        "name": "name",
        "value": {
          "kind": "member",
          "object": {
            "kind": "member",
            "object": { "kind": "param-read", "name": "e" },
            "property": "target"
          },
          "property": "value"
        }
      }
    }
  ],
  "props": [],
  "attrs": [],
  "emits": [],
  "lifecycle": {},
  "render": [
    {
      "kind": "element",
      "tag": "label",
      "attributes": { "for": { "kind": "literal", "value": "name" } },
      "events": [],
      "children": [{ "kind": "text", "value": "Enter name:" }]
    },
    {
      "kind": "element",
      "tag": "input",
      "attributes": {
        "id": { "kind": "literal", "value": "name" },
        "type": { "kind": "literal", "value": "text" },
        "value": { "kind": "state-read", "name": "name" }
      },
      "events": [
        {
          "event": "input",
          "handler": { "kind": "action-call", "name": "updateName", "args": [] }
        }
      ],
      "children": []
    },
    {
      "kind": "element",
      "tag": "p",
      "attributes": { "id": { "kind": "literal", "value": "msg" } },
      "events": [],
      "children": [
        { "kind": "text", "value": "Hello " },
        {
          "kind": "reactive-text",
          "source": { "kind": "state-read", "name": "name" }
        },
        { "kind": "text", "value": "!" }
      ]
    }
  ]
}
```

---

## Open questions

### Collection detection

How should the frontend distinguish `cell([])` (a plain array state value)
from `cell([])` (a keyed collection for list rendering)?

**Current approach:** Analyze usage — if the cell appears as `<For each={x}>`,
treat it as a collection and infer the key from item field access patterns
or `<For>` props.

**Alternative:** Require explicit collection syntax (e.g., `collection([], "id")`)
to make the distinction unambiguous at the declaration site.

### Complex `set()` patterns

The existing JSX examples use patterns like:

```tsx
set(todos, [...get(todos), newTodo]); // append
set(
  todos,
  get(todos).filter((t) => !t.completed),
); // filter
```

Should these be recognized as `collection-op` expressions (`insert`,
`remove-where`), or kept as raw `StateWriteExpr` with the full expression
tree?

**Current approach:** Keep as `StateWriteExpr` in v1 for simplicity. The
backend handles these correctly (it compiles the full expression). Collection
ops can be recognized as a v2 optimization.

### Action naming from anonymous arrows

```tsx
const increment = () => set(count, get(count) + 1);
```

The action name is taken from the variable binding (`increment`). What about
inline arrow functions in event handlers?

```tsx
<button onclick={() => set(count, get(count) + 1)}>
```

**Current approach:** Inline arrows become `ClosureExpr` event handlers, not
named actions. This is correct and matches how the backend handles them.

---

## Reference

- [`spec/frontend-guide.md`](./frontend-guide.md) — General frontend author
  guide (the `ComponentIR` contract, `RoqaFrontend` interface, testing
  strategies)
- [`spec/ir.md`](./ir.md) — Complete Roqa IR type definitions
- [`spec/archive/reference-algorithms.md`](./archive/reference-algorithms.md) —
  Old compiler algorithms (DOM traversal, text coalescing, event delegation)
- [`examples/jsx/`](../examples/jsx/) — 21 JSX example applications (test
  targets for the frontend)
- [`examples/ir/`](../examples/ir/) — 13 IR reference applications (target
  output for translation verification)
