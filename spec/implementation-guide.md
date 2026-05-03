# Roqa Compiler Implementation Guide

This document provides the practical context needed to implement the new
MIR-based backend compiler. It is intended to be read alongside
[ir.md](./ir.md) (the MIR spec) and [compiler.md](./compiler.md) (the
compiler pipeline spec).

---

## Project context

### What exists today

Roqa currently has a working **JSX-based compiler** that transforms JSX source
code into optimized JavaScript. This compiler lives in
`packages/roqa/src/compiler/` and has a 4-phase pipeline:

1. Parse JSX → Babel AST
2. Validate (reject unsupported PascalCase components)
3. Generate output (template extraction, traversal, bindings, events)
4. Inline optimizations (`get()` → `.v`, `cell()` → `{ v, e: [] }`, etc.)

### What we're building

A new **MIR-based backend compiler** that accepts the canonical MIR (defined
in ir.md) and produces the same high-performance output the current compiler
generates. This replaces the existing compiler in-place.

The key difference: the new compiler doesn't parse JSX. It consumes structured
MIR data (JSON objects) and produces JavaScript. Frontends (JSX, DSLs, GUI
builders, etc.) are responsible for producing MIR — the backend doesn't care
how it was created.

### What stays the same

The **runtime** (`packages/roqa/src/runtime/`) is unchanged. The new compiler
targets the same runtime primitives:

| Runtime export | Purpose |
| --- | --- |
| `template(html)` | Create cloneable DOM template from HTML string |
| `svgTemplate(html)` | Same but for SVG content |
| `cell(v)` | Create reactive value (inlined to `{ v, e: [] }`) |
| `get(cell)` | Read cell value (inlined to `cell.v`) |
| `set(cell, v)` | Write cell + notify (inlined to block with updates) |
| `put(cell, v)` | Write cell without notify (inlined to `cell.v = v`) |
| `bind(cell, fn)` | Subscribe to cell (inlined to ref storage) |
| `notify(cell)` | Trigger all subscribers |
| `defineComponent(tag, fn, opts?)` | Register web component (creates `RoqaElement` subclass) |
| `delegate(events)` | Set up event delegation at document level |
| `forBlock(container, cell, fn)` | Efficient list rendering (LIS reconciliation) |
| `showBlock(container, cell, fn)` | Conditional rendering |
| `setProp(el, name, value)` | Set prop on custom element (WeakMap-based) |
| `getProps(el)` | Retrieve all props for an element (used internally by `defineComponent`) |

The generated output should import from `"roqa"` and use these runtime
functions (most of which get inlined during optimization).

---

## Code location

The old compiler files should be **deleted before starting**. The new
compiler is written from scratch in a clean directory:

```
packages/roqa/src/compiler/
├── index.js          # Entry point: compile(mir) → { code, map }
├── validate.js       # Phase 1: MIR validation
├── lower.js          # Phase 2: MIR → LIR lowering
├── optimize.js       # Phase 3: LIR optimization passes
├── emit.js           # Phase 4: LIR → JavaScript text
├── expr-compiler.js  # ExprIR → JS code fragment compilation
└── types.d.ts        # TypeScript type definitions for MIR and LIR
```

**Before starting implementation**, delete all existing compiler files:
- `packages/roqa/src/compiler/index.js`
- `packages/roqa/src/compiler/parser.js`
- `packages/roqa/src/compiler/codegen.js`
- `packages/roqa/src/compiler/utils.js`
- `packages/roqa/src/compiler/transforms/` (entire directory)

**Do not modify or delete anything else.** The runtime
(`packages/roqa/src/runtime/`), the Vite plugin (`packages/vite-plugin/`),
examples, tests, package.json files, and all other project files must remain
untouched. Only the compiler source files listed above are replaced.

Then create the new files from scratch. The new `index.js` export signature:

```js
// compile(mir) → { code, map }
//   where mir is ComponentIR | ComponentIR[]
```

The package.json `exports` for `"roqa/compiler"` continues to point to
`src/compiler/index.js`.

