# Roqa Roadmap

Status snapshot for the Roqa framework, organized by workstream. This file
tracks both remaining work and roadmap items that have already landed so it
stays aligned with the current repository state.

---

## Frontend adapters

Build frontends that convert authoring syntaxes into MIR (`.roqa` files or
in-memory `ComponentIR` objects). Each frontend implements the `RoqaFrontend`
interface: `handles(id)` and `toMIR(code, id)`.

### Other frontends

**Status:** Open.

- Custom DSL frontend
- GUI / visual builder frontend
- AI-assisted authoring frontend
- Other programming language frontends

### Frontend author documentation

**Status:** Implemented.

The frontend guide now exists and covers the `ComponentIR` contract,
`handles()` / `toMIR()`, Vite plugin wiring, normalization rules, and
validation expectations.

- **Spec:** [`spec/frontend-guide.md`](./frontend-guide.md)
- **Reference:** [`spec/ir.md`](./ir.md)

---

## Compiler enhancements

### Nested block support

**Status:** Open.

`ShowIR` and `EachIR` only render correctly at the top level of a component's
`render` array, or as direct children of an element at the top level. When
nested inside another block's render body (e.g. `<show>` wrapping an
`<each>`), the inner block is silently dropped from the output.

The compiler still emits an `unsupported-nested-block` warning so frontends
fail loudly instead of shipping silently broken output. A proper fix needs:

1. A `blocks: BlockOp[]` field on `BlockRenderBody`.
2. `processBlockElement` to recognize child `show` / `each` and collect them
   into the parent's `nestedBlocks`.
3. `emitBlock` to emit nested block setup inside the parent's render
   callback (anchors / controllers must be created per-mount, not once at
   `connected()` time).

### Advanced optimization passes

**Status:** Partial.

The current optimizer still consists of two core passes: inline cells and
inline bindings. Several targeted fixes have landed around block cleanup and
reactive binding correctness, but the broader passes from
`spec/compiler.md` remain open:

- **Dead binding elimination** — remove bindings for cells that are declared
  but never read in the render tree
- **Binding coalescing** — merge multiple bindings on the same cell+node into
  a single update function
- **Template merging** — merge adjacent static text nodes in templates
- **Static hoisting** — hoist non-reactive computations out of `connected()`
  to module scope

### Source maps

**Status:** Partial.

JSX MIR extraction now records component metadata such as `sourceFile` and
`frontend`, which covers part of the data plumbing needed for source maps.
The compiler still returns `map: null`, so end-to-end source map generation
has not landed yet.

Finishing this requires:

1. Frontend provides source position metadata in the MIR (via `ComponentMetadata`)
2. LIR ops carry positions from lowering
3. Emitter uses `magic-string` (already a dependency) to build the source map

Quality depends on frontend cooperation — frontends that provide rich position
data get precise maps; frontends that don't get coarser component-level maps.

### Incremental compilation

**Status:** Open.

For large applications, only recompile changed components. This still needs
MIR caching (keyed by content hash + compiler version) and MIR diffing as
outlined in `spec/compiler.md` §Incremental compilation.

### JSON Schema for MIR

**Status:** Open.

Publish a JSON Schema for `.roqa` files so frontend authors can validate
their output independently. This is still not present in the repository.

### Security strict mode

**Status:** Open.

The validator already emits security-oriented diagnostics such as
`raw-html-used`, but there is not yet a real compiler mode surface for
`strict`. A strict mode would:

- Reject `OpaqueExpr` entirely
- Validate import paths against an allowlist
- Promote security-related warnings to errors

---

## Runtime enhancements

### `subscribe()` integration

**Status:** Open.

The `subscribe()` helper is implemented and exported by the runtime, but the
compiler does not yet emit it. It's still needed for the hybrid reactive
model when cells escape component scope (passed to child custom elements,
emitted as events).

### Performance profiling

**Status:** Partial.

The repo now includes a `js-benchmark` example and the main README tracks JS
Framework Benchmark results using the JSX frontend. That said, the specific
runtime profiling work for `forBlock` reconciliation, `showBlock` toggles,
and related hotspots is still ongoing.

---

## Tooling & DX

### Editor support for `.roqa` files

**Status:** Open.

- VS Code extension: syntax highlighting, JSON validation, autocomplete
  (leveraging the JSON Schema)
- Language server: diagnostics, go-to-definition for state/action refs

### CLI tooling

**Status:** Open.

Roqa has package entrypoints for the runtime, compiler, JSX frontend, and
Vite plugin, and the project now offers `npm create roqa@latest` for app
bootstrap. It still does not ship dedicated CLI commands such as:

- `roqa compile <file.roqa>` — compile a `.roqa` file to JS from the command
  line (useful for CI, debugging, non-Vite workflows)
- `roqa validate <file.roqa>` — run validation without compilation

### Deferred items from agent feedback

**Status:** Mixed.

Most of the items from `spec/AGENT-FEEDBACK.md` are still deferred, but this
section is no longer entirely untouched.

- **`StateValueIR.initial: ExprIR`.** Still deferred. The IR still uses
  `initial: unknown` plus optional `initialExpr: string`.
- **`inlinedSets` as a single ordered op stream.** Still deferred. The
  `body` + `inlinedSets` split remains in the lowering / emitter pipeline.
- **Structured control-flow expressions.** Still partial. `NewExpr` and
  `ReturnExpr` are now implemented, but `IfExpr`, `ForExpr`, `WhileExpr`, and
  a real `TryCatchExpr` path are still future work.
- **Unify `param-read` / `item-field-read` into `LocalReadExpr`.** Implemented.
  The compiler now has `LocalReadExpr` (`kind: "local-read"`), so this no
  longer belongs in the active deferred queue.
- **Rename `cell-ref`.** Still deferred.
- **Auto-lift `state-read` predicates inside `ShowIR.condition`.** Still
  deferred. `EachIR.source` auto-lifting exists, but `ShowIR.condition` still
  requires a `cell-ref`.

---

## Documentation

### User-facing docs

**Status:** Partial.

The top-level README now covers the framework overview, JSX-based getting
started, and custom frontend entry points. The following docs are still open
or incomplete as dedicated guides:

- Getting started guide (using `.roqa` files directly)
- MIR authoring guide (hand-writing components in MIR)
- Migration guide (JSX → MIR, now that the JSX frontend exists)

### Contributor docs

**Status:** Partial.

The architecture is documented across `spec/compiler.md` and the archived
implementation guide, but the more task-oriented contributor docs are still
missing as dedicated guides:

- Compiler architecture overview (the 4-phase pipeline)
- How to add a new `ExprIR` node type
- How to add a new optimization pass
- How to add a new `NodeIR` type (e.g., `SlotIR`, `PortalIR`)
