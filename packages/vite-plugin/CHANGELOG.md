# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-03-31

### Changed

- Updated `roqa` dependency to 0.0.6 with compile-time selector optimization for list selection patterns

## [0.0.5] - 2026-03-31

### Fixed

- Updated `roqa` dependency to 0.0.5 with fix for dangling cleanup calls when `bind()` subscriptions inside `<For>` and `<Show>` blocks are fully inlined

## [0.0.4] - 2026-01-10

### Fixed

- Updated `roqa` dependency to 0.0.4 with fix for `set()` not notifying subscribers in `<For>` blocks

## [0.0.3] - 2026-01-10

### Fixed

- Updated `roqa` dependency to 0.0.3 with critical memory leak fix for `<For>` loops with external cell bindings

## [0.0.2] - 2026-01-10

### Fixed

- Updated `roqa` dependency to 0.0.2 with reactive binding fix for `<For>` loops

## [0.0.1] - 2026-01-10

### Added

- Initial release
- Vite plugin for compiling Roqa JSX
- Automatic JSX preservation (bypasses esbuild)
- Source map support
- Helpful error messages for common compilation issues