---

## Reference algorithms from the old compiler

The old JSX-based compiler contained algorithms that are directly applicable
to the new MIR-based compiler. These are documented in
[reference-algorithms.md](./reference-algorithms.md) — **use as reference
for approach, do not copy verbatim.** The inputs change (MIR trees instead
of Babel AST) but the output patterns are the same.

Key algorithms documented there:
- DOM traversal computation (firstChild/nextSibling chains)
- Transitive computed dependency expansion
- Event handler delegation patterns
- Adjacent text coalescing into single text node
- Traversal step deduplication
- Two-phase traversal for prop bindings
- SVG context tracking
- Dynamic attributes omitted from template HTML
- Cleanup tracking for forBlock/showBlock bindings
- Show block condition complexity detection
- Naming conventions and constants

---

## Implementation phases

Build the compiler incrementally. Each phase produces testable output.

### Phase 1: MIR types + validation

**Goal:** Define MIR and LIR types and implement the validation phase.

**Files:** `types.d.ts`, `validate.js`, `index.js` (skeleton)

**What to build:**
- TypeScript type definitions in `types.d.ts` for all MIR types from ir.md
  (`ComponentIR`, `StateIR`, `NodeIR`, `ExprIR`, etc.), all LIR types
  from compiler.md (`ComponentLIR`, `TemplateOp`, `TraversalOp`, etc.),
  and compiler-internal types (`Diagnostic`, `CompileError`).
  JS files import these via JSDoc:

  ```js
  /** @typedef {import("./types.d.ts").ComponentIR} ComponentIR */

  /** @param {ComponentIR} mir */
  function validate(mir) { ... }

  // Or inline:
  /** @param {import("./types.d.ts").ComponentIR} mir */
  function validate(mir) { ... }
  ```

  This gives full type checking and autocomplete in JS files without
  requiring a build step. The existing `packages/roqa/types/` directory
  already uses `.d.ts` files for the public API — this follows the same
  pattern for compiler internals.
- `validate(mir)` function that checks all validation rules from
  compiler.md Phase 1 (version check, tag name, duplicate names, dangling
  refs, etc.)
- Returns array of `Diagnostic` objects
- Skeleton `compile()` in index.js that calls `validate()` and throws on
  errors

**Test with:** `static-component.mir.json` (should pass validation),
plus intentionally invalid MIR objects (should produce correct diagnostics).

### Phase 2: Expression IR compiler

**Goal:** Compile `ExprIR` trees into JavaScript code fragments.

**Files:** `expr-compiler.js`

**What to build:**
- `compileExpr(expr, context)` function that recursively produces JS strings
- Handle all ExprIR node types (see compiler.md §Expression IR compilation
  table)
- `state-read` → `cellName.v` (already inlined form)
- `state-write` → `{ cellName.v = value; }` (updates added later by
  optimization)
- `imported-ref` → track import, emit the binding name
- `external-ref` → `Name.path` chain
- `opaque` → pass through source string

**Expression context:** The `compileExpr` function needs a context object to
handle context-dependent expression types:

```ts
type ExprContext = {
    itemAlias?: string;          // Current iteration variable name (e.g., "todo")
                                 // Set when compiling inside an EachIR render tree
    isInlineHandler?: boolean;   // true when compiling an event handler ClosureExpr body
                                 // Affects state-write compilation (no inlined updates)
    componentName?: string;      // Component function name (for error messages)
};
```

Context-dependent compilation rules:
- `item-field-read` with field `"x"` → `{itemAlias}.x` (requires `itemAlias` in context)
- `state-write` inside an inline handler → `{cellName}.v = value` (no inlined binding updates)
- `state-write` inside an action → compiled separately via `FunctionOp.inlinedSets`
- `emit` → `this.emit("eventName", detail)` (uses component `this`)

**Test with:** Unit tests that compile individual expression trees and verify
the JS output string.

### Phase 3: Lowering (MIR → LIR)

**Goal:** Transform MIR into LIR — the concrete codegen operations.

