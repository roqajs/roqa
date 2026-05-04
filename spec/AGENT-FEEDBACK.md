# Agent Feedback — Roqa MIR & Documentation

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
- Currently when a frontend hits `return { x, y }` in a block, it has to
  fall back to `OpaqueExpr` with raw source. Otherwise the backend emits the
  inner expression as a bare statement and loses the return value.
- A `ReturnExpr { value: ExprIR }` would let the structured pipeline handle
  it cleanly.

### 🟡 9. `IfExpr` / `ForExpr` / `WhileExpr` / `TryCatchExpr` / `NewExpr`
- Currently every `if`, `for`, `while`, `try`, and `new` falls back to opaque.
- `OpaqueExpr` with real source text works, but structured forms would let the
  optimizer inline cell reads/writes that flow through these constructs.
- Lower priority than the items above — opaque is a reasonable interim.

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

- A "minimal frontend" tutorial: go from `myFrontend({ handles, toMIR })` to a
  component that compiles. Start with a static element, add a cell, add an
  event handler.
- The escape hatch contract: "When you can't model something as IR, emit
  `{ kind: 'opaque', source: '<original JS>' }`. **Always pass real source
  text, never placeholders.**" This was the single biggest source of bugs.
- A "things you will need to extract from your AST" checklist (see below).

### 📝 2. Frontend-author checklist

Add to `spec/frontend-guide.md`:

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

`spec/frontend-guide.md` should explicitly list which runtime helpers a
frontend forwards to the emitted output. During this work I learned
empirically:

- **Compiled away** (frontend should *not* re-import): `cell`, `get`, `set`,
  `For`, `Show`. These map to primitive operations / IR markers.
- **Forwarded to runtime** (frontend *should* preserve user imports): `bind`,
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

### 📝 5. New fixtures to add to `spec/fixtures/`

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
- `spec/fixtures/` as ground-truth pairs is an excellent pattern.
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
