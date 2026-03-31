# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-03-31

### Added

- Added compile-time selector optimization for list selection patterns
  - The compiler now detects `get(cell) === loopItem` inside `<For>` attribute expressions and generates an O(1) selector instead of N per-row `bind()` subscriptions
  - A single shared `Map` (keyed by row reference) and one `bind()` on the outer cell replaces N per-row `bind()` calls
  - On selection change only 2 Map callbacks fire (deselect old, select new) regardless of list size
  - Row cleanup removes its Map entry to prevent memory leaks

## [0.0.5] - 2026-03-31

### Fixed

- Fixed a compiler bug where cleanup-captured `bind()` calls inside `<For>` and `<Show>` blocks could be fully inlined to ref assignments while leaving dangling `_cleanup_N()` calls in generated cleanup functions
  - The inliner now tracks cleanup variable names for removable `bind()` subscriptions and removes stale cleanup calls when their underlying subscription has been optimized away
  - Cleanup properties are omitted entirely when all generated cleanup calls were eliminated during inlining

### Changed

- Restored the js benchmark example to the faster per-row selection strategy so compiled output uses direct row refs instead of per-row subscriptions to a shared selection cell

## [0.0.4] - 2026-01-10

### Fixed

- Fixed `set()` calls not notifying subscribers when using cleanup-captured `bind()` calls inside `<For>` and `<Show>` blocks
  - The `findBindCallbacks` function in the inliner now correctly detects `bind()` calls in variable declarations (`const _cleanup_N = bind(...)`) in addition to expression statements
  - This ensures the effect loop is generated for cells with non-inlined bind callbacks

## [0.0.3] - 2026-01-10

### Fixed

- Fixed critical memory leak when using `<For>` with reactive bindings to cells outside the loop (e.g., `class={get(selected) === row.id ? "danger" : ""}`)
  - Subscriptions to external cells are now properly cleaned up when items are removed or the array is cleared
  - `reconcileFastClear` now calls cleanup functions before clearing DOM
  - The compiler now generates cleanup functions that capture `bind()` unsubscribe calls inside `<For>` and `<Show>` blocks

## [0.0.2] - 2026-01-10

### Fixed

- Fixed reactive bindings in `<For>` loops not updating when the bound cell references closure variables from the loop callback (e.g., `class={get(selected) === row.id ? "danger" : ""}`)
- The compiler now correctly preserves `bind()` calls when the callback body contains closure variables that wouldn't be available at `set()` call sites

## [0.0.1] - 2026-01-10

### Added

- Initial release
- Compile-time JSX transformation to optimized vanilla JavaScript
- Reactive primitives: `cell`, `get`, `put`, `set`, `bind`, `notify`
- `template()` for efficient DOM cloning
- `defineComponent()` for creating web components
- `<For>` component for reactive list rendering
- `<Show>` component for conditional rendering
- Event delegation system with `delegate()`
- Full TypeScript type definitions
- JSX runtime types for IDE support
