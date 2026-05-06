# Roqa Compiler Spec

This document specifies the compilation pipeline that transforms Roqa's
canonical MIR (Mid-level IR) into high-performance JavaScript output:
`template()` clones, cells, inlined updates, `forBlock`/`showBlock`, delegated
events, and custom elements.

The compiler is the **backend** of Roqa's frontend/IR/backend architecture. It
accepts valid MIR (as defined in [ir.md](./ir.md)) and produces optimized
JavaScript. It doesn't know or care which frontend produced the MIR — JSX,
a custom DSL, a GUI web builder, or any other authoring tool.

## Compiler invariants

These are guarantees the backend makes to frontends. Frontends should be able
to rely on them without compensating in their own output.

1. **Operator precedence is preserved.** `compileExpr(IR)` produces JavaScript
   whose evaluation order matches the IR tree. A `BinaryExpr { op: "*", left:
   BinaryExpr { op: "-", ... } }` will be parenthesized correctly so the
   subtraction doesn't get reassociated under multiplication. Number-literal
   receivers (`(32).toFixed(1)`) and other "ambiguous left operand" cases are
   parenthesized when they appear in receiver position of `MemberExpr`,
   `IndexExpr`, `CallExpr`, or `MethodCallExpr`.

2. **Action body order is preserved.** Statements in a `BlockExpr` action body
   are emitted in order. Local variable declarations that precede a state
   write are emitted before the resulting inlined-set updates fire, so
   expressions like `const x = compute(); set(cell, x)` behave correctly.

3. **`onConnect` runs after DOM setup.** Lifecycle code in
   `LifecycleIR.onConnect` is emitted after the template has been mounted, all
   element traversals captured, event handlers attached, and initial bindings
   written. This means user code can safely call `this.querySelector(...)` or
   read computed bindings inside `onConnect`.

4. **Multi-line opaque source is emitted verbatim.** When an `OpaqueExpr.source`
   spans multiple lines, the backend wraps the whole expression as a single
   statement (terminating semicolon on the last non-empty line) without
   inserting `;` between every line of the source.

5. **Block render bodies recurse.** `<Show>` and `<For>` render bodies wire
   bindings, events, and class lists for elements at any depth — not just
   direct children of the block root.

6. **Block controller variables are unique within a component.** Two blocks
   reading the same cell (e.g., two `<Show when={visible}>` blocks) produce
   distinct controller variable names rather than colliding.

7. **Multi-root render with interleaved text nodes.** When `render` contains a
   mix of element and text/reactive-text nodes at the top level, the backend
   chains sibling traversals across all of them so subsequent root elements
   resolve correctly.

## Architecture context

