---
applyTo: "**"
---

# Roqa MIR Compiler Rewrite

You are implementing a new MIR-based backend compiler for Roqa. The compiler
accepts structured MIR (Mid-level IR) data and produces optimized JavaScript.

## Getting oriented

**Start every session by reading these two files:**

1. **`spec/AGENT-LOG.md`** — the running log of all prior implementation
   progress, decisions, and discoveries. This ensures continuity across
   sessions where chat context may be reset.
2. **`spec/implementation-guide.md`** — the full implementation plan, including
   file locations, phase ordering, test strategy, and audit findings.

**Then reference these specs as needed:**

- `spec/ir.md` — the MIR type definitions (the compiler's input format)
- `spec/compiler.md` — the compilation pipeline spec (validate → lower → optimize → emit)
- `spec/runtime.md` — the runtime primitives the compiler targets
- `spec/reference-algorithms.md` — algorithmic patterns from the old compiler (use as reference, don't copy verbatim)

**Test against:**

- `spec/fixtures/*.mir.json` — MIR input fixtures
- `spec/fixtures/*.expected.js` — expected JavaScript output

## Key rules

- **Do NOT reference the old compiler source code** in
  `packages/roqa/src/compiler/` for behavior — it is being replaced. Use
  `spec/reference-algorithms.md` for algorithmic patterns only.
- **Do NOT modify the runtime** (`packages/roqa/src/runtime/`) beyond what
  the implementation guide specifies (the `subscribe()` addition is already done).
- **Do NOT modify examples, the Vite plugin, or package.json files** unless
  the implementation guide explicitly says to.
- **Log your progress** — update `spec/AGENT-LOG.md` at the end of every
  session with what you did, decisions made, and issues found.
- **Flag fixture mismatches** — if you think a fixture is wrong, log it in
  `spec/AGENT-LOG.md` rather than silently adjusting your implementation.
  See the "Fixture accuracy" section in `spec/implementation-guide.md`.

## Code style

- Use tabs for indentation (see `.oxfmtrc.json`)
- Plain JavaScript with JSDoc type annotations (no TypeScript compilation)
- Type definitions in `.d.ts` files, imported via `/** @typedef {import(...)} */`
