# Frontend Author Guide

This document explains how to build a custom frontend for Roqa. A frontend
converts an authoring syntax (JSX, a custom DSL, a visual builder, etc.) into
Roqa IR — the intermediate representation that the Roqa backend compiles into
optimized JavaScript.

You do not need to understand the backend compiler to build a frontend. Your
job is to produce valid `ComponentIR` objects; the backend handles everything
from there.

## Architecture overview

```txt
Your frontend                         Roqa backend
─────────────                         ────────────
Source code  →  parse  →  your frontend model  →  Roqa IR  →  compile()  →  Optimized JS
    (.tsx)       (yours)        (yours)               │             │
  (.dsl)                                         │    validate → lower → optimize → emit
  (GUI)                                          │
                                                 ▼
                                        ComponentIR (JSON-serializable)
```

A frontend is responsible for:

1. **Parsing** source code into whatever internal representation you want
2. **Normalizing** that representation into valid `ComponentIR` objects
3. **Returning** those objects from `toIR()`

The backend is responsible for:

1. **Validating** the IR (structural soundness, reference integrity)
2. **Lowering** it into compiler-internal forms (template extraction, traversal, bindings)
3. **Optimizing** those internal forms (cell inlining, binding inlining)
4. **Emitting** JavaScript (the final output)

---

## The `RoqaFrontend` interface

Every frontend implements two methods:

```ts
interface RoqaFrontend {
  handles(id: string): boolean;
  toIR(code: string, id: string): ComponentIR | ComponentIR[];
}
```

### `handles(id)`

Returns `true` if this frontend should process the given file. The `id` is a
fully-resolved file path (e.g., `/src/components/Counter.tsx`).

```js
// Example: a JSX frontend that handles .tsx and .jsx files
handles(id) {
    return /\.[jt]sx$/.test(id);
}
```

### `toIR(code, id)`

Accepts the raw source code and file path, returns one or more `ComponentIR`
objects. A single file may define multiple components (return an array), or
just one (return a single object).

```js
// Example: parse JSX, walk AST, produce Roqa IR
toIR(code, id) {
    const ast = parse(code);
    const components = extractComponents(ast);
    return components.map(c => convertToMIR(c));
}
```

### Wiring into the Vite plugin

Pass your frontend to the `roqa()` Vite plugin:

```js
// vite.config.js
import roqa from "@roqajs/vite-plugin";
import myFrontend from "./my-frontend.js";

export default {
  plugins: [roqa({ frontend: myFrontend })],
};
```

The plugin calls `frontend.handles(id)` during Vite's `transform` hook. When
it returns `true`, the plugin calls `frontend.toIR(code, id)` and passes the
result to `compile()`.

`.roqa` files (raw Roqa IR JSON) are always handled by the plugin directly — they
don't go through your frontend.

---

## The `ComponentIR` contract

The full type definitions live in [`spec/ir.md`](./ir.md). This section is a
practical summary of what your frontend must produce.

### Root structure

Every component is a `ComponentIR` object:

```ts
{
    version: 1,
    tagName: string,              // Custom element name (hyphenated, lowercase)
    name: string,                 // Export/identifier name (PascalCase)

    state: StateIR[],             // Reactive state declarations
    actions: ActionIR[],          // Named action functions
    props: PropIR[],              // Props passed from parent components
    attrs: AttrIR[],              // DOM attributes (reflected)
    emits: EmitIR[],              // Custom events the component dispatches
    lifecycle: LifecycleIR,       // onConnect / onDisconnect hooks
    render: NodeIR[],             // The view tree (root-level children)

    metadata?: ComponentMetadata  // Optional: sourceFile, frontend name, imports
}
```

**Required fields:** All top-level fields except `metadata` are required.
Empty sections use empty arrays (`[]`) or empty objects (`{}`), not absent
keys:

```json
{
  "version": 1,
  "tagName": "my-button",
  "name": "MyButton",
  "state": [],
  "actions": [],
  "props": [],
  "attrs": [],
  "emits": [],
  "lifecycle": {},
  "render": [
    {
      "kind": "element",
      "tag": "button",
      "attributes": {},
      "events": [],
      "children": []
    }
  ]
}
```

### Tag name rules

The `tagName` must be a valid custom element name:

- Contains a hyphen (`-`)
- All lowercase
- Doesn't start with a digit or hyphen
- Not a reserved name (`annotation-xml`, `color-profile`, etc.)

