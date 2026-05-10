# JSX Frontend – postmortem (`@roqajs/jsx`)

Postmortem feedback from implementing the JSX frontend (`@roqajs/jsx`).

The fixed items have been folded into the spec already (see commit history and
`ir.md` / `compiler.md`). This file captures **unaddressed** items — things
that bit me during implementation and would benefit future frontend authors.

---

## Status legend

- 🟢 **Fixed** — folded into the codebase + spec during this session
- 🟡 **Open** — not yet addressed; tracked here for future work
- 📝 **Docs** — documentation gap, no code change required

The 🟢 items are listed here for traceability so a future author can see what
was learned. The 🟡 / 📝 items are the actionable backlog.

---

## High-impact MIR gaps

### 🟢 1. Missing primitive expression kinds (`ArrayExpr`, `AssignExpr`, `UpdateExpr`)

- Added to `ExprIR` in `ir.md`.
- The JSX frontend was previously losing array literals and assignments into
  `OpaqueExpr` placeholders.

### 🟢 2. Component-scope locals & preamble

- Added `ComponentIR.locals` (`LocalDeclIR[]`) and `ComponentIR.preamble`
  (`ExprIR[]`).
- JSX patterns like `let renderer: THREE.WebGLRenderer` (captured by `connected`
  closures) and `this.setLoading = (v) => set(loading, v)` (exposed methods)
  now have first-class IR slots.

### 🟢 3. Module-level helper code

- Added `ComponentMetadata.moduleCode: string` for non-import, non-component
  module statements (e.g. `js-benchmark` defines const arrays of adjectives at
  module scope).

### 🟢 4. Action ordering (interleaved local decls + state writes)

- Added `InlinedSet.prelude` so frontends can preserve the original ordering
  of `const x = compute(); set(cell, x)` patterns.
- The optimizer's `inlinedSets` representation collapses state-writes into a
  separate stream from `body`, which can break source ordering. The current
  fix is a workaround.
- 🟡 **Followup:** consider redesigning `inlinedSets` to be a single ordered
  op stream rather than two parallel lists.

### 🟢 5. Default / namespace imports

- Extended `ImportIR.bindings` to `(string | { local, imported?, kind })[]`.
- `import * as THREE from "three"` now compiles correctly.

### 🟢 6. `async` actions & closures

- Added `ActionIR.async?: boolean` and `ClosureExpr.async?: boolean`.

### 🟢 7. Non-literal cell initializers

- Added `StateValueIR.initialExpr?: string` so `cell(FEEDS.top)` doesn't lose
  its initializer.
- 🟡 **Followup:** the cleaner long-term design is `initial: ExprIR` (drop
  `initial: unknown`) so all initializers go through the structured pipeline.
  Held back to avoid breaking existing IR fixtures.

### 🟡 8. `ReturnExpr`

- ✅ **Implemented.** `ReturnExpr { value?: ExprIR }` is now a first-class
  `ExprIR` kind. Frontends can emit `return { x, y }` patterns inside
  closures structurally instead of falling back to `OpaqueExpr`.

### 🟡 9. `IfExpr` / `ForExpr` / `WhileExpr` / `TryCatchExpr` / `NewExpr`

- ✅ `NewExpr { callee, args }` was added — `new Date()`, `new URL(...)`,
  etc. are now structured.
- 🟡 **Deferred:** `IfExpr`, `ForExpr`, `WhileExpr`, `TryCatchExpr` remain
  `OpaqueExpr` for now. Tracked in `spec/ROADMAP.md` under "Deferred items
  from agent feedback".

### 🟡 10. Cell-arg helper convention

- During JSX work I had to hardcode a list of runtime helpers that take a cell
  reference (not the unwrapped value) as their first argument: `bind`,
  `subscribe`, `notify`, `put`. If the user wrote `bind(myCell, fn)`, the
  frontend needed to know not to lower the first arg through `state-read`.
- Two ways to fix: **(a)** publish the canonical list in `runtime.md` so every
  frontend can match it, or **(b)** add a `cell-ref` ExprIR kind that frontends
  emit explicitly when passing a cell by reference, accepted by anything that
  needs a cell handle. (b) is more robust but more invasive.

---

## High-impact compiler invariants (now documented)