**Files:** `lower.js`

**What to build:**
- `lower(mir)` function that produces a `ComponentLIR`
- Template extraction: walk render tree, collect static HTML, insert
  placeholders for reactive content
- Traversal computation: compute `firstChild`/`nextSibling` paths to each
  dynamic node
- Cell operations from state declarations
- Function operations from actions (using expr-compiler)
- Binding operations from expression nodes in render tree
- Event operations from EventBindingIR nodes
- Block operations from ShowIR/EachIR nodes

**Key detail — adjacent reactive text:** When an element has adjacent
`TextIR` and `ReactiveTextIR` children, they share a **single text node**
(one space placeholder in the template). The binding concatenates all parts
into one `nodeValue` expression. Example: `["Count: ", <reactive count>]`
→ template `' '`, binding `text.nodeValue = "Count: " + count.v`.

**Test with:** `counter-button.mir.json`, `static-component.mir.json`.
Verify the LIR structure has correct templates, traversals, bindings.

### Phase 4: Emitter (LIR → JavaScript)

**Goal:** Serialize LIR into JavaScript text with source maps.

**Files:** `emit.js`

**What to build:**
- `emit(lirs)` function that produces `{ code, map }`
- Emit in the order specified in compiler.md §Emission order:
  1. Import statement (deduplicated)
  2. Template declarations
  3. Component definitions with connected() body
  4. Delegate call
- Connected body ordering is **required** (see compiler.md for the 6-step
  order)