The backend validates this and produces a `invalid-tag-name` diagnostic on
failure.

### Version field

Always `1` (the current IR version). The backend checks this first and
rejects mismatched versions with a clear error. This ensures frontends built
against older IR formats fail fast instead of producing subtly wrong output.

---

## Producing expressions: the `ExprIR` type

The expression IR is the most important part of the Roqa IR to understand.
Expressions appear in action bodies, computed values, event handlers, attribute
bindings, class conditions, lifecycle hooks — everywhere the component performs
computation.

### Why structured expressions?

The IR is frontend-independent. Instead of embedding JavaScript strings (which
would tie the IR to JS syntax), expressions use a structured tree that any
frontend can produce:

```json
{
  "kind": "binary",
  "op": "+",
  "left": { "kind": "state-read", "name": "count" },
  "right": { "kind": "literal", "value": 1 }
}
```

This is equivalent to `count + 1` but is unambiguous, serializable, and
analyzable by the backend.

### Common expression patterns

**Read reactive state:**

```json
{ "kind": "state-read", "name": "count" }
```

**Write reactive state:**

```json
{
  "kind": "state-write",
  "name": "count",
  "value": {
    "kind": "binary",
    "op": "+",
    "left": { "kind": "state-read", "name": "count" },
    "right": { "kind": "literal", "value": 1 }
  }
}
```

**Read a prop:**

```json
{ "kind": "prop-read", "name": "label" }
```

**Read a computed value:**

```json
{ "kind": "computed-read", "name": "doubled" }
```

**Read a closure/action parameter:**

```json
{ "kind": "param-read", "name": "e" }
```

**Read a field of the current list item (inside `each` render):**

```json
{ "kind": "item-field-read", "field": "text" }
```

**Cell reference (for `show`/`each` subscription):**

```json
{ "kind": "cell-ref", "name": "visible" }
```

**Literals:**

```json
{ "kind": "literal", "value": "hello" }
{ "kind": "literal", "value": 42 }
{ "kind": "literal", "value": true }
{ "kind": "literal", "value": null }
```

**Binary operations:**

```json
{
  "kind": "binary",
  "op": "*",
  "left": { "kind": "state-read", "name": "count" },
  "right": { "kind": "literal", "value": 2 }
}
```

Supported operators: `+`, `-`, `*`, `/`, `%`, `===`, `!==`, `>`, `<`, `>=`,
`<=`, `&&`, `||`, `??`

**Unary operations:**

```json
{
  "kind": "unary",
  "op": "!",
  "operand": { "kind": "state-read", "name": "visible" }
}
```

Supported operators: `!`, `-`, `typeof`

**Conditional (ternary):**

```json
{
  "kind": "conditional",
  "test": { "kind": "state-read", "name": "isActive" },
  "consequent": { "kind": "literal", "value": "active" },
  "alternate": { "kind": "literal", "value": "inactive" }
}
```

**Member access:**

```json
{
  "kind": "member",
  "object": { "kind": "param-read", "name": "e" },
  "property": "target"
}
```

**Method call:**

```json
{
  "kind": "method-call",
  "object": { "kind": "state-read", "name": "todos" },
  "method": "filter",
  "args": [{ "kind": "closure", "params": ["t"], "body": "..." }]
}
```

**Function call:**

```json
{
  "kind": "call",
  "callee": { "kind": "external-ref", "name": "Math", "path": ["floor"] },
  "args": [{ "kind": "state-read", "name": "rawValue" }]
}
```

**Closure (lambda / callback):**

```json
{
  "kind": "closure",
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
```

**Block (sequence of expressions):**

```json
{
  "kind": "block",
  "body": [
    {
      "kind": "collection-op",
      "op": "insert",
      "name": "todos",
      "args": ["..."]
    },
    {
      "kind": "state-write",
      "name": "draft",
      "value": { "kind": "literal", "value": "" }
    }
  ]
}
```

**Object literal:**

```json
{
  "kind": "object",
  "properties": [
    {
      "kind": "property",
      "key": "id",
      "value": { "kind": "literal", "value": 1 }
    },
    {
      "kind": "spread",
      "argument": { "kind": "param-read", "name": "existing" }
    }
  ]
}
```

**Template literal (string interpolation):**

