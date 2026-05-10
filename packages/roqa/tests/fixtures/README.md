# Roqa IR Test Fixtures

Golden test files for the Roqa backend compiler. Each fixture is a pair:

- `*.roqa.json` — Roqa IR input used by the compiler test corpus
- `*.expected.js` — Expected JavaScript output after compilation

> **Note:** The spec documents (`compiler.md`, `ir.md`) contain inline code
> examples that illustrate concepts. These are informational and may show
> variations of the output (e.g., different variable names, slightly different
> ordering). The `.expected.js` fixture files in this directory are the
> **canonical ground truth** for testing the compiler. When the specs and
> fixtures differ, the fixtures are authoritative.

## Fixtures

| Fixture            | Covers                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `static-component` | Simplest case: no state, no events, `StaticClassIR`, static HTML only                                                                       |
| `counter-button`   | Basic state + event + reactive text binding                                                                                                 |
| `show-conditional` | `ShowIR` conditional rendering with state toggle                                                                                            |
| `derived-state`    | Computed state chains (count → doubled → quadrupled)                                                                                        |
| `todo-list`        | Collections, `EachIR`, `method-call` computed, `template-literal` in reactive text, action-calls with args, class bindings, inline handlers |
| `props-attrs`      | Props and attributes with defaults, reflection, `attr-read`, `ConditionalExpr`, reactive `ClassListIR` with `attrChanged`                   |
| `deep-nesting`     | Deep DOM tree with reactive class bindings, traversal verification                                                                          |
| `external-refs`    | `ImportedRefExpr` and `ExternalRefExpr` in computed values                                                                                  |
| `child-props`      | Custom element child composition, `setProp()`, two-phase traversal                                                                          |
| `show-fallback`    | `ShowIR` with fallback (else-branch), dual `showBlock` controllers                                                                          |
| `svg-circle`       | SVG elements, `svgTemplate()`, `setAttribute()` for SVG attributes                                                                          |
| `multi-component`  | Multiple components in one file, import dedup, single `delegate()`                                                                          |
| `multi-action`     | Multiple actions, block expressions, lifecycle, emit declarations, `EmitExpr` in action body                                                |

## How to use

Tests should read each `.roqa.json`, pass it through `compile()`, and compare
the output against the corresponding `.expected.js`. The expected files may
need updating as the compiler is built — start with the simpler fixtures and
work up.

> **Fixtures vs app files:** The canonical app-facing serialized IR extension is
> `.roqa`. The fixtures in this directory remain `.roqa.json` so editors treat
> them as JSON while preserving the same Roqa IR payload.
