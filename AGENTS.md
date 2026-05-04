---
applyTo: "**"
---

# Roqa

Roqa is a UI framework that compiles component definitions into optimized
vanilla JavaScript using web components. Components are authored as MIR
(Mid-level IR) in `.roqa` files and compiled by the backend compiler.

## Architecture

```
Frontend (JSX, DSL, etc.)  →  MIR (.roqa files)  →  Backend compiler  →  Optimized JS
```

- **MIR format:** JSON-serializable `ComponentIR` — see `spec/ir.md`
- **Backend compiler:** `packages/roqa/src/compiler/` — validate → lower → optimize → emit
- **Runtime:** `packages/roqa/src/runtime/` — template, cell, defineComponent, forBlock, etc.
- **Vite plugin:** `packages/vite-plugin/` — compiles `.roqa` files and frontend-delegated files

## Key references

- `spec/ir.md` — MIR type definitions (the compiler's input format)
- `spec/compiler.md` — compilation pipeline spec
- `spec/runtime.md` — runtime primitives the compiler targets
- `spec/ROADMAP.md` — future work items (frontends, optimizations, tooling)
- `spec/AGENT-LOG.md` — implementation history from the compiler rewrite
- `spec/fixtures/` — test fixtures (`.mir.json` + `.expected.js` pairs)

## Project layout

```
packages/roqa/src/compiler/   — the MIR-based backend compiler
packages/roqa/src/runtime/    — runtime primitives (cell, template, forBlock, etc.)
packages/roqa/tests/          — test suite (36 tests)
packages/vite-plugin/         — Vite plugin (@roqajs/vite-plugin)
examples/ir/                  — IR-based examples (13 working apps)
examples/jsx/                 — JSX-based examples (require JSX frontend — not yet built)
spec/                         — specifications and implementation history
```

## Code style

- Use tabs for indentation (see `.oxfmtrc.json`)
- Plain JavaScript with JSDoc type annotations (no TypeScript compilation)
- Type definitions in `.d.ts` files, imported via `/** @typedef {import(...)} */`

## Rules

- **Do NOT modify the compiler** (`packages/roqa/src/compiler/`) without
  running the test suite (`cd packages/roqa && pnpm test`). All 36 tests
  must pass.
- **Do NOT modify the runtime** (`packages/roqa/src/runtime/`) unless the
  task explicitly requires it.
- **Do NOT modify `spec/fixtures/`** — these are the ground truth for
  compiler output. If you think a fixture is wrong, flag it rather than
  changing it.
- **Test fixtures use `.mir.json`** (for editor JSON support). App files
  use `.roqa`. Both contain the same JSON-serializable MIR format.
