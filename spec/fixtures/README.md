# MIR Test Fixtures

Golden test files for the Roqa backend compiler. Each fixture is a pair:

- `*.mir.json` — MIR input (the canonical IR a frontend produces)
- `*.expected.js` — Expected JavaScript output after compilation

> **Note:** The spec documents (`compiler.md`, `ir.md`) contain inline code
> examples that illustrate concepts. These are informational and may show
> variations of the output (e.g., different variable names, slightly different
> ordering). The `.expected.js` fixture files in this directory are the
> **canonical ground truth** for testing the compiler. When the specs and
> fixtures differ, the fixtures are authoritative.

## Fixtures

| Fixture | Covers |
| --- | --- |
| `static-component` | Simplest case: no state, no events, static HTML only |
| `counter-button` | Basic state + event + reactive text binding |
| `show-conditional` | `ShowIR` conditional rendering with state toggle |
| `derived-state` | Computed state chains (count → doubled → quadrupled) |
| `todo-list` | Collections, `EachIR`, bound actions, class bindings, inline handlers |
| `props-attrs` | Props and attributes with defaults and reflection |
| `deep-nesting` | Deep DOM tree with reactive class bindings, traversal verification |
| `external-refs` | `ImportedRefExpr` and `ExternalRefExpr` in computed values |
| `multi-action` | Multiple actions, block expressions, lifecycle, emit declarations |

## How to use

Tests should read each `.mir.json`, pass it through `compile()`, and compare
the output against the corresponding `.expected.js`. The expected files may
need updating as the compiler is built — start with the simpler fixtures and
work up.