```json
{
  "kind": "template-literal",
  "parts": ["Remaining: ", { "kind": "computed-read", "name": "remaining" }]
}
```

**Collection operations:**

```json
{ "kind": "collection-op", "op": "insert", "name": "todos", "args": [{ "kind": "object", "..." }] }
{ "kind": "collection-op", "op": "update", "name": "todos", "args": ["key", { "kind": "closure", "..." }] }
{ "kind": "collection-op", "op": "remove", "name": "todos", "args": ["key"] }
{ "kind": "collection-op", "op": "clear", "name": "todos", "args": [] }
```

**Custom event emission:**

```json
{
  "kind": "emit",
  "event": "todo-added",
  "detail": { "kind": "state-read", "name": "count" }
}
```

**Imported references (from other modules):**

```json
{ "kind": "imported-ref", "source": "./utils.js", "name": "formatDate" }
```

**External references (globals/builtins):**

```json
{ "kind": "external-ref", "name": "Math", "path": ["floor"] }
{ "kind": "external-ref", "name": "console", "path": ["log"] }
{ "kind": "external-ref", "name": "parseInt" }
```

**Opaque escape hatch (use sparingly):**

```json
{
  "kind": "opaque",
  "source": "someComplexLibraryCall()",
  "reads": ["count"],
  "writes": []
}
```

The `reads` and `writes` arrays must be manually declared because the backend
cannot analyze raw source strings. Prefer structured expressions whenever
possible.

