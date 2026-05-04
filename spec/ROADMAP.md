# Roqa Roadmap

Future work items for the Roqa framework, organized by workstream. The
MIR-based backend compiler is complete — these are the next chapters.

---

## Frontend adapters

Build frontends that convert authoring syntaxes into MIR (`.roqa` files or
in-memory `ComponentIR` objects). Each frontend implements the `RoqaFrontend`
interface: `handles(id)` and `toMIR(code, id)`.

### JSX frontend (highest priority)

Adapt the original JSX-based compiler pipeline to produce MIR instead of
direct JavaScript output. This restores the `roqa()` Vite plugin for `.jsx`
/ `.tsx` files.

- **Input:** JSX source code (the syntax existing examples use)
- **Output:** `ComponentIR` (passed to the backend compiler)
- **Scope:** Parse JSX → Babel AST → walk AST → produce MIR. The existing
  `spec/archive/reference-algorithms.md` documents the old compiler's patterns for
  template extraction, traversal, bindings, etc. — these inform the JSX→MIR
  translation.
- **Key design question:** Should the JSX frontend produce `.roqa` files on
  disk (for caching / inspection) or pass MIR objects in-memory only? The
  in-memory path is simpler for v1.
- **Spec:** [`spec/jsx-frontend.md`](./jsx-frontend.md) — translation rules,
  package structure, reference translations
- **Package:** `packages/roqa-jsx/` (`@roqajs/jsx`)

### Other frontends (future)

- Custom DSL frontend
- GUI / visual builder frontend
- AI-assisted authoring frontend
- Other programming language frontends

### Frontend author documentation

Create a guide for building custom frontends:

- The `ComponentIR` contract (what fields are required, normalization rules)
- How to implement `handles()` and `toMIR()`
- How to wire into the Vite plugin via the `frontend` option
- Common patterns: mapping source syntax to MIR nodes
- Validation: what the backend checks and how to test frontends independently
- Reference: the `spec/ir.md` type definitions
- **Spec:** [`spec/frontend-guide.md`](./frontend-guide.md)

---

## Compiler enhancements

### Advanced optimization passes

The current compiler implements two optimization passes (inline cells, inline
bindings). The remaining passes from `spec/compiler.md`:

- **Dead binding elimination** — remove bindings for cells that are declared
  but never read in the render tree
- **Binding coalescing** — merge multiple bindings on the same cell+node into
  a single update function
- **Template merging** — merge adjacent static text nodes in templates
- **Static hoisting** — hoist non-reactive computations out of `connected()`
  to module scope

### Source maps

The compiler currently returns `map: null`. Implementing source maps requires:

1. Frontend provides source position metadata in the MIR (via `ComponentMetadata`)
2. LIR ops carry positions from lowering
3. Emitter uses `magic-string` (already a dependency) to build the source map

Quality depends on frontend cooperation — frontends that provide rich position
data get precise maps; frontends that don't get coarser component-level maps.

### Incremental compilation

For large applications, only recompile changed components. Requires MIR
caching (keyed by content hash + compiler version) and MIR diffing. Outlined
in `spec/compiler.md` §Incremental compilation.

### JSON Schema for MIR

Publish a JSON Schema for `.roqa` files so frontend authors can validate
their output independently. Enables editor autocomplete and linting for
hand-authored `.roqa` files.

### Security strict mode

The compiler supports `standard` mode (default). A `strict` mode would:
- Reject `OpaqueExpr` entirely
- Validate import paths against an allowlist
- Promote security-related warnings to errors

---

## Runtime enhancements

### `subscribe()` integration

The `subscribe()` helper is implemented in the runtime but not yet used by
the compiler output. It's needed for the hybrid reactive model when cells
escape component scope (passed to child custom elements, emitted as events).

### Performance profiling

Profile the runtime with large-list benchmarks (`forBlock` reconciliation,
`showBlock` toggles) to identify optimization opportunities.

---

## Tooling & DX

### Editor support for `.roqa` files

- VS Code extension: syntax highlighting, JSON validation, autocomplete
  (leveraging the JSON Schema)
- Language server: diagnostics, go-to-definition for state/action refs

### CLI tooling

- `roqa compile <file.roqa>` — compile a `.roqa` file to JS from the command
  line (useful for CI, debugging, non-Vite workflows)
- `roqa validate <file.roqa>` — run validation without compilation

---

## Documentation

### User-facing docs

- Getting started guide (using `.roqa` files directly)
- MIR authoring guide (hand-writing components in MIR)
- Migration guide (JSX → MIR, once the JSX frontend is ready)

### Contributor docs

- Compiler architecture overview (the 4-phase pipeline)
- How to add a new `ExprIR` node type
- How to add a new optimization pass
- How to add a new `NodeIR` type (e.g., `SlotIR`, `PortalIR`)