```txt
┌─────────────────────────────────────────────────────────────────────┐
│  Any frontend                                                       │
│  (JSX, DSL, GUI builder, AI-built authoring tools, other PLs, etc.) │
│           │                                                         │
│           │  produces                                               │
│           ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  MIR (Canonical IR)                                          │   │
│  │  Defined in ir.md — the contract between frontends & backend │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           │                                                         │
│           │  consumed by                                            │
│           ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  THIS SPEC: The Roqa Backend Compiler                        │   │
│  │  MIR → LIR → Optimized JS                                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Pipeline overview

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                       BACKEND PIPELINE                               │
│                                                                      │
│  ComponentIR (MIR)                                                   │
│       │                                                              │
│       ▼                                                              │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  PHASE 1: VALIDATE                                         │      │
│  │  ──────────────────                                        │      │
│  │  Input: ComponentIR (MIR)                                  │      │
│  │  Output: ComponentIR (unchanged) or diagnostics            │      │
│  │                                                            │      │
│  │  Structural validation on the MIR:                         │      │
│  │  - Version check (MIR version matches backend expectation) │      │
│  │  - Tag name is a valid custom element name                 │      │
│  │  - No duplicate names in state/actions/props/attrs/emits   │      │
│  │  - All cell-refs and action-calls resolve to declarations  │      │
│  │  - Each source conditions reference reactive state         │      │
│  │  - Show conditions reference reactive state                │      │
│  │  - Required props have no missing defaults                 │      │
│  │  - Expression trees are well-formed                        │      │
│  └────────────────────────────────────────────────────────────┘      │
│       │                                                              │
│       ▼                                                              │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  PHASE 2: LOWER (MIR → LIR)                                │      │
│  │  ───────────────────────────                               │      │
│  │  Input: Validated ComponentIR (MIR)                        │      │
│  │  Output: ComponentLIR (Low-level IR)                       │      │
│  │                                                            │      │
│  │  Decomposes high-level constructs into codegen primitives: │      │
│  │  - View tree → TemplateOps + TraversalOps                  │      │
│  │  - Reactive reads → BindingOps                             │      │
│  │  - Events → EventOps                                       │      │
│  │  - Show/Each → BlockOps                                    │      │
│  │  - State → CellOps (already in inlined form)               │      │
│  │  - Actions → FunctionOps (expressions compiled to JS AST)  │      │
│  │  - Expression trees → JS code fragments                    │      │
│  └────────────────────────────────────────────────────────────┘      │
│       │                                                              │
│       ▼                                                              │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  PHASE 3: OPTIMIZE                                         │      │
│  │  ─────────────────                                         │      │
│  │  Input: ComponentLIR                                       │      │
│  │  Output: Optimized ComponentLIR                            │      │
│  │                                                            │      │
│  │  Optimization passes on the LIR:                           │      │
│  │  - Inline cell/get/set/bind (replaces old text rewriting)  │      │
│  │  - Dead binding elimination                                │      │
│  │  - Static hoisting                                         │      │
│  │  - Template merging                                        │      │
│  │  - Binding coalescing                                      │      │
│  └────────────────────────────────────────────────────────────┘      │
│       │                                                              │
│       ▼                                                              │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  PHASE 4: EMIT                                             │      │
│  │  ─────────────                                             │      │
│  │  Input: Optimized ComponentLIR                             │      │
│  │  Output: Final JavaScript + source map                     │      │
│  │                                                            │      │
│  │  Serialize the LIR to JavaScript text:                     │      │
│  │  - Emit template declarations                              │      │
│  │  - Emit defineComponent() wrapper                          │      │
│  │  - Emit delegate() calls                                   │      │
│  │  - Emit import statements                                  │      │
│  │  - Generate source map                                     │      │
│  └────────────────────────────────────────────────────────────┘      │
│       │                                                              │
│       ▼                                                              │
│  Final output (.js) + source map                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Why this pipeline? (plain-speak)

Think of building a house from a blueprint (the MIR):

1. **Validate** — Check the blueprint for structural soundness before
   starting. Are all the rooms connected? Do the plumbing specs reference
   real pipes? Catch errors here, not when the walls are half up.

2. **Lower** — Convert the blueprint into work orders. The blueprint says
   "a kitchen with a sink." The work order says "frame walls at coordinates
   (x,y), run pipe from main line to point (a,b), install fixture model Z."
   This is the MIR → LIR step.

3. **Optimize** — Look at all the work orders and find efficiencies. "These
   three electrical runs share a wall — combine them into one conduit."
   "This light switch only controls one fixture — wire it directly."

4. **Emit** — Hand the optimized work orders to the construction crew (the
   JavaScript runtime). This is the final code output.

The key architectural decision is that **optimization happens on structured
data (the LIR), not on text**. Previous versions of Roqa emitted intermediate
JavaScript and then rewrote it with text-based transforms (regex). This was
fragile. Now, inlining and optimization happen at the LIR level before any
JavaScript text is generated.

---

## Phase 1: Validate

Validation ensures the MIR is structurally sound before any code generation
begins. If a frontend produces invalid MIR, validation catches it with clear
error messages.

### Validation checks

| Check | Severity | Description |
| --- | --- | --- |
| `invalid-version` | error | MIR version doesn't match the backend's expected version |
| `invalid-tag-name` | error | Tag name is not a valid custom element name (must contain hyphen, be lowercase) |
| `duplicate-name` | error | Duplicate name within state, actions, props, attrs, or emits |
| `dangling-cell-ref` | error | `cell-ref` or `state-read` references a state name that doesn't exist |
| `dangling-action-ref` | error | `action-call` references an action that doesn't exist |
| `dangling-computed-ref` | error | `computed-read` references a computed that doesn't exist |
| `invalid-show-condition` | error | `ShowIR` condition is not a `cell-ref` |
| `invalid-each-source` | error | `EachIR` source is not a `cell-ref` |
| `malformed-expression` | error | Expression tree has structural errors (e.g., missing operands) |
| `missing-key` | warning | `EachIR` without a `key` — may cause inefficient reconciliation |
| `unreachable-action` | warning | Action declared but never referenced in render or lifecycle |
| `unsubscribed-state` | warning | State declared but never read in render or computed |
| `opaque-expression` | info | `OpaqueExpr` used — optimization opportunities limited |
| `unsafe-import-path` | error | `ImportedRefExpr.source` contains path traversal or disallowed scheme |
| `proto-pollution` | error | Initial state value contains `__proto__`, `constructor`, or `prototype` keys |
| `unsafe-opaque-pattern` | warning | `OpaqueExpr.source` contains suspicious patterns (`eval(`, `innerHTML`, etc.) |

### Error format

All diagnostics use a structured format:

```ts
type Diagnostic = {
    code: string;                 // e.g., "dangling-cell-ref"
    severity: "error" | "warning" | "info";
    message: string;              // Human-readable description
    component: string;            // Component tag name
    path?: string[];              // IR path to the offending node (e.g., ["render", "children", "0"])
};
```

Errors halt the pipeline. Warnings are emitted but compilation continues.

---

## Phase 2: Lower (MIR → LIR)

Lowering transforms the high-level, declarative MIR into low-level operations
that map directly to code generation. This is where the "heavy thinking"
happens — the MIR describes *what* the component looks like, the LIR describes
*how* to build it.

### LIR types

```ts
type ComponentLIR = {
    tagName: string;
    name: string;
    templates: TemplateOp[];
    cells: CellOp[];
    functions: FunctionOp[];
    connected: ConnectedBlock;
    delegatedEvents: string[];    // Event types to delegate (e.g., ["click", "input"])
    imports: string[];            // Runtime imports needed (e.g., ["template", "delegate"])
};

type ConnectedBlock = {
    traversals: TraversalOp[];
    bindings: BindingOp[];
    events: EventOp[];
    blocks: BlockOp[];
    mounts: MountOp[];
};
```

### `TemplateOp` — static HTML template

```ts
type TemplateOp = {
    kind: "template";
    id: string;                   // e.g., "$tmpl_1"
    html: string;                 // e.g., '<button id="increment-button"> </button>'
    svg: boolean;                 // Whether to use SVG template creation
};
```

Generated from the `ElementIR` / `TextIR` nodes in the MIR render tree.
Dynamic content becomes placeholder nodes:
- Reactive text → space `' '` (creates a text node)

Note: `ShowIR` and `EachIR` do **not** generate comment placeholder nodes in
the template. The `showBlock()` and `forBlock()` runtime functions create their
own internal anchor nodes inside the container element. The template only
contains the static content of the parent element.

### `TraversalOp` — DOM node reference

```ts
type TraversalOp = {
    kind: "traversal";
    varName: string;              // e.g., "button_1", "button_1_text"
    path: TraversalStep[];        // Steps from template root to this node
};

type TraversalStep =
    | { step: "firstChild" }
    | { step: "nextSibling" }
    | { step: "firstChild"; template: string };  // Clone from template first
```

Generated by walking the MIR render tree and computing
`firstChild`/`nextSibling` chains to reach every dynamic node.

### `CellOp` — reactive state cell

```ts
type CellOp = {
    kind: "cell";
    varName: string;              // e.g., "count"
    initial: string;              // JS expression for initial value: "0", "[]", "() => count.v * 2"
    inlined: boolean;             // If true, emit { v: initial, e: [] } directly
};
```

When `inlined` is true, the emitter outputs `const count = { v: 0, e: [] }`
instead of `const count = cell(0)`. This replaces the old text-based inlining
of `cell()` calls.

### `FunctionOp` — action/computed function

```ts
type FunctionOp = {
    kind: "function";
    varName: string;              // e.g., "increment"
    params: string[];             // e.g., [] or ["value"]
    body: string;                 // Compiled JS body (from expression IR compilation)
    inlinedSets: InlinedSet[];    // set() calls with their inlined DOM updates
};

type InlinedSet = {
    cellName: string;
    valueExpr: string;            // JS expression for the new value
    updates: InlinedUpdate[];     // DOM updates to inline after the set
    blockUpdates: InlinedBlockUpdate[];  // Block controller .update() calls
    notify: boolean;              // Whether to emit subscriber notification loop
                                  // (see §Hybrid reactive model)
};

type InlinedUpdate = {
    target: string;               // e.g., "count.ref_1.nodeValue"
    expression: string;           // e.g., '"Count is " + count.v'
};

type InlinedBlockUpdate = {
    blockVar: string;             // e.g., "todos_forBlock", "visible_showBlock"
    method: "update";             // Currently always "update"
};
```

The `FunctionOp.inlinedSets` entries may include block controller updates alongside DOM updates. Block updates are emitted as `blockVar.update()` calls after the DOM property updates in the inlined set block.

The `inlinedSets` are the key optimization: instead of emitting `set(count, v)`
and later rewriting it to include DOM updates, the LIR directly computes what
updates each `set` triggers. The emitter outputs the entire set + updates as a
single block.

### `BindingOp` — reactive binding

```ts
type BindingOp = {
    kind: "binding";
    cellName: string;             // Which cell to subscribe to
    refName: string;              // e.g., "count.ref_1"
    target: string;               // DOM node variable name (e.g., "button_1_text")
    property: string;             // DOM property to update (e.g., "nodeValue", "className")
    expression: string;           // JS expression for the updated value
    initialValue: string;         // JS expression for the initial value
    inlined: boolean;             // If true, emit ref storage instead of bind() call
};
```

When `inlined` is true (the common case after optimization), the emitter
outputs:
```js
// Initial value
button_1_text.nodeValue = "Count is " + count.v;
// Ref storage (bind is removed, ref used by inlined set)
count.ref_1 = button_1_text;
```

When `inlined` is false (e.g., for bindings that can't be statically resolved),
the emitter outputs a `bind()` call.

### `EventOp` — event delegation assignment

```ts
type EventOp = {
    kind: "event";
    target: string;               // DOM node variable name
    event: string;                // Event name (e.g., "click")
    handler: string;              // JS expression for the handler
    delegated: boolean;           // Whether this uses delegated events
};
```

### `BlockOp` — show/each block

```ts
type BlockOp = {
    kind: "block";
    blockType: "show" | "each";
    container: string;            // Parent DOM element variable name (e.g., "div_1")
    source: string;               // Cell variable name
    templateId?: string;          // Template used inside the block
    renderBody: ConnectedBlock;   // Nested operations for the block's content
    fallbackBody?: ConnectedBlock; // For show blocks with fallback
    key?: string;                 // For each blocks: key field name
    itemAlias?: string;           // For each blocks: iteration variable name
};
```

### `MountOp` — DOM insertion

```ts
type MountOp = {
    kind: "mount";
    target: string;               // DOM node to insert
    method: "appendChild" | "before" | "after";
    container?: string;           // Parent node (for appendChild)
    anchor?: string;              // Reference node (for before/after)
};
```

### Lowering walkthrough

Here's how the MIR for the CounterButton example (from ir.md) lowers to LIR:

**1. State lowering**

Each `StateIR` becomes a `CellOp`:

```
StateValueIR { name: "count", initial: 0 }
  → CellOp { varName: "count", initial: "0", inlined: true }

StateComputedIR { name: "doubled", body: <binary * (state-read "count") (literal 2)> }
  → CellOp { varName: "doubled", initial: "() => count.v * 2", inlined: true }
```

The computed body's expression IR is compiled to a JS string. `state-read`
nodes become `cellName.v` (already in inlined form — no intermediate `get()`
calls to rewrite later).

**2. Action lowering**

Each `ActionIR` becomes a `FunctionOp`. The expression tree is compiled to
JavaScript, and set operations are analyzed to determine what DOM updates to
inline:

```
ActionIR { name: "increment", body: <state-write "count" (binary + (state-read "count") (literal 1))> }
  → FunctionOp {
      varName: "increment",
      params: [],
      body: "", // Body is entirely the inlined set
      inlinedSets: [{
          cellName: "count",
          valueExpr: "count.v + 1",
          updates: [{
              target: "count.ref_1.nodeValue",
              expression: '"Count is " + count.v'
          }]
      }]
    }
```

**3. Render tree lowering**

The MIR render tree is walked depth-first to produce templates, traversals,
bindings, events, and mounts.

Template extraction (from the `ElementIR`):

```
ElementIR { tag: "button", attributes: { id: static("increment-button") }, children: [...] }
  → TemplateOp { id: "$tmpl_1", html: '<button id="increment-button"> </button>' }
```

The space in the template is a placeholder for the reactive text node.

Traversal computation:

```
  → TraversalOp { varName: "button_1", path: [{ step: "firstChild", template: "$tmpl_1" }] }
  → TraversalOp { varName: "button_1_text", path: [..., { step: "firstChild" }] }
```

Binding detection (from the `ReactiveTextIR` nodes):

```
  → BindingOp {
      cellName: "count",
      refName: "count.ref_1",
      target: "button_1_text",
      property: "nodeValue",
      expression: '"Count is " + count.v',
      initialValue: '"Count is " + count.v',
      inlined: true
    }
```

Event detection:

```
  → EventOp { target: "button_1", event: "click", handler: "increment", delegated: true }
```

**4. Assembly**

All the ops are assembled into a `ComponentLIR` that the optimizer and emitter
consume.

### Lowering rules

#### Reactive class bindings

When an element has a `ClassListIR` that contains any conditional (reactive)
class items, the **entire** `className` is set via a JavaScript binding — not
partially in the template. The template element has no `class` attribute; the
initial `className` value and all subsequent updates are computed as a single
concatenated expression.

For example, given `ClassListIR { items: ["content", { name: "active", condition: ... }] }`:
- Template: `<main>...</main>` (no class attribute)
- Binding: `main_1.className = "content" + (active.v ? " active" : "");`

This avoids split-brain state where some classes come from the template and
others from bindings. If all classes are static (`StaticClassIR`), they go
directly in the template's `class` attribute.

#### Inline handler event parameter

When an inline handler (`ClosureExpr`) is used as an event handler, the event
parameter is always named `e`. This is a fixed convention — the backend always
uses `e` regardless of what the frontend's original source used:

```js
// ClosureExpr { params: ["e"], body: { kind: "state-write", name: "draft", value: <member (param-read "e") "target" → "value"> } }
// Generates:
input_1.__input = (e) => {
    draft.v = e.target.value;
};
```

The `e` parameter is the DOM event object. `ParamReadExpr` with `name: "e"`
references it, and `MemberExpr` chains access event properties.

#### Inline handler vs named action state writes

Inline event handlers (`ClosureExpr` in event bindings) and named actions (`ActionIR`) compile `state-write` differently:

- **Named actions** produce `FunctionOp` with `inlinedSets` — the state write is followed by all inlined DOM binding updates and block controller updates. This is the full "set" pattern.

- **Inline handlers** produce a closure where state writes are "silent" — the handler sets `cell.v` directly without inlined binding updates. Instead, the handler relies on the existing reactive subscription (`bind()` or inlined refs) to propagate the change.

**Rationale:** Inline handlers are typically for low-level DOM→state synchronization (e.g., `input` event → set `draft.v = e.target.value`). The bindings are already set up during `connected()`, so the update propagation happens through the normal reactive path. Named actions are the primary mutation API and need explicit inlined updates for performance.

**Example comparison:**

```js
// Inline handler — no inlined updates, just the raw write
input_1.__input = (e) => {
    draft.v = e.target.value;
};

// Named action — full inlined updates
const addTodo = () => {
    todos.v = [...todos.v, newItem];
    todos_forBlock.update();
    draft.v = "";
    draft.ref_1.value = draft.v;
};
```

Note: When an inline handler writes to a cell that has `bind()` subscriptions (non-inlined bindings), the reactive system propagates the update automatically. When all bindings are inlined (the optimized case), the inline handler's write to `cell.v` does NOT trigger ref updates — this is the expected behavior for input synchronization where the DOM element already has the updated value (it's the source of the event).

#### Unused-write state cells

State cells that are declared but have no actions that write to them are
**valid**. The compiler still generates the cell declaration and any bindings
that read the cell. This supports cells that are initialized with a value and
displayed but never updated (e.g., a label or configuration value), as well
as cells that may be written to by external code or future extensions.

---

## Phase 3: Optimize

Optimization passes transform the LIR to produce smaller, faster output. Each
pass is a function `(ComponentLIR) → ComponentLIR` — they compose cleanly and
can be enabled/disabled independently.

### Pass: Inline cells

Transforms `cell(value)` into `{ v: value, e: [] }`. In the LIR, this is
represented by the `inlined: true` flag on `CellOp`. This pass analyzes which
cells can be safely inlined (most of them) and sets the flag.

**Before:** `const count = cell(0);`
**After:** `const count = { v: 0, e: [] };`

### Pass: Inline bindings

Transforms `bind(cell, callback)` into direct ref storage. The callback's
body is extracted and inlined into every `set()` call site that writes to
that cell. In the LIR, this is represented by `BindingOp.inlined = true` and
`FunctionOp.inlinedSets`.

**Before:**
```js
bind(count, (v) => { button_1_text.nodeValue = "Count is " + v; });
// ... later ...
set(count, count.v + 1);
```

**After:**
```js
count.ref_1 = button_1_text;
// ... later ...
{
    count.v = count.v + 1;
    count.ref_1.nodeValue = "Count is " + count.v;
}
```

This is the most impactful optimization — it eliminates function call overhead
for every reactive update and allows the JavaScript engine to optimize the
update path as a straight-line code block.

#### Transitive computed inlining

When a `set()` writes to a state cell that other computed cells depend on,
the inlined updates must include updates for the entire dependency chain.
The algorithm:

1. **Build the dependency graph.** When lowering computed cells, record which
   state cells each computed reads (its direct dependencies).

2. **Find transitive dependents.** When inlining a `set(cellA, value)`, find
   all computed cells that transitively depend on `cellA`. For example, if
   `doubled` depends on `count` and `quadrupled` depends on `doubled`, then
   setting `count` must update both `doubled` and `quadrupled`.

3. **Expand expressions recursively.** For each dependent computed cell's
   binding update expression, replace references to other computed cells
   with their expanded body expressions. This produces self-contained
   update expressions that reference only the root state cell.

   For example, given:
   - `doubled.v = () => count.v * 2`
   - `quadrupled.v = () => doubled.v * 2`

   The inlined updates for `set(count, ...)` become:
   ```js
   count.v = count.v + 1;
   count.ref_1.nodeValue = "Count: " + count.v;
   doubled.ref_1.nodeValue = "Doubled: " + count.v * 2;
   quadrupled.ref_1.nodeValue = "Quadrupled: " + count.v * 2 * 2;
   ```

   Note: `doubled.v` in the quadrupled expression is replaced with
   `count.v * 2` (the expanded body of `doubled`), producing `count.v * 2 * 2`.

4. **Prevent circular dependencies.** Track visited cells during expansion
   to avoid infinite loops from circular dependency chains.

#### Block controller updates in inlined actions

When a state cell is used as the `source` for a `forBlock` or `showBlock`, any action that writes to that cell must include a call to the block controller's `.update()` method in the inlined set output. This is how the runtime knows to re-reconcile a list or re-evaluate a condition after state changes.

**Naming conventions:**
- `forBlock` controllers: `{collectionName}_forBlock` (e.g., `todos_forBlock`)
- `showBlock` controllers: `{cellName}_showBlock` (e.g., `visible_showBlock`)
- Fallback block controllers: `{cellName}_fallbackBlock` (e.g., `loggedIn_fallbackBlock`)

**Declaration:** Block controller variables are declared with `let` at the component function scope (outside `this.connected()`) so that action functions can reference them. They're assigned inside `connected()` when the block is created.

**Inlining rule:** When building `FunctionOp.inlinedSets` for a `state-write` to cell `X`:
1. Include all DOM binding updates for `X` (the existing `InlinedUpdate` entries)
2. For each `BlockOp` whose `source` is `X`, append the block controller `.update()` call
3. If the `BlockOp` has a fallback, also append the fallback controller `.update()` call

**Example:**

```js
// State cell "visible" is used by a showBlock
let visible_showBlock;

const toggle = () => {
    visible.v = !visible.v;
    visible_showBlock.update();  // Block controller update (not a DOM binding update)
};

this.connected(() => {
    // ...
    visible_showBlock = showBlock(div_1, visible, (anchor) => { ... });
});
```

### Pass: Dead binding elimination

If a state cell is declared but never read in the render tree (no `BindingOp`
references it), the binding setup code is eliminated. The cell still exists
(it may be read by actions), but no DOM update code is generated.

### Pass: Static hoisting

Computations that don't depend on any reactive state are hoisted out of
`connected()` callbacks and into module scope. For example, static class
strings or pre-computed attribute values.

### Pass: Template merging

Adjacent static text nodes in a template are merged into a single string.
For example, `"Count is "` followed by `" items"` becomes `"Count is  items"`
if there's no reactive node between them.

### Pass: Binding coalescing

When multiple bindings subscribe to the same cell and update properties on
the same DOM node, they're merged into a single update function. This reduces
the number of ref slots needed and batches DOM mutations.

### Optimization pass ordering

Passes run in a fixed order to ensure each pass can rely on invariants
established by previous passes:

1. Inline cells
2. Inline bindings
3. Dead binding elimination
4. Binding coalescing
5. Template merging
6. Static hoisting

---

## Hybrid reactive model

Roqa uses a hybrid approach to reactive updates. The compiler performs two
kinds of update propagation — **compile-time inlining** (the fast path) and
**runtime notification** (the dynamic path) — and decides per-cell which
one(s) to use.

### The two paths

**Compile-time inlining (the fast path):**
When the compiler can statically determine every binding that reads a cell,
it inlines the DOM updates directly at the `set()` call site. No subscription
management, no graph walk, no function call overhead. This is the existing
optimization and remains the default for most cells.

```js
// Pure compile-time — compiler knows all readers of `count`
count.v = count.v + 1;
count.ref_1.nodeValue = "Count: " + count.v;
```

**Runtime notification (the dynamic path):**
When a cell's value may be observed by code that the compiler can't see at
build time, the compiler emits a subscriber notification loop after the
inlined updates. The cell's `e` array — which is already present on every
cell as `{ v, e: [] }` — becomes an active subscriber list.

```js
// Hybrid — inlined updates + runtime notification
count.v = count.v + 1;
count.ref_1.nodeValue = "Count: " + count.v;
for (let i = 0; i < count.e.length; i++) count.e[i](count.v);
```

When no runtime subscribers exist, the loop body never executes — the cost
is one integer comparison (`0 < 0`), which is negligible.

### When the compiler emits runtime notification

The compiler performs **escape analysis** on each cell during lowering
(Phase 2). A cell "escapes" the component's compile-time scope when:

1. **Passed as a prop to a child custom element.** The child component is
   compiled separately — the parent's compiler can't inline into it.

   ```json
   {
       "kind": "element",
       "tag": "status-bar",
       "attributes": {
           "count": { "kind": "state-read", "name": "count" }
       }
   }
   ```

   The compiler detects that `status-bar` is a custom element (contains a
   hyphen) and that `count` is passed as an attribute. The cell escapes →
   mark it for runtime notification.

2. **Used as an `EmitExpr` detail.** The cell's value is dispatched as a
   custom event — external listeners may observe it.

3. **Read inside a `forBlock` or `showBlock` callback.** Bindings created
   inside block callbacks are dynamic — they're created and destroyed as
   list items or conditions change. The compiler already handles this via
   block controller `.update()` calls, but individual item bindings within
   blocks may subscribe via `e[]` for fine-grained updates.

4. **Explicitly marked.** A frontend can set `escapesComponent: true` in the
   cell's `OptimizationHints` to force runtime notification (e.g., for cells
   that are read by external code the frontend knows about but the MIR
   doesn't capture).

If none of these conditions apply, the cell uses pure inlined updates with
no subscriber loop.

### How this affects the LIR

The `InlinedSet` type has a `notify` field. When `true`, the emitter appends
the subscriber notification loop after the inlined DOM updates:

```ts
// InlinedSet with notify: true
{
    cellName: "count",
    valueExpr: "count.v + 1",
    updates: [
        { target: "count.ref_1.nodeValue", expression: '"Count: " + count.v' }
    ],
    blockUpdates: [],
    notify: true   // ← emit subscriber loop
}
```

**Emitted output:**
```js
{
    count.v = count.v + 1;
    count.ref_1.nodeValue = "Count: " + count.v;
    for (let i = 0; i < count.e.length; i++) count.e[i](count.v);
}
```

### How child components subscribe

When a child component receives a cell via props, it subscribes at
`connected()` time and unsubscribes at `disconnected()` time:

```js
defineComponent("status-bar", function StatusBar() {
    this.connected(() => {
        const $root = $tmpl_2();
        this.appendChild($root);
        const span_1 = this.firstChild;

        // Cell received at runtime via props
        const countCell = getProps(this).count;

        // Initial render
        span_1.nodeValue = "Items: " + countCell.v;

        // Runtime subscription — pushed onto the cell's e[] array
        const update = (v) => { span_1.nodeValue = "Items: " + v; };
        countCell.e.push(update);

        // Cleanup on disconnect
        this.disconnected(() => {
            const idx = countCell.e.indexOf(update);
            if (idx !== -1) countCell.e.splice(idx, 1);
        });
    });
});
```

### Runtime helper: `subscribe()`

To avoid boilerplate in generated code, the runtime provides a `subscribe`
helper that handles registration and returns a cleanup function:

```js
// Runtime API
function subscribe(cell, callback) {
    cell.e.push(callback);
    return () => {
        const idx = cell.e.indexOf(callback);
        if (idx !== -1) cell.e.splice(idx, 1);
    };
}
```

The compiler emits `subscribe()` calls for runtime bindings and stores the
cleanup function for `disconnected()`:

```js
const unsub = subscribe(countCell, (v) => {
    span_1.nodeValue = "Items: " + v;
});
this.disconnected(() => unsub());
```

### Interaction with existing block controllers

`forBlock` and `showBlock` already implement a form of runtime reactivity —
they subscribe to a cell and re-render when it changes. Level 1 generalizes
this pattern but doesn't replace it. Block controllers continue to use their
own update mechanism (`.update()` calls in inlined sets).

The distinction:
- **Block controllers** handle structural changes (add/remove DOM nodes)
- **Runtime subscribers** handle value updates (change text, attributes, etc.)

A cell can have both: a `forBlock` controller that re-reconciles the list
AND runtime subscribers on individual item bindings within the block.

### Performance characteristics

| Scenario | Compile-time inlining | Runtime notification |
| --- | --- | --- |
| Local state, static bindings | ✅ Full | ❌ Not emitted |
| State passed to child elements | ✅ Local bindings | ✅ For child bindings |
| State used in `forBlock`/`showBlock` | ✅ Local bindings | Via block `.update()` |
| State emitted as event detail | ✅ Local bindings | ✅ For external observers |
| No subscribers on `e[]` | — | Zero-cost (empty loop) |

The compile-time path is always preferred. Runtime notification is additive —
it never replaces inlined updates, only supplements them for bindings the
compiler can't see.

---

## Phase 4: Emit

The emitter serializes the optimized LIR into JavaScript text. This is a
straightforward traversal — by this point, all the hard decisions have been
made by the lowering and optimization phases.

### Emission order

1. **Import statement** — `import { defineComponent, delegate, template } from "roqa";`
   (imports are derived from `ComponentLIR.imports`)

2. **Template declarations** — top-level, outside the component:
   ```js
   const $tmpl_1 = template('<button id="increment-button"> </button>');
   ```

3. **Component definition** — `defineComponent("tag-name", function Name() { ... })`:
   - Cell declarations (from `CellOp` array)
   - Function declarations (from `FunctionOp` array)
   - `this.connected(() => { ... })` block containing (in this exact order):
     1. Template instantiation and mount — clones the template via
        `$tmpl_N()` and immediately appends to the component with
        `this.appendChild($root_1)`. Must happen first because traversal
        starts from `this.firstChild`.
     2. DOM traversal — `firstChild`/`nextSibling` chains starting from
        `this.firstChild` to obtain references to dynamic nodes.
     3. Event assignments — `element.__click = handler` delegated event setup.
        Must happen after traversal (needs node references).
     4. For blocks — `forBlock()` calls. Must happen after traversal (needs
        container references).
     5. Show blocks — `showBlock()` calls. Must happen after traversal (needs
        container references).
     6. Initial values + ref storage — sets initial `nodeValue`,
        `className`, attribute values, and stores `cell.ref_N = element`
        references. Must be last because bindings reference traversal
        variables and must follow block setup.

   **Exception:** When a component renders custom child elements with props,
   `setProp()` calls must happen **before** `appendChild`. Prop target
   elements are traversed from the detached fragment root (`$root_1.firstChild`)
   before mount, then remaining traversal proceeds from `this.firstChild`
   after mount. See §Prop passing to custom elements.

   **This ordering is required, not conventional.** Reordering steps will
   cause runtime errors (e.g., traversing before mount, or binding before
   traversal).

4. **Delegate call** — `delegate(["click", "input", ...])` at file end

### Import deduplication

When emitting import statements, the emitter must deduplicate:

- **Runtime imports** — collect the union of all runtime imports needed across
  all components in the file (`template`, `defineComponent`, `delegate`,
  `forBlock`, `showBlock`, `svgTemplate`, `setProp`, `subscribe`, etc.) and
  emit a single import statement. `subscribe` is only included when at least
  one cell uses runtime notification.

- **`ImportedRefExpr` imports** — if multiple actions or computed values
  reference the same imported module (e.g., `import { formatDate } from
  "./utils"`), emit one import statement with all bindings merged.

- **`delegate()` calls** — collect the union of all delegated event types
  across all components and emit a single `delegate()` call at the end of
  the file.

### Expression IR compilation

During lowering (Phase 2), expression IR nodes are compiled to JavaScript code
fragments. The compilation is recursive — each `ExprIR` node produces a JS
string:

| ExprIR node | Compiled JS |
| --- | --- |
| `{ kind: "literal", value: 42 }` | `42` |
| `{ kind: "literal", value: "hello" }` | `"hello"` |
| `{ kind: "template-literal", parts: [...] }` | Binary `+` concatenation (see below) |
| `{ kind: "object", properties: [...] }` | `{ key: value, ...spread }` |
| `{ kind: "state-read", name: "count" }` | `count.v` (inlined form) |
| `{ kind: "state-write", name: "count", value: ... }` | `{ count.v = ...; /* inlined updates */ }` |
| `{ kind: "param-read", name: "id" }` | `id` (references action/closure parameter) |
| `{ kind: "binary", op: "+", left: ..., right: ... }` | `left + right` |
| `{ kind: "unary", op: "!", operand: ... }` | `!operand` |
| `{ kind: "conditional", test: ..., ... }` | `test ? consequent : alternate` |
| `{ kind: "member", object: ..., property: "x" }` | `object.x` |
| `{ kind: "index", object: ..., index: ... }` | `object[index]` |
| `{ kind: "spread", argument: ... }` | `...argument` |
| `{ kind: "call", callee: ..., args: [...] }` | `callee(args)` |
| `{ kind: "method-call", object: ..., method: "m", ... }` | `object.m(args)` |
| `{ kind: "block", body: [...] }` | `{ stmt1; stmt2; ... }` |
| `{ kind: "closure", params: [...], body: ... }` | `(params) => body` (destructuring preserved) |
| `{ kind: "collection-op", op: "insert", ... }` | Collection-specific code |
| `{ kind: "emit", event: "x", detail: ... }` | `this.emit("x", detail)` |
| `{ kind: "action-call", name: "x", args: [...] }` | `x(args)` |
| `{ kind: "prop-read", name: "x" }` | `x` (destructured parameter from component function) |
| `{ kind: "attr-read", name: "x" }` | `this.getAttribute("x")` |
| `{ kind: "computed-read", name: "x" }` | `x.v` (inlined form) |
| `{ kind: "item-field-read", field: "x" }` | `item.x` (in forBlock context) |
| `{ kind: "imported-ref", source: "...", name: "x" }` | `x` (import added to module head) |
| `{ kind: "external-ref", name: "Math", path: ["floor"] }` | `Math.floor` |
| `{ kind: "opaque", source: "..." }` | Source string passed through |

**Template literal lowering:** `TemplateLiteralExpr` is lowered to binary `+`
concatenation during expression compilation. Benchmarking shows concatenation
is consistently faster than template literals in hot update paths. For example:

```
// MIR: { kind: "template-literal", parts: ["Hello ", <state-read "name">, "!"] }
// Compiled: "Hello " + name.v + "!"
```

The `TemplateLiteralExpr` exists in the MIR for semantic clarity — frontends
express interpolation naturally, and the backend chooses the fastest output
form.

Note how `state-read` compiles directly to `count.v` (the inlined form) rather
than `get(count)`. This is the key benefit of doing inlining at the LIR level
— the intermediate `get()` / `set()` / `cell()` / `bind()` calls never exist
in the output. There's no text-rewriting step.

### Collection operation compilation

Collection operations (`CollectionOpExpr`) are **compile-time sugar** for
common array mutations. They compile to immutable array operations that
replace the cell's value, followed by a `forBlock.update()` call to trigger
list re-reconciliation.

Collection operations are distinct from `forBlock` — they are complementary:
- `collection-op` = **write** operations on the collection data (used in
  action bodies)
- `forBlock` = **rendering** the collection as DOM elements (used in the
  render tree)

The `forBlock.update()` call is the notification mechanism — it tells the
list renderer to re-diff the array and reconcile the DOM. Any action that
mutates a collection cell must call `update()` after setting the new value.

| Operation | Compiled output |
| --- | --- |
| `insert(item)` | `{ todos.v = [...todos.v, item]; todos_forBlock.update(); }` |
| `remove(id)` | `{ todos.v = todos.v.filter(t => t.id !== id); todos_forBlock.update(); }` |
| `update(id, fn)` | `{ todos.v = todos.v.map(t => t.id === id ? fn(t) : t); todos_forBlock.update(); }` |
| `remove-where(fn)` | `{ todos.v = todos.v.filter(t => !fn(t)); todos_forBlock.update(); }` |
| `move(from, to)` | Array splice operations + `todos_forBlock.update()` |
| `clear()` | `{ todos.v = []; todos_forBlock.update(); }` |

If the collection cell also has non-forBlock bindings (e.g., a count display),
those inlined binding updates are also appended after the `forBlock.update()`
call — same as any other inlined set.

### Full output example

For the CounterButton MIR example from ir.md, the final emitted output:

```js
import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template('<button id="increment-button"> </button>');

defineComponent("counter-button", function CounterButton() {
    const count = { v: 0, e: [] };
    const doubled = { v: () => count.v * 2, e: [] };

    this.connected(() => {
        const $root_1 = $tmpl_1();
        this.appendChild($root_1);

        const button_1 = this.firstChild;
        const button_1_text = button_1.firstChild;

        button_1.__click = () => {
            count.v = count.v + 1;
            count.ref_1.nodeValue = "Count is " + count.v;
        };

        button_1_text.nodeValue = "Count is " + count.v + " / doubled is " + count.v * 2;
        count.ref_1 = button_1_text;
    });
});

delegate(["click"]);
```

Note: no `cell()`, `get()`, `set()`, or `bind()` calls appear — everything is
in its final inlined form because optimization happened at the LIR level.

---

## Vite plugin integration

The Vite plugin orchestrates the pipeline. It handles two modes:

1. **`.roqa` files** — compiled directly (no frontend needed). The plugin reads
   the JSON MIR from the `.roqa` file and passes it to `compile()`.
2. **Frontend-delegated files** — a `frontend` option provides `handles(id)` and
   `toMIR(code, id)` methods for custom source formats (JSX, DSL, etc.).

```ts
// packages/vite-plugin/src/index.js
export default function roqaPlugin(options) {
    const frontend = options?.frontend;

    return {
        name: "roqa",
        enforce: "pre",

        // Resolve .roqa imports
        resolveId(source, importer) {
            if (source.endsWith(".roqa") && importer) {
                return resolve(dirname(importer), source);
            }
        },

        // Load .roqa files — reads JSON, compiles to JS
        load(id) {
            if (id.endsWith(".roqa")) {
                const mir = JSON.parse(readFileSync(id, "utf-8"));
                return compile(mir);
            }
        },

        // Transform hook — handles frontend-delegated files and
        // .roqa files in dev server mode
        async transform(code, id) {
            if (id.endsWith(".roqa")) {
                const mir = JSON.parse(code);
                return compile(mir);
            }
            if (frontend?.handles(id)) {
                const mir = frontend.toMIR(code, id);
                return compile(mir);
            }
        },
    };
}
```

Usage with `.roqa` files (no frontend):
```js
// vite.config.js
import roqa from "@roqajs/vite-plugin";
export default defineConfig({ plugins: [roqa()] });

// main.js
import "./counter-button.roqa";
```

Usage with a custom frontend:
```js
// vite.config.js
import roqa from "@roqajs/vite-plugin";
import jsxFrontend from "@roqajs/jsx-frontend";
export default defineConfig({ plugins: [roqa({ frontend: jsxFrontend() })] });
```

The `compile()` entry point runs the backend pipeline:

```ts
export function compile(mir: ComponentIR | ComponentIR[]) {
    const components = Array.isArray(mir) ? mir : [mir];

    // Phase 1: Validate
    const diagnostics = components.flatMap(c => validate(c));
    if (diagnostics.some(d => d.severity === "error")) {
        throw new CompileError(diagnostics);
    }

    // Phase 2: Lower (MIR → LIR)
    const lirs = components.map(c => lower(c));

    // Phase 3: Optimize
    const optimized = lirs.map(l => optimize(l));

    // Phase 4: Emit
    return emit(optimized);
}
```

Note: the Vite plugin doesn't know or care which frontend produced the MIR. The
`frontend` object is pluggable — a JSX frontend, a DSL frontend, or any tool
that produces valid MIR. For `.roqa` files, no frontend is needed at all.

---

## Source map strategy

Source maps must trace from the final JavaScript output back to the original
source file (whichever frontend syntax that was). The challenge is that the
pipeline has multiple transformation steps:

```txt
Original source → (frontend) → MIR → (lower) → LIR → (emit) → JS output
```

### Approach

1. **Frontend responsibility**: The frontend includes source position metadata
   in the MIR (via the optional `metadata.sourceFile` field and optional source
   position annotations on expression nodes).

2. **LIR carries positions**: During lowering, source positions from the MIR
   are preserved on LIR ops. For example, a `FunctionOp` carries the source
   position of the original action declaration.

3. **Emitter generates source map**: The emitter maps each generated JS line/
   column to the source position from the LIR op that produced it.

4. **Expression positions**: `OpaqueExpr` nodes carry their source text, which
   the emitter can map character-by-character. Structured expression nodes
   carry optional position metadata that the frontend can provide.

This approach means that frontends that provide rich source positions get
precise source maps, while frontends that don't (e.g., a JSON-based frontend)
get coarser mappings (component-level rather than expression-level).

---

## Error handling and diagnostics

### Validation errors (Phase 1)

Caught before any code generation. These always indicate that the frontend
produced invalid MIR.

```ts
// Example diagnostic:
{
    code: "dangling-cell-ref",
    severity: "error",
    message: "Cell ref 'counter' does not match any declared state. Did you mean 'count'?",
    component: "counter-button",
    path: ["render", "children", "1", "source"]
}
```

Best-effort suggestions (like "did you mean?") are provided when possible.

### Lowering errors (Phase 2)

These are internal compiler errors — they should not occur with valid MIR. If
they do, they indicate a bug in the compiler's lowering logic. They include:
- The MIR node that caused the error
- The lowering phase that failed
- A stack trace for debugging

### Optimization errors (Phase 3)

Also internal errors. Optimization passes must be correctness-preserving — if
an optimization can't be safely applied, it's skipped (not errored).

### Warning configuration

Warnings can be configured through the Vite plugin options:

```ts
roqaPlugin({
    frontend: jsxFrontend(),
    warnings: {
        "unreachable-action": "off",     // Suppress this warning
        "missing-key": "error",          // Promote to error
    },
    security: "standard",               // or "strict" (see below)
})
```

### Security modes

The backend supports two security modes (see ir.md §Security considerations
for the full threat model):

- **`standard`** (default) — security checks are warnings. `OpaqueExpr` is
  allowed with diagnostics.
- **`strict`** — all security-related warnings become errors. `OpaqueExpr`
  is rejected. Import paths are validated against an allowlist. Recommended
  for CI/production builds where the IR source may not be fully trusted.

---

## Open questions

### Collection mutation strategy

**Resolved:** Collection operations (`insert`, `remove`, etc.) compile to
immutable array operations (create new array, assign to cell value). After the
mutation, the compiled code calls `forBlock.update()` to trigger list
re-reconciliation. This aligns with how `forBlock`'s LIS-based reconciliation
works — it diffs the full array by reference equality.

For v1, this is the only supported strategy. Runtime collection helpers that
mutate in place and provide reconciliation hints may be added later as an
optimization when profiling shows large-list performance issues.

### Nested item field access

Inside `EachIR` render trees, `item-field-read` supports one level of property
access (`todo.completed`). Deeper nesting (`todo.address.city`) would require
chained `MemberExpr` nodes in the expression IR. This should work but needs
testing with the binding system — does a binding on `todo.address.city` need to
subscribe to the whole item or just the `address` sub-object?

Initial implementation: support one level. Add deeper nesting when a concrete
use case emerges.

### Multi-component file handling

When a file exports multiple components, each produces its own `ComponentIR`.
The backend processes them independently, but the emitter needs to:
- Deduplicate imports
- Ensure template variable names don't collide
- Emit a single `delegate()` call with the union of all event types

This is straightforward but needs explicit handling in the emitter.

### Incremental compilation (future phase)

> **Implementation note:** Incremental compilation is a later phase of
> implementation. The initial backend will use whole-file compilation. This
> section is a rough draft specification to inform IR design decisions now,
> so we don't paint ourselves into a corner.

#### Motivation

For large applications with hundreds of components, whole-file compilation
becomes a bottleneck during development. HMR (Hot Module Replacement) already
helps at the file level (only recompile changed files), but within a file
containing multiple components, all components are re-compiled even if only
one changed.

More importantly, incremental compilation enables:
- **Faster CI builds** — skip re-compiling unchanged components
- **Distributed compilation** — compile different components on different
  machines
- **Cached builds** — persist compiled output across builds

#### Architecture

```txt
┌─────────────────────────────────────────────────────────────────┐
│  INCREMENTAL COMPILATION PIPELINE                               │
│                                                                 │
│  Source files                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Frontend (produces MIR per component)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MIR Cache                                               │   │
│  │  ──────────                                              │   │
│  │  Key: component tag name + source hash                   │   │
│  │  Value: ComponentIR (JSON)                               │   │
│  │                                                          │   │
│  │  On cache hit: diff cached MIR vs new MIR                │   │
│  │  - If identical: skip compilation, reuse cached output   │   │
│  │  - If different: re-compile, update cache                │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Backend (Validate → Lower → Optimize → Emit)           │   │
│  │  Only runs for changed components                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Output Cache                                            │   │
│  │  ─────────────                                           │   │
│  │  Key: MIR content hash                                   │   │
│  │  Value: compiled JS output + source map                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### Cache key design

The cache key must capture everything that affects the output. Two components
with the same MIR should produce the same output. The key is:

```ts
type CacheKey = {
    mirHash: string;              // SHA-256 of the serialized ComponentIR
    backendVersion: string;       // Compiler version (output changes across versions)
    optimizationLevel: string;    // Different optimization settings = different output
};
```

#### MIR diffing

When a component's source changes, the frontend produces new MIR. Before
re-compiling, the backend diffs the new MIR against the cached MIR:

- **Structural diff** — compare the JSON trees. If only metadata changed
  (source positions, frontend hints), skip re-compilation.
- **Dependency tracking** — if a computed's expression references another
  state cell, and that cell's definition changed, the computed needs
  re-compilation even if its own MIR didn't change.

#### Cross-component dependencies

Most components compile independently — they don't reference each other's
internals. But some scenarios create cross-component dependencies:

- **Shared state** (future) — if global state cells are introduced
- **Type checking** — a parent's props must match a child's prop declarations

For v1, components are compiled independently. Cross-component concerns are
handled at a higher level (by the frontend or by runtime validation).

#### Cache invalidation

The cache must be invalidated when:
- The Roqa backend version changes (different codegen)
- Optimization configuration changes
- The MIR version changes (new IR format)

Cache storage: filesystem (`.roqa-cache/` directory) for local development,
content-addressable store for CI.

#### Interaction with HMR

Vite's HMR already provides file-level granularity. Incremental compilation
adds component-level granularity within files. The Vite plugin reports which
components actually changed, and Vite's HMR propagates only those updates.

```ts
// Vite plugin with incremental support
async transform(code, id) {
    const newMirs = frontend.toMIR(code, id);
    const results = [];

    for (const mir of newMirs) {
        const cached = cache.get(mir);
        if (cached) {
            results.push(cached);
        } else {
            const compiled = compileOne(mir);
            cache.set(mir, compiled);
            results.push(compiled);
        }
    }

    return mergeOutputs(results);
}
```