For the complete type definitions and all expression kinds, see
[`spec/ir.md` §Expression IR](./ir.md#mir-expression-ir).

---

## Producing the view tree: `NodeIR`

The `render` field is an array of `NodeIR` children. There are five node kinds:

### `ElementIR` — an HTML element

```json
{
  "kind": "element",
  "tag": "button",
  "attributes": {
    "id": { "kind": "literal", "value": "my-btn" },
    "value": { "kind": "state-read", "name": "draft" }
  },
  "events": [
    {
      "event": "click",
      "handler": { "kind": "action-call", "name": "increment", "args": [] }
    }
  ],
  "children": [{ "kind": "text", "value": "Click me" }]
}
```

**Attributes** map string keys to `ExprIR` values. Static attributes
(`LiteralExpr`) are baked into the HTML template. Dynamic attributes (any other
expression) become runtime bindings.

**Events** are an array of `{ event, handler }` pairs. The handler is an
`ExprIR` — typically `ActionCallExpr`, `ClosureExpr`, or `CallExpr`.

**Classes** — use either `attributes.class` (as a `LiteralExpr` for static
classes) or the `classes` field (for conditional classes). Never both on the
same element.

```json
{
  "kind": "element",
  "tag": "div",
  "classes": {
    "kind": "class-list",
    "items": [
      "todo",
      {
        "name": "completed",
        "condition": { "kind": "item-field-read", "field": "completed" }
      }
    ]
  },
  "attributes": {},
  "events": [],
  "children": []
}
```

**Custom elements** — when the `tag` is a custom element name (e.g.,
`"status-badge"`), attributes that are `ExprIR` nodes with non-literal values
are treated as props and set via `setProp()` before `appendChild()`.

### `TextIR` — static text

```json
{ "kind": "text", "value": "Count: " }
```

Goes directly into the HTML template string.

### `ReactiveTextIR` — dynamic text

```json
{ "kind": "reactive-text", "source": { "kind": "state-read", "name": "count" } }
```

A space placeholder `' '` is inserted into the template (creating a text
node). A binding updates `textNode.nodeValue` when the source changes.

**Adjacent text coalescing:** When `TextIR` and `ReactiveTextIR` nodes appear
as adjacent siblings with no element nodes between them, the backend coalesces
them into a **single text node**. The binding concatenates all parts:

```json
[
  { "kind": "text", "value": "Count: " },
  {
    "kind": "reactive-text",
    "source": { "kind": "state-read", "name": "count" }
  }
]
```

Becomes a single text node whose `nodeValue` is `"Count: " + count.v`.

### `ShowIR` — conditional rendering

```json
{
  "kind": "show",
  "condition": { "kind": "cell-ref", "name": "visible" },
  "render": [
    {
      "kind": "element",
      "tag": "p",
      "attributes": {},
      "events": [],
      "children": [{ "kind": "text", "value": "Now you see me!" }]
    }
  ],
  "fallback": [
    {
      "kind": "element",
      "tag": "p",
      "attributes": {},
      "events": [],
      "children": [{ "kind": "text", "value": "Hidden" }]
    }
  ]
}
```

The `condition` must be a `cell-ref` (not a `state-read`). The backend passes
the cell object directly to `showBlock()` for subscription.

The `fallback` field is optional — omit it for show-without-fallback.

### `EachIR` — list rendering

```json
{
  "kind": "each",
  "source": { "kind": "cell-ref", "name": "todos" },
  "key": "id",
  "itemAlias": "todo",
  "render": [
    {
      "kind": "element",
      "tag": "li",
      "attributes": {},
      "events": [],
      "children": [
        {
          "kind": "reactive-text",
          "source": { "kind": "item-field-read", "field": "text" }
        }
      ]
    }
  ]
}
```

The `source` must be a `cell-ref`. The `key` field names the item property
used for efficient reconciliation (or `null` for identity-based keying). The
`render` tree uses `item-field-read` expressions to access fields of the
current item.

---

## Producing state: `StateIR`

### Simple reactive value

```json
{ "kind": "value", "name": "count", "initial": 0 }
```

### Keyed collection

```json
{ "kind": "collection", "name": "todos", "key": "id", "initial": [] }
```

Use `collection-op` expressions in actions to manipulate collections (`insert`,
`remove`, `update`, `remove-where`, `move`, `clear`).

### Computed (derived) value

```json
{
  "kind": "computed",
  "name": "doubled",
  "body": {
    "kind": "binary",
    "op": "*",
    "left": { "kind": "state-read", "name": "count" },
    "right": { "kind": "literal", "value": 2 }
  }
}
```

The backend automatically derives dependencies by walking the `body`
expression tree — no manual `dependencies` array needed.

### Optimization hints (optional)

All state kinds accept an optional `hints` object:

```json
{
  "kind": "value",
  "name": "count",
  "initial": 0,
  "hints": {
    "writeOnce": false,
    "hotPath": true,
    "immutable": true,
    "escapesComponent": false
  }
}
```

Hints are strictly advisory — the backend produces correct code even if hints
are absent or wrong. A frontend that doesn't know or care about optimization
can omit them entirely. See [`spec/ir.md` §OptimizationHints](./ir.md) for
the full list.

---

## Producing actions, props, attrs, emits, lifecycle

### Actions

```json
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
```

Actions with parameters:

```json
{
  "kind": "action",
  "name": "toggleTodo",
  "params": ["id"],
  "body": {
    "kind": "collection-op",
    "op": "update",
    "name": "todos",
    "args": [
      { "kind": "param-read", "name": "id" },
      { "kind": "closure", "params": ["t"], "body": "..." }
    ]
  }
}
```

### Props

```json
{ "kind": "prop", "name": "label", "required": true }
{ "kind": "prop", "name": "value", "required": false, "default": 0 }
```

### Attrs

```json
{ "kind": "attr", "name": "variant", "default": "default", "reflect": true }
```

### Emits

```json
{ "kind": "emit-decl", "name": "todoAdded", "eventName": "todo-added" }
```

### Lifecycle

```json
{
  "onConnect": {
    "kind": "call",
    "callee": { "kind": "external-ref", "name": "console", "path": ["log"] },
    "args": [{ "kind": "literal", "value": "Connected!" }]
  }
}
```

Both `onConnect` and `onDisconnect` are optional. Use `{}` for no lifecycle
hooks.

---

## Metadata

The `metadata` field is optional but recommended:

```json
{
  "metadata": {
    "sourceFile": "src/components/Counter.tsx",
    "frontend": "jsx",
    "imports": [
      { "kind": "import", "source": "./utils.js", "bindings": ["formatDate"] }
    ]
  }
}
```

**`sourceFile`** — helps with error messages and future source map support.

**`frontend`** — identifies which frontend produced this IR (useful for
debugging and tooling).

**`imports`** — declares external module dependencies. The backend generates
`import` statements for these. Any `imported-ref` expressions in the component
must have a corresponding entry here.

---

## What the backend validates

When you pass MIR to `compile()`, the backend runs validation before any code
generation. Understanding what it checks helps you produce valid MIR from the
start.

### Errors (compilation fails)

| Code                     | What it checks                                                        |
| ------------------------ | --------------------------------------------------------------------- |
| `invalid-version`        | `version` must be `1`                                                 |
| `invalid-tag-name`       | Must be a valid custom element name (hyphenated, lowercase)           |
| `duplicate-name`         | No duplicate names within state, actions, props, attrs, or emits      |
| `dangling-cell-ref`      | Every `cell-ref` must reference a declared state entry                |
| `dangling-action-ref`    | Every `action-call` must reference a declared action                  |
| `dangling-computed-ref`  | Every `computed-read` must reference a declared computed              |
| `invalid-show-condition` | `ShowIR.condition` must be a `cell-ref` to reactive state             |
| `invalid-each-source`    | `EachIR.source` must be a `cell-ref` to a collection/value            |
| `malformed-expression`   | Expression tree must be structurally valid                            |
| `missing-key`            | Collections used in `each` should have a `key`                        |
| `unsafe-import-path`     | Import paths must not traverse outside the project                    |
| `proto-pollution`        | Member access must not target `__proto__`, `constructor`, `prototype` |
| `unsafe-opaque-pattern`  | Opaque expressions must not contain dangerous patterns                |

### Warnings (compilation continues)

| Code                 | What it checks                                                  |
| -------------------- | --------------------------------------------------------------- |
| `unreachable-action` | Action declared but never referenced in events or other actions |
| `unsubscribed-state` | State declared but never read in render, computed, or actions   |
| `opaque-expression`  | Opaque expressions limit backend optimization                   |

---

## Testing your frontend independently

You don't need the full Vite pipeline to test your frontend. Since `toIR()`
produces JSON-serializable data, you can test it in isolation.

### Strategy 1: Snapshot testing against MIR output

Write source files in your frontend's syntax and assert on the MIR output:

```js
import { test, expect } from "vitest";
import { myFrontend } from "./my-frontend.js";

test("counter component produces correct MIR", () => {
  const source = `
        // Your frontend's syntax for a counter component
    `;

  const mir = myFrontend.toIR(source, "counter.tsx");

  expect(mir).toEqual({
    version: 1,
    tagName: "counter-button",
    name: "CounterButton",
    state: [{ kind: "value", name: "count", initial: 0 }],
    // ...
  });
});
```

### Strategy 2: Round-trip through the compiler

Pass your MIR through `compile()` and verify it produces valid JavaScript:

```js
import { test, expect } from "vitest";
import { compile } from "roqa/compiler";
import { myFrontend } from "./my-frontend.js";

test("counter component compiles without errors", () => {
  const source = `...`;
  const mir = myFrontend.toIR(source, "counter.tsx");
  const result = compile(mir);

  expect(result.code).toContain('defineComponent("counter-button"');
  expect(result.code).toContain("delegate(");
});
```

### Strategy 3: Use the reference examples as targets

The `examples/ir/` directory contains 13 working applications written as raw
IR (`.roqa` files). These are excellent test targets — for each one, write
the equivalent in your frontend's syntax and verify your `toIR()` output
matches the reference MIR:

| Example            | Features covered                                   |
| ------------------ | -------------------------------------------------- |
| `static-component` | Static elements, no reactive state                 |
| `counter-button`   | State, actions, events, reactive text              |
| `derived-state`    | Computed values, transitive dependencies           |
| `show-conditional` | Conditional rendering (`ShowIR`)                   |
| `show-fallback`    | Conditional rendering with fallback                |
| `todo-list`        | Collections, `EachIR`, collection-ops, closures    |
| `child-props`      | Custom element props (cross-component)             |
| `props-attrs`      | Props, attrs, conditional classes                  |
| `multi-action`     | Multiple actions, emit, lifecycle                  |
| `multi-component`  | Multiple components in one file                    |
| `deep-nesting`     | Deeply nested element trees                        |
| `svg-circle`       | SVG elements                                       |
| `external-refs`    | Imported and external references, metadata.imports |

### Strategy 4: Use the test fixtures for end-to-end verification

The `packages/roqa/tests/fixtures/` directory contains 28 `.roqa.json` + `.expected.js` pairs
that are the ground truth for compiler output. You can verify your MIR produces
the same JavaScript as the reference:

```js
import { test, expect } from "vitest";
import { compile } from "roqa/compiler";
import { readFileSync } from "node:fs";

test("my counter MIR matches reference output", () => {
  const mir = myFrontend.toIR(counterSource, "counter.tsx");
  const result = compile(mir);

  const expected = readFileSync(
    "packages/roqa/tests/fixtures/counter-button.expected.js",
    "utf-8",
  );
  expect(result.code).toBe(expected);
});
```

---

## Common patterns: source syntax → MIR

This section shows how typical frontend constructs map to MIR, regardless of
what syntax your frontend uses.

### State declaration → `StateValueIR`

```
// Whatever your syntax is for "reactive value initialized to 0"
→ { "kind": "value", "name": "count", "initial": 0 }
```

### Derived/computed value → `StateComputedIR`

```
// Whatever your syntax is for "value derived from count"
→ { "kind": "computed", "name": "doubled", "body": { "kind": "binary", ... } }
```

### Event handler → `EventBindingIR`

```
// Whatever your syntax is for "on click, call increment"
→ { "event": "click", "handler": { "kind": "action-call", "name": "increment", "args": [] } }
```

### Conditional rendering → `ShowIR`

```
// Whatever your syntax is for "show this element when visible is true"
→ { "kind": "show", "condition": { "kind": "cell-ref", "name": "visible" }, "render": [...] }
```

Note: the condition is a `cell-ref`, not a `state-read`. The backend needs the
cell itself (not its value) for subscription.

### List rendering → `EachIR`

```
// Whatever your syntax is for "render each todo in the list"
→ { "kind": "each", "source": { "kind": "cell-ref", "name": "todos" }, "key": "id",
     "itemAlias": "todo", "render": [...] }
```

### String interpolation → `TemplateLiteralExpr` or text coalescing

Two valid approaches:

**Approach A** — single `ReactiveTextIR` with `TemplateLiteralExpr`:

```json
{
  "kind": "reactive-text",
  "source": {
    "kind": "template-literal",
    "parts": ["Count: ", { "kind": "state-read", "name": "count" }]
  }
}
```

**Approach B** — adjacent `TextIR` + `ReactiveTextIR` siblings:

```json
[
  { "kind": "text", "value": "Count: " },
  {
    "kind": "reactive-text",
    "source": { "kind": "state-read", "name": "count" }
  }
]
```

Both produce equivalent output — the backend coalesces adjacent text/reactive
text into a single text node either way. Choose whichever maps more naturally
to your frontend's syntax.

---

## Key distinctions to get right

### `cell-ref` vs `state-read`

This is the most common mistake frontend authors make.

- **`cell-ref`** means "give me the cell object itself" — used by `ShowIR`
  conditions and `EachIR` sources, because `showBlock()` and `forBlock()` need
  to subscribe to the cell.

- **`state-read`** means "give me the current value" — used in text content,
  attribute bindings, computed bodies, action expressions.

If you use `state-read` where `cell-ref` is needed, validation will reject
it with `invalid-show-condition` or `invalid-each-source`.

### `attributes.class` vs `classes` field

These are mutually exclusive on the same element:

- Use `attributes.class` with a `LiteralExpr` for all-static classes
- Use the `classes` field with `ClassListIR` for conditional classes
- Never set both — validation rejects this as ambiguous

### `ActionCallExpr` for event handlers

Named actions are referenced using `ActionCallExpr`, not a plain string:

```json
{
  "event": "click",
  "handler": { "kind": "action-call", "name": "increment", "args": [] }
}
```

For actions with arguments (e.g., inside an `each` render):

```json
{
  "event": "click",
  "handler": {
    "kind": "action-call",
    "name": "toggleTodo",
    "args": [{ "kind": "item-field-read", "field": "id" }]
  }
}
```

### Imports must be declared in metadata

If your component uses `imported-ref` expressions, the corresponding imports
must be declared in `metadata.imports`:

```json
{
  "metadata": {
    "imports": [
      { "kind": "import", "source": "./utils.js", "bindings": ["formatDate"] }
    ]
  }
}
```

---

## Reference

- [`spec/ir.md`](./ir.md) — Complete Roqa IR type definitions
- [`spec/compiler.md`](./compiler.md) — Backend compilation pipeline
- [`spec/runtime.md`](./runtime.md) — Runtime primitives the compiler targets
- [`examples/ir/`](../examples/ir/) — 13 working IR applications (reference
  targets for frontend testing)
- [`packages/roqa/tests/fixtures/`](../packages/roqa/tests/fixtures/) — 28 IR→JS test pairs (ground truth for
  compiler output)
