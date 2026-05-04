# Agent Implementation Log

This file serves as a **persistent log of all implementation progress, decisions,
and discoveries** across multiple coding agent runs. Because agent chat context
may be reset between sessions, this log ensures continuity — every new session
should read this file first to understand what has been done, what's in progress,
and why certain decisions were made.

## How to use this file

1. **Read this entire file at the start of every session** before doing any work.
2. **Append new entries** at the bottom of the relevant section as you work.
3. **Never delete or rewrite existing entries** — this is an append-only log.
4. **Be specific** — include file paths, code snippets, error messages, and
   reasoning. Future sessions won't have your chat context.

---

## Implementation Status

> Update this section as phases are completed. Mark each phase with
> ✅ (done), 🔧 (in progress), or ⬚ (not started).

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1: MIR types + validation | ✅ | `types.d.ts`, `validate.js`, `index.js` |
| Phase 2: Expression IR compiler | ✅ | `expr-compiler.js` |
| Phase 3: Lowering (MIR → LIR) | ✅ | `lower.js` — 11/13 fixtures exact match, 2 quote-only diffs |
| Phase 4: Emitter (LIR → JS) | ✅ | `emit.js` |
| Phase 5: Optimization passes | ✅ | `optimize.js` — inline cells + inline bindings |
| Phase 6: Vite plugin integration | ⬚ | `packages/vite-plugin/src/index.js` |
| Runtime: Add `subscribe()` | ✅ | `cell.js` + `index.js` exports (done pre-handoff) |
| Tests | ⬚ | New test suite in `packages/roqa/tests/` |

---

## Session Log

> Each session should add an entry below. Format:
>
> ### Session N — YYYY-MM-DD
> **Goal:** What was the session's objective
> **Completed:** What was actually done
> **Decisions:** Any design decisions made and why
> **Issues found:** Bugs, inconsistencies, or problems discovered
> **Next steps:** What the next session should pick up

*(No sessions logged yet — implementation has not started.)*

### Session 1 — 2026-05-03

**Goal:** Implement the full MIR-based backend compiler from scratch.

**Completed:**
- Deleted all old compiler files (parser.js, codegen.js, utils.js, transforms/)
- Created all 6 new compiler files: `types.d.ts`, `validate.js`, `expr-compiler.js`, `lower.js`, `optimize.js`, `emit.js`, `index.js`
- Full pipeline working: validate → lower → optimize → emit
- **9 of 13 fixtures passing exactly**: static-component, counter-button, derived-state, deep-nesting, show-conditional, show-fallback, multi-component, svg-circle, external-refs

**Decisions:**
- Ref numbering is per-cell (e.g., `count.ref_1`, `doubled.ref_1`) not global
- Computed cell bodies are expanded at lowering time (e.g., `quadrupled.v = () => count.v * 2 * 2`)
- Binding expressions for computed cells use expanded forms (replace `computed.v` with underlying expression)
- Template strings use double quotes by default, single quotes when HTML contains double quotes
- Block updates (forBlock.update, showBlock.update) are emitted BEFORE DOM binding updates in inlined sets
- Inlined sets are emitted BEFORE trailing body parts (like emit calls) in actions

**Issues found (4 failing fixtures):**

1. **`multi-action`** — 2 fixture inconsistencies flagged:
   - Template quote: fixture uses single quotes `'<div>...'` when HTML has no quotes. Other fixtures with no-quote HTML use double quotes. Our compiler uses double quotes (matches majority pattern).
   - String literal in lifecycle: `console.log('MultiAction connected')` uses single quotes in fixture, but our compiler uses `JSON.stringify` which produces double quotes. All other string literals in fixtures use double quotes.

2. **`props-attrs`** — Binding emission order issue:
   - The `className` binding + `attrChanged` callback should be emitted BEFORE text bindings (span_1_text, div_1_text)
   - Currently className binding is created correctly but emitted in creation order, which puts it after text bindings

3. **`child-props`** — Two-phase traversal for setProp:
   - Phase 2 traversal generates extra vars (`h2_1`, `status_badge_2`) that should be pruned
   - The `lowerElementChildren` with `skipVars` isn't correctly reusing phase-1 vars as anchors
   - Need: phase 2 should skip directly to `p_1 = status_badge_1.nextSibling` without re-traversing h2 or status-badge