These were unspecified guarantees that I had to fix in the backend as I went.
They're now codified in `spec/compiler.md` under "Compiler invariants" but
listed here so future readers know which were latent bugs:

- 🟢 **Operator precedence preserved** in `compileExpr` (added
  `compileReceiver` + `binaryPrecedence`).
- 🟢 **Multi-line opaque source emitted verbatim** (replaced naive
  per-line `;`-append in `emit.js`).
- 🟢 **`onConnect` runs after DOM setup** (re-ordered emission so refs are
  stored before lifecycle runs).
- 🟢 **Block render bodies recurse** (added `processBlockElement` so deep
  bindings inside `<For>` / `<Show>` work).
- 🟢 **Block controller-var collisions resolved** (added `uniqueBlockVar`).
- 🟢 **Multi-root + interleaved text nodes** chain via `.nextSibling`.

---

## 🟡 Reactive text run parens

When emitting a text-node binding that concatenates `state-read` cells with
literal strings, the backend uses `parts.join(" + ")`. Frontends that produce
binary expressions inside reactive-text (`{a + b}`) need them parenthesized so
they don't accidentally string-concatenate. There's now a `compileTextRunPart`
helper in `lower.js` but it's only applied at three call sites — worth
auditing all `parts.join(" + ")` sites for consistency.

---

## Documentation feedback

### 📝 1. `spec/implementation-guide.md` is empty

That's the file a new frontend author would open first. **Highest leverage.**
Suggested contents:

- A "minimal frontend" tutorial: go from `myFrontend({ handles, toIR })` to a
  component that compiles. Start with a static element, add a cell, add an
  event handler.
- The escape hatch contract: "When you can't model something as IR, emit
  `{ kind: 'opaque', source: '<original JS>' }`. **Always pass real source
  text, never placeholders.**" This was the single biggest source of bugs.
- A "things you will need to extract from your AST" checklist (see below).

### 📝 2. Frontend-author checklist

Add to `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md`:

```
☐ module-level imports (default / named / namespace / side-effect)
☐ module-level helpers (constants, helper functions)
☐ component-scope `let` / `var` declarations
☐ top-level statements (e.g. `this.method = ...`)
☐ lifecycle hooks (`this.connected(...)`, `this.disconnected(...)`)
☐ cells (state / computed / collection)
☐ actions (incl. `async` flag)
☐ render tree (incl. multi-root fragments)
☐ events (delegated by default; element-local where needed)
☐ class lists (static + reactive parts)
☐ style bindings
```

### 📝 3. Roqa runtime API surface

`packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` should explicitly list which runtime helpers a
frontend forwards to the emitted output. During this work I learned
empirically:

- **Compiled away** (frontend should _not_ re-import): `cell`, `get`, `set`,
  `For`, `Show`. These map to primitive operations / IR markers.
- **Forwarded to runtime** (frontend _should_ preserve user imports): `bind`,
  `subscribe`, `notify`, `put`, `defineComponent`, `template`, `delegate`,
  `forBlock`, `showBlock`, `setProp`, `getProps`, `svgTemplate`,
  `handleRootEvents`.

### 📝 4. `spec/ir.md` improvements

- Add a single-page expression-kind reference table: every kind, what fields
  it has, what JS it compiles to, what IR kinds it accepts as children.
  (Currently I had to jump around the type definitions.)
- Document `cell-ref` vs `state-read` and when each is appropriate. The naming
  is subtle and there's no narrative around it.
- Add an example of multi-root render with mixed element + text nodes.

### 📝 5. New fixtures to add to `packages/roqa/tests/fixtures/`

These would let the next frontend author validate against ground truth instead
of discovering issues in real apps:

- Multi-root fragment (mixed element + text nodes between roots)
- Nested elements inside `<For>` (e.g. `<label><span>{item.text}</span></label>`)
- Multiple `<Show>` blocks reading the same cell
- `async` actions
- `let` / `var` in component scope, captured by lifecycle
- Module-level helper constants
- Number-literal receivers (`(32).toFixed(1)`)
- Subtraction-then-multiply precedence (`(a - b) * c`)
- `import * as X` and default imports

---

## What worked really well (don't lose this)

- The MIR's overall shape (state / actions / render / lifecycle) maps cleanly
  onto component frameworks. Onboarding to the IR took maybe an hour.
