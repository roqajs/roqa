# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
