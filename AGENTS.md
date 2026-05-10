# Roqa

Roqa is a headless UI framework that compiles component definitions into optimized
vanilla JavaScript using web components. Components are authored as Roqa IR
in `.roqa` files and compiled by the backend compiler.

## Architecture

```
Frontend (JSX, DSL, etc.)  →  Roqa IR (.roqa files)  →  Backend compiler  →  Optimized JS
```

- **Roqa IR format:** JSON-serializable `ComponentIR` — see `spec/ir.md`
- **Backend compiler:** `packages/roqa/src/compiler/` — validate → lower → optimize → emit
- **Runtime:** `packages/roqa/src/runtime/` — template, cell, defineComponent, forBlock, etc.
- **Vite plugin:** `packages/vite-plugin/` — compiles `.roqa` files and frontend-delegated files

## Key references

- `spec/ir.md` — Roqa IR type definitions (the compiler's input format)
- `spec/compiler.md` — compilation pipeline spec
- `spec/runtime.md` — runtime primitives the compiler targets
- `spec/ROADMAP.md` — future work items (frontends, optimizations, tooling)
- `spec/AGENT-LOG.md` — implementation history from the compiler rewrite
- `packages/roqa/tests/fixtures/` — test fixtures (`.roqa.json` + `.expected.js` pairs)

## Project layout

```
packages/roqa/src/compiler/   — the Roqa IR backend compiler
packages/roqa/src/runtime/    — runtime primitives (cell, template, forBlock, etc.)
packages/roqa/tests/          — test suite
packages/vite-plugin/         — Vite plugin (@roqajs/vite-plugin)
packages/roqa-jsx/            - a canonical JSX frontend implementation (@roqajs/jsx)
examples/ir/                  — IR-based examples
examples/jsx/                 — JSX-based examples
spec/                         — specifications and implementation history
```

## Code style

- Use tabs for indentation (see `.oxfmtrc.json`)
- Plain JavaScript with JSDoc type annotations (no TypeScript compilation)
- Type definitions in `.d.ts` files, imported via `/** @typedef {import(...)} */`

## Rules

- **Do NOT modify the compiler** (`packages/roqa/src/compiler/`) without
  running the test suite (`cd packages/roqa && pnpm test`). All tests
  must pass.
- **Do NOT modify the runtime** (`packages/roqa/src/runtime/`) unless the
  task explicitly requires it.
- **Do NOT modify `packages/roqa/tests/fixtures/`** — these are the ground truth for
  compiler output. If you think a fixture is wrong, flag it rather than
  changing it.
- **App-facing serialized IR files use `.roqa`** — spec fixtures remain
  `.roqa.json` for editor JSON support, but Vite and examples use `.roqa`.