4. **`todo-list`** — Multiple issues:
   - Template quote inconsistency (same as multi-action)
   - Block var (`let todos_forBlock`) placement: fixture has it AFTER functions, but show-conditional/show-fallback fixtures have it BEFORE. Currently emitting before (matches show fixtures).
   - Collection `update` op with inline closure now compiles correctly after fix

**Next steps:**
- Fix child-props: rewrite phase-2 traversal to reuse phase-1 anchors, skip non-referenced intermediate nodes
- Fix props-attrs: reorder bindings so className + attrChanged come before text bindings
- Fix todo-list: decide on block var placement (before vs after functions)
- Investigate multi-action/todo-list template quote discrepancy — may be fixture inconsistency to flag
- Add Vitest integration tests
- Phase 6: Vite plugin wiring

### Session 2 — 2026-05-03

**Goal:** Fix the remaining 4 failing fixtures.

**Completed:**
- Fixed child-props: rewrote phase-2 traversal to skip intermediate elements and use phase-1 prop target vars as anchors for subsequent traversals
- Fixed props-attrs: className + attrChanged now emitted in correct position (creation order, with blank line after attrChanged block); fixed attr-read class bindings to create bindings even without reactive state cells
- Fixed todo-list: block vars now placed correctly (show/fallback before functions, each/forBlock after functions); inline closures with statement bodies now use block syntax `{ }; collection update op correctly inlines closure body; `remaining` computed expanded correctly via template-literal expansion; delegate events preserve first-encountered order
- Fixed deep-nesting: bindings emit in creation order (no sorting), which naturally puts them in traversal order
- **11 of 13 fixtures now pass exactly**

**Remaining 2 fixture mismatches are quote-style-only:**
1. `multi-action`: template uses `"..."` (our output) vs `'...'` (fixture) for HTML with no quotes; lifecycle `console.log("...")` vs `console.log('...')` 
2. `todo-list`: template uses `"..."` vs `'...'` for HTML with no quotes

All other 11 fixtures with the same pattern (no quotes in HTML) use double quotes. These 2 fixtures are outliers. The compiled output is structurally and semantically identical — only quote style differs.

**Decisions:**
- Block var placement: show/fallback block vars before functions, each/forBlock vars after (matches both show and todo-list fixture patterns)
- Template string quotes: double quotes by default, single when HTML contains double quotes (matches 11/13 fixtures)
- String literal quotes: double quotes via JSON.stringify (matches majority of string occurrences in fixtures)
- Delegate event order: preserve first-encountered order (not alphabetical)
- Closure bodies with statements (state-write, block, collection-op) use block syntax `(e) => { ... }`

**Next steps:**
- Add Vitest integration tests for all fixtures
- Phase 6: Vite plugin wiring
- Delete old compiler tests, add new test suite

---

## Known Issues & Spec Clarifications

> Document any spec ambiguities, fixture concerns, or implementation
> questions discovered during work. These help future sessions avoid
> re-discovering the same problems.

*(See the audit findings in the implementation guide for pre-implementation
discoveries. Add runtime discoveries here as work proceeds.)*

### Fixture quote inconsistency (Session 1)
- `multi-action.expected.js` and `todo-list.expected.js` use single quotes for template strings (`template('...')`) even when the HTML contains no quotes. All other no-quote fixtures use double quotes. May be an authoring inconsistency.
- `multi-action.expected.js` line 28: `console.log('MultiAction connected')` uses single quotes while all other string literals in fixtures use double quotes via `JSON.stringify` patterns.

### Block var placement inconsistency (Session 1)
- `show-conditional.expected.js` and `show-fallback.expected.js` place `let blockVar;` BEFORE function declarations.
- `todo-list.expected.js` places `let todos_forBlock;` AFTER function declarations.
- Both patterns work (JS hoists `let` declarations). Current compiler emits block vars before functions (matches show fixtures).

---

## Architecture Decisions

> Record any decisions about implementation approach that aren't covered
> by the spec documents. Include the reasoning so future sessions understand
> the "why" behind choices.

*(No decisions logged yet.)*

---

## Test Results History

> Keep a running record of test results so regressions are visible.
> Format: `YYYY-MM-DD | fixture-name | pass/fail | notes`

*(No test runs yet.)*