- The runtime API surface is small and orthogonal — easy to target.
- `packages/roqa/tests/fixtures/` as ground-truth pairs is an excellent pattern.
- Separating `validate` → `lower` → `optimize` → `emit` made debugging trivial
  — it was always obvious which phase owned a given bug.

---

## Top-3 priorities

If only three items get addressed from this list, these are the ones with the
highest leverage for future frontend authors:

1. **📝 Fill in `spec/implementation-guide.md`** with the "things to extract"
   checklist and the opaque escape-hatch contract.
2. **🟡 Add `ReturnExpr` to the IR.** Most missed structured kind in practice.
3. **📝 Add the listed fixtures** so frontends can validate before shipping.

# Loom Frontend — postmortem (`@roqajs/loom`) – Claude Opus 4.7

Postmortem feedback from implementing a brand-new whitespace-significant
DSL frontend for Roqa. Unlike the JSX postmortem above, this frontend was
designed _around_ the IR rather than mapping an existing language onto it,
which surfaces a different set of friction points.

## What went incredibly well

- **`expr.js` was easier than I expected.** Pre-substituting `@name`
  placeholders with synthetic identifiers and feeding the result to
  `@babel/parser` worked on the first try and handled every JS construct I
  needed (closures, destructuring, spread, template literals, ternaries,
  member chains, method calls, object literals). I'd recommend this trick
  in `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` — any frontend that ends up needing to parse JS
  expressions can use it without a custom parser.
- **The IR ExprIR is _genuinely_ frontend-independent.** I authored a
  syntax that looks nothing like JSX (no closing tags, single sigil, sigil-
  based reactivity resolution) and the lowering pass was still mostly a
  linear walk of the frontend's own intermediate form.
- **The hint system in `LoomError` paid for itself immediately.** Every
  diagnostic ships with line/column + a hint that points to the canonical
  workaround (`use @item.field`, `wrap in derived`, etc.). The fact that
  `compile()` emits clear backend errors means I didn't need to duplicate
  validation in the frontend.
- **`emit-decl` + `EmitExpr` separation is great.** The duality (declare at
  the top of the component, fire inside an action) maps cleanly onto how
  custom events work. The frontend just needs to validate that emitted
  events are declared.

## 🟡 Open IR feedback

### 1. `cell-ref` vs `state-read` is still a footgun

The spec is clear, but the asymmetry — "use `cell-ref` here, `state-read`
there" — pushed me to hard-restrict `if`/`each` predicates to a single
reactive name in the Loom syntax. That works, but a richer compiler could
let frontends emit a `state-read` for the predicate and lift it to a
synthetic computed during lowering (with a hint). It's mechanical work the
compiler is well-positioned to do once and save every frontend from doing
it themselves.

If that's not on the table, the alternative would be to rename `cell-ref`
to something more evocative — `subscribe-target` or `cell-handle`. The
current name suggests "a reference to a cell" which sounds equivalent to
a state-read until you read the spec carefully.

> ✅ **Partially addressed via docs.** `spec/ir.md` now has a "When to emit
> `cell-ref` vs `state-read`" subsection that lists the small set of
> cell-handle sites and recommends the JS-frontend resolution pattern.
> Auto-lift inside `ShowIR.condition` is deferred (tracked in `ROADMAP`).

### 2. `each` source is locked to a `cell-ref`

Iterating a constant array (e.g. tab labels, filter modes) requires
declaring an unused `state` cell that's never written. There are two
plausible fixes:

- Allow `EachIR.source` to be a `LiteralExpr` (constant array) — emit a
  static unrolled list at compile time.
- Allow `EachIR.source` to be any `ExprIR` and require the lowering pass
  to wrap non-cell sources in a synthetic computed.

This came up repeatedly — toolbar buttons, filter chips, unit selectors are
all common shapes that benefit from `each` but have no reactive dependency.

> ✅ **Implemented (option 2).** `EachIR.source` is now `CellRef | ExprIR`.
> Non-cell sources are auto-lifted to a synthetic computed cell during
> lowering. Frontends can pass constant arrays, prop reads, or arbitrary
> expressions directly.

### 3. Multi-root rendering when sibling roots are mixed

The spec says multi-root is fine, but mixing element + reactive-text +
element at the root level isn't covered by any fixture. I had to verify
behavior empirically by feeding samples through the compiler. Adding a
fixture (`multi-root-mixed`) would close this gap.

