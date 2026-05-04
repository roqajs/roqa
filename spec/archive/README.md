# Archived Specs

This directory contains documents from the **MIR-based compiler rewrite**
(completed 2026-05-03). They are preserved for historical reference but are
no longer actively maintained.

| File | Purpose |
| --- | --- |
| `implementation-guide.md` | The step-by-step plan for the compiler rewrite (phases, audit findings, test strategy) |
| `reference-algorithms.md` | Algorithmic patterns extracted from the old JSX-based compiler |
| `AGENT-LOG.md` | Session-by-session implementation log with decisions and issues |

## When to read these

- **Debugging the compiler** — the AGENT-LOG documents design decisions and
  known fixture inconsistencies
- **Understanding lowering patterns** — the implementation guide's §Key codegen
  patterns section and reference-algorithms.md explain traversal computation,
  text coalescing, two-phase traversal for props, etc.
- **Adding optimization passes** — the implementation guide's §Phase 5 section
  describes the pass ordering and the planned but unimplemented passes

## Active specs

The active specification documents remain in `spec/`:
- `ir.md` — MIR type definitions (the `.roqa` file format)
- `compiler.md` — compilation pipeline specification
- `runtime.md` — runtime primitives
- `ROADMAP.md` — future work items
