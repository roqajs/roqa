# AGENTS.md

This repository is a Roqa frontend-author package.

Roqa uses a split architecture:

```txt
authoring syntax -> frontend parser/normalizer -> ComponentIR (.roqa shape) -> Roqa backend -> optimized JavaScript
```

Your job in this workspace is to own everything up to valid `ComponentIR` output. The backend compiler and runtime already exist in the published `roqa` packages.

## Working rules

- Treat `src/index.ts` as the owning frontend entrypoint unless the package grows beyond a single file.
- Keep changes focused on producing valid Roqa IR rather than compensating for backend behavior.
- Use the reference files in `tests/fixtures/` when you need concrete `.roqa` targets to compare against. They are intentionally real Roqa IR examples, not pseudo-code.
- When you need a walkthrough, read `.agents/skills/create-roqa-frontend/SKILL.md` first.

## Useful project files

- `src/index.ts` contains the `your_frontend()` stub that should grow into the real frontend.
- `types/index.d.ts` includes the frontend interface that Vite-facing consumers expect you to implement.
- `tests/index.test.ts` is the starter fixture test file for frontend output.
- `tests/fixtures/` contains a broader corpus copied from the repo's IR examples so you can compare frontend output against real component shapes.

## Fixture guide

- `tests/fixtures/static-component.roqa` shows the simplest static component shape with no state or events.
- `tests/fixtures/counter-button.roqa` shows basic state, an action-backed event, and reactive text.
- `tests/fixtures/show-conditional.roqa` shows `ShowIR` conditional rendering with a state toggle.
- `tests/fixtures/show-fallback.roqa` shows `ShowIR` with a fallback branch.
- `tests/fixtures/switch-discriminant.roqa` shows `SwitchIR` in discriminant mode.
- `tests/fixtures/switch-predicate.roqa` shows `SwitchIR` in predicate mode.
- `tests/fixtures/derived-state.roqa` shows computed state chains.
- `tests/fixtures/todo-list.roqa` shows collections, `EachIR`, template literals, class bindings, inline handlers, and action calls with args.
- `tests/fixtures/each-with-empty.roqa` shows `EachIR.empty` fallback rendering for empty collections.
- `tests/fixtures/each-with-index.roqa` shows `EachIR.indexAlias` and local index reads.
- `tests/fixtures/props-attrs.roqa` shows props, reflected attrs, defaults, `attr-read`, and conditional class logic.
- `tests/fixtures/child-props.roqa` shows child custom elements receiving prop values.
- `tests/fixtures/deep-nesting.roqa` shows a deep DOM tree and traversal-heavy bindings.
- `tests/fixtures/external-refs.roqa` shows imported and external references in expressions.
- `tests/fixtures/raw-html.roqa` shows `RawHtmlIR` with trusted raw markup insertion.
- `tests/fixtures/svg-circle.roqa` shows SVG element output and SVG-specific attributes.
- `tests/fixtures/multi-action.roqa` shows multiple actions, block expressions, lifecycle hooks, and emits.
- `tests/fixtures/multi-component.roqa` shows multiple components in one `.roqa` file.

## Roqa IR reminders

- The root object is `ComponentIR` with `version`, `tagName`, `name`, `state`, `actions`, `props`, `attrs`, `emits`, `lifecycle`, and `render`.
- `render` is an array of nodes, not a single root wrapper.
- Reactive reads use explicit expression nodes like `state-read`, `prop-read`, and `cell-ref`.
- `types/index.d.ts` includes the frontend plugin interface: `handles(id)` decides ownership and `toIR(code, id)` returns one or more `ComponentIR` objects.
- `.roqa` files are just JSON-serializable IR. They are the easiest way to sanity check frontend output.
