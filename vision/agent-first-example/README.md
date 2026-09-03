# Agent-first dashboard example

This review-only application explores what a small Roqa application could look
like without JSX or a Roqa compiler. It uses ordinary TypeScript, current Roqa
runtime primitives, native custom elements, and direct DOM traversal.

The application is a small project dashboard made from five components:

- `project-nav` selects a project from a repeated list;
- `progress-summary` derives completion information from shared cells;
- `task-composer` emits requests to create tasks;
- `task-board` renders empty and repeated regions and emits task actions; and
- `agent-dashboard` owns application state and connects the components.

## Review goals

- Judge whether direct primitive code remains understandable across component
  boundaries.
- Identify traversal, lifecycle, and typing work that should move into a narrow
  source generator.
- See which patterns belong in the Roqa skill.
- Compare the amount of framework-specific code with the behavior it provides.

The traversal statements are handwritten stand-ins for a future
`roqa generate traversal` command. `src/proposed-runtime.d.ts` is a local shim
for event-slot and `showBlock` types that the runtime package does not expose
yet.

## Try it

This package intentionally has no Roqa Vite plugin.

```sh
pnpm --dir vision/agent-first-example install --ignore-workspace
npm --prefix vision/agent-first-example run dev
npm --prefix vision/agent-first-example run typecheck
```

The example is exploratory. It may expose gaps in the current runtime or types;
those gaps are useful review results rather than a commitment to these APIs.

## Gaps exposed by the prototype

- Delegated `__event` slots need public, type-safe declarations or assignment
  helpers.
- `showBlock` is exported by the runtime but missing from the public
  declarations.
- Block callbacks currently type their anchor as `Node`, even though generated
  code calls the `ChildNode.before` API. This example uses `insertBefore` as a
  checked workaround.