### 4. Conditional classes can't share an expression cleanly

`ClassListIR.items` uses `string | { name, condition }`. If a frontend has
"compute a className string from props" semantics (e.g. `class={computeCls(@x)}`),
there's no IR slot for that — you have to enumerate every possible class
as an `{ name, condition }`. A `dynamic-class` item kind whose value is an
arbitrary `ExprIR` resolving to a string would fix this.

Concretely:

```ts
type ClassItemIR =
  | string
  | { name: string; condition: ExprIR }
  | { kind: "dynamic"; value: ExprIR }; // ← new
```

> ✅ **Implemented.** `ClassItemIR` accepts the proposed
> `{ kind: "dynamic"; value: ExprIR }` variant. The compiler wraps the value
> at runtime so an empty/falsy result contributes nothing to the className.

### 5. Style bindings are missing from packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md

`StyleIR` and `StyleMapIR` are documented in `ir.md` but never appear in
`packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md`'s walkthrough or examples. I left style support out of
Loom for v0 partly because I wasn't sure how the runtime expected the
compiled output to look. A short section on `style="..."` vs
`style:property={expr}` patterns would unblock that.

### 6. `param-read` inside `each` overlaps with `item-field-read`

Both forms mean "read something local". The Loom symbol-table resolution
("is the name in `closureStack` → param-read; is it the active itemAlias →
item-field-read") works, but it took thinking. A unified `LocalReadExpr`
with a `kind` discriminator (`param`, `item`, `item-field`) might be
clearer. As is, it's easy to accidentally emit `param-read` for an item
field if you forget to track the `itemAlias` separately.

### 7. `OpaqueExpr` should publish a "preferred replacement" registry

Eliminating opaque was a goal of mine. Once I implemented closures, spread,
template literals, and method calls, opaque essentially never fired. But
new frontend authors will hit it. Linking from `OpaqueExpr` documentation
to a "before you reach for opaque, try…" cheatsheet would help.

### 8. JSON-serializable but no schema

`spec/ir.md` mentions a JSON Schema is "coming". Right now I had to verify
my output by feeding it through `compile()` and reading errors. A
JSON Schema (or even a TypeScript-from-JSDoc declaration that's exposed as
a type) would let frontends pre-flight their output.

## 📝 Documentation feedback

### 1. The "things you'll need to extract" checklist is gold

Already added in `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` (per the JSX postmortem). I used it as
a literal todo list while building Loom. Keep this prominent.

### 2. Add a "frontend authoring decisions" section

Things I had to decide that aren't covered:

- How to handle `@name` resolution when it could be multiple kinds
  (state vs prop vs computed). The spec doesn't specify a precedence; I
  picked computed > state > prop > attr for Loom but a recommended ordering
  with rationale would be useful.
- Whether to emit `metadata.frontend` (yes — it's free debugging value).
- Whether to prune unused imports from `metadata.imports` (yes — the
  backend doesn't tree-shake `import` statements based on usage).
- How to spell "reactive collection" syntactically when the surface
  language doesn't have a `cell()` constructor — Loom uses
  `state x collection by id = []`.

### 3. Examples should include a "stress-test" case

The 13 reference examples are each minimal and focused. None combines
many features. I added a `stress-test` example to my Loom examples that
covers: collection state with computed filters, conditional classes via
binary comparison, `if` nested inside `each`, bound actions with both
string-literal and item-field arguments, multi-root render, and `emit`
with payload. Recommending this pattern (or shipping a similar reference
in `examples/ir/`) would catch corner-case regressions earlier.

### 4. `examples/loom/` is now in the workspace

For traceability — added to `pnpm-workspace.yaml` so the new examples
participate in workspace tooling.

## Top-3 priorities (Loom postmortem)

1. **🟡 Allow `EachIR.source` to accept any `ExprIR`** (auto-lift to
   computed when it's not a cell-ref). Removes the most common reason
   frontends invent unused `state` cells.
2. **🟡 Add `ClassItemIR.kind: "dynamic"`** so frontends can pass
   `class={fn(@x)}` style expressions through cleanly.
3. **📝 Document `StyleIR`** in `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` with a worked example.
   It's the only IR section the guide doesn't cover.

# Reverie — postmortem (`@roqajs/reverie`) – GPT-5.5

Postmortem feedback from implementing `@roqajs/reverie`, an indentation-based
DSL frontend with JavaScript expressions normalized into MIR.

### 🟡 1. Nested block nodes need fixture coverage

Reverie naturally expresses nested control flow:

```rvr
show ready:
  ul:
    each todos as todo key id:
      li:
        {todo.text}
```

The frontend emits the expected nested `ShowIR` → `ElementIR(ul)` → `EachIR`
shape, but the current backend output rendered the `show` template and dropped
the nested `each` lowering. I moved the public sample to put `each` outside the
`show` so it stays on a compiler-supported path.

Suggested followups:

- Add fixtures for `EachIR` nested inside `ShowIR`, `ShowIR` nested inside
  `EachIR`, and block nodes nested under normal elements inside block render
  bodies.
- In `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md`, document whether nested block nodes are intended to be
  fully supported today or are still a backend TODO.

> 🟡 **Partially addressed.** Nested-block support is a meaty architectural
> change (BlockRenderBody needs its own `blocks` field, emission has to be
> recursive, anchors must live inside parent block render output). Not done
> yet. As an interim, the validator now emits an `unsupported-nested-block`
> warning so frontends fail loudly instead of silently shipping
> empty-block output. Tracked in `spec/ROADMAP.md` under "Compiler
> enhancements" → "Nested block support".

### 🟡 2. `StateCollectionIR.key` is not honored by collection mutations

`StateCollectionIR` has `key`, and `EachIR` has `key`, but `collection-op`
codegen for `remove` and `update` currently compares `t.id` directly. That
means frontend authors can emit `collection tasks key slug`, but action
semantics still assume an `id` field.

Suggested followups:

- Either thread the declared collection key into `compileCollectionOp`, or make
  the MIR contract explicit that collection mutation ops are currently
  `id`-keyed regardless of `StateCollectionIR.key`.
- Add fixtures for `collection-op:update` and `collection-op:remove` with a
  non-`id` collection key.

> ✅ **Implemented.** `compileCollectionOp` now reads
> `StateCollectionIR.key` via `ExprContext.collectionKeys` (threaded by
> `LoweringContext.ce`). `remove` and `update` use the declared key field;
> the fallback is still `id` when no key is declared. Tests in
> `tests/integration/feedback-fixes.test.js` cover both paths.

### 📝 3. Attribute names vs expression aliases

Declarative frontends often want DOM-friendly names like `user-name`, but
JavaScript expression parsing cannot treat `user-name` as an identifier. In
Reverie I used JS-friendly attr names in expressions (`username`) to avoid
inventing an alias system.

Suggested doc note: frontend authors should decide early whether hyphenated
attrs need aliases in their source language, and `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` could show
one recommended mapping (`attr user-name as userName`, `attr userName`, etc.).

### 🟡 4. `StyleMapIR` is specified but not lowered

The MIR includes `StyleMapIR`, but the backend currently templates
`StaticStyleIR` only. I kept Reverie to static `style "..."` syntax because a
dynamic style map would produce MIR that looks valid but has no runtime effect.

Suggested followups:

- Lower `StyleMapIR` into style-property bindings.
- Add a compiler fixture for static + reactive style properties.
- Until then, call out in `packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` that dynamic `StyleMapIR` is not
  a usable frontend target yet.

> ✅ **Implemented.** Literal-valued style properties fold into the template
> `style="..."` attribute; reactive properties become
> `el.style.setProperty(<kebab-prop>, <value>)` bindings (so kebab-case,
> vendor prefixes, and CSS custom properties all work). See `spec/ir.md`
> §"Style IR" for the full lowering rules and the new tests in
> `tests/integration/feedback-fixes.test.js`.

### 📝 5. Expression parser guidance would help non-JSX frontends

Reverie reused the JSX frontend's successful strategy: parse JavaScript
expressions with Babel, resolve identifiers against frontend-owned symbol
tables, and emit `OpaqueExpr` only for statements/control flow the MIR cannot
represent. This pattern is broadly useful beyond JSX.

Suggested docs addition: add a "JS-expression frontend recipe" to
`packages/create-roqa/template/.agents/skills/create-roqa-frontend/FRONTEND-GUIDE.md` covering symbol tables for state/actions/props/attrs,
`cell-ref` vs `state-read` sites, and recommended opaque fallback behavior.