- Source map generation (can use `magic-string` — it's already a dependency)

**Test with:** Full pipeline from `counter-button.mir.json` → compare output
against `counter-button.expected.js`.

### Phase 5: Optimization passes

**Goal:** Inline cells, get, set, bind for maximum performance.

**Files:** `optimize.js`

**What to build (start with just these two):**
- **Inline cells:** Set `CellOp.inlined = true` for all cells → emitter
  outputs `{ v: value, e: [] }` instead of `cell(value)`
- **Inline bindings:** Set `BindingOp.inlined = true`, populate
  `FunctionOp.inlinedSets` → emitter outputs ref storage instead of
  `bind()` calls, inlines DOM updates into set() call sites

These two passes are the critical optimizations that make Roqa fast. The
remaining passes (dead binding elimination, binding coalescing, template
merging, static hoisting) can be added later.

**Test with:** Verify `counter-button.mir.json` output matches
`counter-button.expected.js` exactly (which shows fully inlined output).

### Phase 6: Vite plugin integration

**Goal:** Wire the new compiler into the Vite plugin.

**Files:** `packages/vite-plugin/src/index.js`

**What to build:**
- Update the Vite plugin to accept a `frontend` option
- The frontend provides `handles(id)` and `toMIR(code, id)` methods
- The plugin calls `compile(mir)` with the new compiler
- For now, the JSX frontend can be the existing parse + generate pipeline
  adapted to produce MIR instead of direct output (or this can be deferred)

---

## Test infrastructure

### Framework

The project uses **Vitest** (v3.x). Tests are in `packages/roqa/tests/`.

Run tests:
```bash
cd packages/roqa
pnpm test           # Run all tests once
pnpm test:watch     # Watch mode
pnpm test:unit      # Unit tests only
pnpm test:browser   # Browser tests only (Playwright)
```

### Test organization

```
packages/roqa/tests/
├── compiler/        # Compiler unit + snapshot tests
├── integration/     # End-to-end compilation tests
└── runtime/         # Runtime primitive tests (cell, template, forBlock, etc.)
```

### Existing tests to update

The existing tests in `tests/compiler/` and `tests/integration/` test the
**old JSX-based compiler**. When replacing the compiler:

- **Delete** all tests in `tests/compiler/` — they test JSX parsing,
  template extraction from AST, etc. which no longer applies.
- **Rewrite** `tests/integration/compile.test.js` — change from JSX input
  to MIR input. The new integration tests should:
  - Read `.mir.json` fixture files
  - Pass them through `compile()`
  - Verify output against `.expected.js` files or snapshots
- **Keep** all tests in `tests/runtime/` — the runtime is unchanged.

### New test structure

```
packages/roqa/tests/
├── compiler/
│   ├── validate.test.js       # MIR validation (Phase 1)
│   ├── expr-compiler.test.js  # Expression compilation (Phase 2)
│   ├── lower.test.js          # MIR → LIR lowering (Phase 3)
│   ├── optimize.test.js       # Optimization passes (Phase 5)
│   └── emit.test.js           # LIR → JS emission (Phase 4)
├── integration/
│   └── compile.test.js        # Full pipeline: MIR → JS (uses fixtures)
└── runtime/                   # Unchanged
```

### Fixture-based testing pattern

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { compile } from "../../src/compiler/index.js";

describe("compile fixtures", () => {
    it("compiles counter-button", () => {
        const mir = JSON.parse(
            readFileSync("../../spec/fixtures/counter-button.mir.json", "utf-8")
        );
        const result = compile(mir);
        const expected = readFileSync(
            "../../spec/fixtures/counter-button.expected.js", "utf-8"
        );
        expect(result.code.trim()).toBe(expected.trim());
    });
});
```

---

## Key codegen patterns to match

The new compiler must produce output that matches the existing Roqa compiler's
patterns. These are the patterns the runtime expects.

### Template + traversal

```js
const $tmpl_1 = template('<div><span> </span><button>+</button></div>');

this.connected(() => {
    const $root_1 = $tmpl_1();
    this.appendChild($root_1);

    const div_1 = this.firstChild;
    const span_1 = div_1.firstChild;
    const span_1_text = span_1.firstChild;
    const button_1 = span_1.nextSibling;

    // ... events, blocks, bindings ...
});
```

Key rules:
- Template root is cloned via `$tmpl_N()`
- `this.appendChild($root_1)` happens immediately after cloning — this
  transfers the fragment's children into the component's DOM
- Traversal starts from `this.firstChild` (the first child now in the DOM)
- Navigate with `.firstChild` and `.nextSibling` chains
- Text nodes get a `_text` suffix: `span_1_text`

### Event delegation

```js
button_1.__click = increment;          // Simple action ref
input_1.__input = [setDraft, someArg]; // Bound action (array form)

// At end of file:
delegate(["click", "input"]);
```

### Inlined cell + binding

```js
// Cell (inlined):
const count = { v: 0, e: [] };

// Binding (inlined to ref storage):
span_1_text.nodeValue = "Count: " + count.v;
count.ref_1 = span_1_text;

// Set (inlined with DOM updates):
const increment = () => {
    count.v = count.v + 1;
    count.ref_1.nodeValue = "Count: " + count.v;
};
```

### forBlock / showBlock / setProp

See the [Runtime API reference](#runtime-api-reference) below for full
signatures, return values, and generated code patterns for `forBlock`,
`showBlock`, and `setProp`.

---

## Runtime API reference

This section documents every runtime export the compiler may generate calls
to. The runtime is **not changing** — the new MIR-based compiler must produce
code that works with these exact APIs.

Source: `packages/roqa/src/runtime/`

### `template(html)` → `() → DocumentFragment`

Creates a `<template>` element, sets its `innerHTML`, and returns a **clone
function**. Each call to the clone function returns a deep clone of the
template content as a `DocumentFragment`.

```js
const $tmpl_1 = template('<div><span> </span></div>');
// Later, inside connected():
const $root_1 = $tmpl_1();          // DocumentFragment
this.appendChild($root_1);           // Transfers children into DOM
const div_1 = this.firstChild;       // Traverse from component root
```

The clone function uses `Node.prototype.cloneNode.call(t.content, true)` for
performance. The returned fragment is consumed by `appendChild` (which empties
it), so each render must call the clone function again.

### `svgTemplate(html)` → `() → DocumentFragment`

Same as `template()` but creates elements in the SVG namespace. Uses
`document.createElementNS` with the SVG namespace to ensure proper parsing.

```js
const $svg_1 = svgTemplate('<circle cx="50" cy="50" r="40"/>');
```

The compiler uses `svgTemplate` instead of `template` when the render tree
contains SVG elements (detected during template extraction).

### `cell(value)` → `{ v, e: [] }`

Creates a reactive value container. The `v` property holds the current value,
and `e` is an array of subscriber callbacks.

```js
const count = cell(0);
// Inlined form (optimization removes the cell() call):
const count = { v: 0, e: [] };
```

For computed (derived) state, the initial value is a function:

```js
const doubled = cell(() => get(count) * 2);
// Inlined form:
const doubled = { v: () => count.v * 2, e: [] };
```

**Inlining:** The optimization pass replaces `cell(value)` with the object
literal `{ v: value, e: [] }`. The `cell` import is removed from the output.

### `get(cell)` → `cell.v`

Reads the current value of a cell.

```js
const value = get(count);
// Inlined form:
const value = count.v;
```

**Inlining:** All `get()` calls are replaced with `.v` property access. The
`get` import is removed from the output.

### `set(cell, value)`

Writes a new value to a cell and notifies all subscribers (calls each
function in `cell.e`).

```js
set(count, count.v + 1);
// Inlined form (with DOM updates from bind callbacks):
{
    count.v = count.v + 1;
    count.ref_1.nodeValue = "Count: " + count.v;
}
```

**Inlining:** The optimization pass replaces `set()` with a block that
assigns the value and then runs all inlined DOM update expressions. The
subscriber loop (`cell.e.forEach(...)`) is eliminated because the bind
callbacks are inlined directly.

### `put(cell, value)`

Writes a new value to a cell **without** notifying subscribers. Used when you
need to update state silently (e.g., preparing a batch of changes before a
single notification).

```js
put(count, 0);
// Inlined form:
count.v = 0;
```

### `bind(cell, fn)` → `() → void`

Subscribes a callback to a cell. The callback is called immediately with the
current value, then again whenever the cell changes. Returns an unsubscribe
function.

```js
const unsub = bind(count, (v) => {
    span_1_text.nodeValue = "Count: " + v;
});
```

**Inlining:** The optimization pass eliminates `bind()` calls entirely. The
initial value assignment and ref storage are emitted inline:

```js
// Instead of bind(), the optimized output is:
span_1_text.nodeValue = "Count: " + count.v;   // Initial value
count.ref_1 = span_1_text;                      // Store ref for set() updates
```

The callback body is inlined into every `set()` call site for that cell (see
`set()` above).

### `notify(cell)`

Manually triggers all subscribers of a cell. Rarely used in compiled output —
`set()` handles notification automatically. May appear when the compiler
can't inline a particular update pattern.

```js
notify(count);
// Calls: for (let i = 0; i < count.e.length; i++) count.e[i](count.v);
```

### `defineComponent(tagName, fn, options?)` → `void`

Registers a custom element. The runtime creates a class extending
`RoqaElement` (see below) and calls `customElements.define()`.

**Signature:**

```js
defineComponent(tagName, fn, options?)
```

- `tagName` — custom element tag name (must contain a hyphen)
- `fn` — component function, called with `this` bound to the element instance
  and `props` as the first argument: `fn.call(this, props)`
- `options` — optional configuration object:
  - `observedAttributes: string[]` — attribute names to observe for changes.
    Required for `this.attrChanged()` to work. Default: `[]`
  - `formAssociated: boolean` — whether the element participates in form
    submission (enables `ElementInternals`). Default: `false`

**Lifecycle:**

1. On `connectedCallback`: calls `fn.call(this, getProps(this))`, then
   invokes all callbacks registered via `this.connected(fn)`. If a connected
   callback returns a function, that function is registered as a disconnect
   cleanup.
2. On `disconnectedCallback`: calls all disconnect callbacks, then aborts
   any event listeners registered via `this.on()`.
3. On `attributeChangedCallback`: calls all callbacks registered via
   `this.attrChanged(name, fn)` for the changed attribute (only fires if
   the attribute is in `observedAttributes`).

**Generated code pattern:**

```js
// Simple component:
defineComponent("my-counter", function Counter() {
    // ... cells, actions ...
    this.connected(() => { /* ... */ });
});

// With observed attributes (for AttrIR with reflect):
defineComponent("my-switch", function Switch() {
    // ...
}, {
    observedAttributes: ["checked", "disabled"]
});
```

**Important:** `defineComponent` is idempotent — if the tag is already
registered, it returns immediately (no error).

### `RoqaElement` (base class)

All Roqa components extend `RoqaElement`, which extends `HTMLElement`. The
component function receives `this` bound to the element instance. The
following methods are available on `this`:

| Method | Signature | Purpose |
| --- | --- | --- |
| `connected(fn)` | `(fn: () => void \| (() => void)) → void` | Register callback for when component is mounted. If `fn` returns a function, it's called on unmount. |
| `disconnected(fn)` | `(fn: () => void) → void` | Register callback for when component is unmounted. |
| `on(event, handler)` | `(event: string, handler: Function) → void` | Add event listener with auto-cleanup (uses `AbortController`). Removed on disconnect. |
| `emit(event, detail?, options?)` | `(event: string, detail?: any, options?: { bubbles?, composed? }) → void` | Dispatch a `CustomEvent`. Default: `bubbles: true`, `composed: false`. |
| `toggleAttr(name, condition)` | `(name: string, condition: boolean) → void` | Set/remove a boolean attribute. `true` → `<el name>`, `false` → `<el>`. |
| `stateAttr(name, condition)` | `(name: string, condition: boolean) → void` | Set mutually exclusive state attributes. `true` → `<el name>`, `false` → `<el unname>`. |
| `attrChanged(name, callback)` | `(name: string, fn: (newVal, oldVal) → void) → void` | React to observed attribute changes. The attribute must be in `observedAttributes`. |

**Generated code using these methods:**

```js
// Lifecycle hooks (from LifecycleIR):
this.connected(() => { /* mount logic */ });
this.disconnected(() => { /* cleanup logic */ });

// Custom events (from EmitExpr):
this.emit("todo-added", { id: 1, text: "Hello" });

// Attribute observation (from AttrIR):
this.attrChanged("checked", (newValue) => {
    // Update internal state based on attribute change
});

// Event listeners with auto-cleanup (from LifecycleIR):
this.on("resize", handleResize);
```

### `delegate(events)` → `void`

Registers event types for delegation at the document level. Called once at
the end of the compiled output file, with the union of all event types used
across all components in the file.

```js
delegate(["click", "input", "change"]);
```

The delegation system attaches a single listener per event type to the
document. When an event fires, it walks the composed path looking for
elements with `__eventname` properties (e.g., `__click`). Handlers are
stored as:

- **Simple:** `element.__click = fn` → `fn.call(element, event)`
- **Array (bound args):** `element.__click = [fn, arg1]` → `fn.call(element, arg1, event)`

The array form is used for parameterized handlers in loops (avoids closure
allocation per item).

### `setProp(element, propName, value)` → `void`

Sets a prop on a custom element using a WeakMap-based mechanism. Works
before or after the element's `connectedCallback` fires.

```js
setProp(child_element_1, "label", "Hello");
```

The WeakMap approach allows props to be set before the child element is
upgraded. When the child's `connectedCallback` fires, `getProps(this)`
retrieves all props.

### `getProps(element)` → `object`

Retrieves all props for an element. Merges props from the WeakMap (set via
`setProp`) with own properties set directly on the element (excluding
standard HTMLElement properties). Direct properties take precedence.

This is called internally by `defineComponent`'s `connectedCallback` — the
component function receives the result as its first argument:

```js
function MyComponent(props) {
    // props = getProps(this), called by the runtime
    const { label, value } = props;
    // ...
}
```

The compiler generates destructured parameters for the component function
based on `PropIR` declarations:

```js
defineComponent("my-comp", function MyComp({ label, value = 0 }) {
    // label comes from getProps(this).label
    // value defaults to 0 if not provided
});
```

### `forBlock(container, sourceCell, renderFn)` → `{ update, destroy, state }`

Renders a list from a collection cell. Creates an internal text-node anchor
inside the container, performs initial rendering, subscribes to cell changes
via `bind()`, and returns a controller object.

- `container` — the parent DOM element (e.g., `<ul>`)
- `sourceCell` — a cell containing an array
- `renderFn(anchor, item, index)` — called for each item, must return
  `{ start, end }` (the DOM range for that item). May also include a
  `cleanup` function: `{ start, end, cleanup }`.

**Return value:**
- `update()` — re-reconcile the list from the current `sourceCell.v`. Must
  be called after mutating the cell's value.
- `destroy()` — remove all rendered items, unsubscribe from the cell, and
  remove the internal anchor.
- `state` — (getter) internal reconciliation state (items array, for
  debugging).

The reconciliation algorithm uses Longest Increasing Subsequence (LIS) for
efficient DOM reordering — minimizing moves when items are reordered.

**Generated code pattern:**

```js
// Variable hoisted above connected() for access in actions
let todos_forBlock;

const addTodo = () => {
    todos.v = [...todos.v, newItem];
    todos_forBlock.update();  // Re-reconcile after mutation
};

this.connected(() => {
    // ...
    todos_forBlock = forBlock(ul_1, todos, (anchor, todo, index) => {
        const li_1 = $tmpl_2().firstChild;
        // ... setup bindings, events on li_1 ...
        anchor.before(li_1);
        return { start: li_1, end: li_1 };
    });
    // ...
});
```

The variable naming convention is `{collectionName}_forBlock` (e.g.,
`todos_forBlock`). It's declared with `let` before `this.connected()` so
actions can reference it.

### `showBlock(container, condition, renderFn, deps?)` → `{ update, destroy }`

Handles conditional rendering. Takes a **container element** (the parent),
creates its own internal text-node anchor, and manages showing/hiding content.

- `container` — the parent DOM element
- `condition` — one of:
  - A cell object (has `.v` property) — subscribes automatically
  - A getter function `() => boolean` — requires `deps` for subscription
  - A static value — evaluated once
- `renderFn(anchor)` — called to create the conditional content. Must return
  `{ start, end }` (and optionally `cleanup`).
- `deps` — (optional) array of cells to subscribe to when condition is a
  getter function

**Generated code pattern:**

```js
// Simple cell condition:
showBlock(div_1, visible, (anchor) => {
    const p_1 = $tmpl_2().firstChild;
    anchor.before(p_1);
    return { start: p_1, end: p_1 };
});

// Complex expression condition (multiple dependencies):
showBlock(div_1, () => !loading.v && !error.v, (anchor) => {
    // ... render content ...
}, [loading, error]);
```

**Important:** The template for the parent element does NOT include a comment
placeholder for the show block. The `showBlock` runtime creates its own
internal anchor. The parent element just contains its static children.

---

## Dependencies

The existing compiler depends on Babel (`@babel/parser`, `@babel/traverse`,
`@babel/generator`, `@babel/types`) and `magic-string`. The new compiler:

- **Drops** all Babel dependencies — MIR is already parsed/structured data
- **Keeps** `magic-string` — useful for source map generation
- **No new dependencies needed** — the compiler is a tree walker that
  produces strings

Update `packages/roqa/package.json` to remove Babel dependencies from
`dependencies` (they'll remain in the monorepo if other packages need them).

---

## Non-goals for v1

These are explicitly out of scope for the initial implementation:

- **Incremental compilation** — whole-file compilation only (see compiler.md
  for the future spec)
- **Optimization passes beyond inlining** — dead binding elimination,
  binding coalescing, etc. come later
- **Frontend implementation** — no JSX frontend, no DSL. The compiler accepts
  MIR directly. Frontends are a separate workstream.
- **JSON Schema for MIR** — nice to have but not blocking
- **Security strict mode** — standard mode only for v1
- **SSR / server functions** — future phase
