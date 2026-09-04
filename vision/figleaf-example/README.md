# Figleaf translated to proposed Roqa primitives

This review-only application translates the architecture and major interactions of
the vanilla TypeScript UI in `../../../figleaf/web` into a possible agent-authored
Roqa style with a narrowly scoped static-template compiler.

This is a **syntax prototype**, not an example of Roqa's current public API. The
proposed APIs are declared locally under `src/types/` so the source remains
type-checkable, but they and the new template transform are not implemented yet.
The goal is to judge how this vocabulary looks, feels, and reads in a realistic
application.

The translation is intentionally representative rather than line-for-line:

- `figleaf-daw` owns the asynchronous engine boundary and shared cells;
- `transport-bar` binds transport cells to focused DOM mutations;
- `arrangement-view` uses `forBlock` for tracks and MIDI note overviews;
- `track-editor` uses `showBlock` for empty, audio, and MIDI editor regions;
- `status-bar` shares the timeline zoom cell with the arrangement; and
- canvas drawing and the mock engine remain ordinary TypeScript platform adapters.

## Proposed authoring vocabulary

- Multiline static `template` literals imported from `roqa/authoring` return typed
  `refs` declared beside the markup.
- The required Vite transform replaces each authoring call with a clone factory
  containing direct `firstChild`/`nextSibling` traversal and strips `data-ref`
  attributes from emitted templates. The authoring entry point fails closed if it
  reaches the browser uncompiled.
- `component<Props>` returns a typed component definition whose `setProps` method
  verifies required child properties.
- `computed`, dependency-tracking `effect`, and `batch` remove manual derived-cell
  synchronization and redundant update passes.
- `forBlock` requires an explicit key and gives every rendered item a cleanup scope;
  `showBlock` tracks dependencies and owns conditional content the same way.
- `mount` and `MountScope` give effects, blocks, listeners, and native resources one
  ownership model, with a reconnect-safe component lifecycle contract.
- Event handlers read as `on(event.click, button, handler)`. The typed `event` token
  object provides autocomplete and inferred DOM event types while remaining
  string-like and extensible. A TypeScript enum would add enum-specific runtime
  semantics without improving delegation or custom-event interoperability.
- DAW actions use a payload map, making action names and their argument types part of
  one checked dispatch contract.

Templates contain no `${...}` interpolation. The compiler calculates paths against
the literal's exact parsed DOM, including meaningful and formatting whitespace;
dynamic values remain explicit effects or block inputs.

## Source layout

```text
src/
├── app/          application composition and reactive model
├── components/   Roqa-authored UI components
├── engine/       asynchronous DAW bridge boundary
├── styles/       application styling
└── types/        DAW contracts and proposed Roqa declarations
vite.config.ts     required static-template transform
```

## Review goals

- Compare the Roqa component boundaries with Figleaf's original monolithic
  `main.ts`.
- Judge whether explicit cells plus tracked effects clarify or obscure data flow.
- See how event-first typed delegation reads in a control-dense application.
- Evaluate whether typed references, keyed blocks, and cleanup scopes justify their
  API surface in a real interface.
- Judge whether the narrow template compiler preserves the performance and
  predictability of direct DOM traversal without reviving whole-application
  compilation.

## Validate the prototype

```sh
pnpm --dir vision/figleaf-example install --ignore-workspace
pnpm --dir vision/figleaf-example run typecheck
```

A production build cannot succeed until the proposed runtime exports and revised
template transform exist in Roqa. The package uses a small browser mock instead of
Figleaf's JUCE bridge. It preserves the same action-and-snapshot boundary so the
authored Roqa code still demonstrates how native updates would enter the cell graph.
