# Agent-first Roqa: current direction

> Concise syntax proposal. The APIs and template transform are not implemented yet.

Roqa uses ordinary TypeScript for application behavior, a small runtime for
reactivity and ownership, and one required compile-time transform for static
templates. JSX and whole-application compilation are not part of the design.

## Authoring model

```ts
import { component, effect, event, get, on, set } from "roqa";
import { template } from "roqa/authoring";

const counterTemplate = template(
	`<button data-ref="button">Count: <span data-ref="value"></span></button>`,
	{ button: HTMLButtonElement, value: HTMLSpanElement },
);

export const Counter = component<CounterProps>("counter-button", function ({ count }) {
	this.mount((scope) => {
		const view = counterTemplate();
		const { button, value } = view.refs;

		on(event.click, button, () => set(count, get(count) + 1));
		scope.own(effect(() => (value.textContent = String(get(count)))));
		return view;
	});
});
```

## Primitives

| Area         | API                                                         |
| ------------ | ----------------------------------------------------------- |
| Templates    | `template`, typed `TemplateInstance.refs`                   |
| Reactivity   | `cell`, `get`, `set`, `put`, `computed`, `effect`, `batch`  |
| Components   | `component<Props>`, typed `setProps`, `mount`, `MountScope` |
| Events       | typed tokens such as `event.click`, event-first `on`        |
| Control flow | keyed `forBlock`, dependency-tracking `showBlock`           |
| Ownership    | `scope.own`, `scope.listen`, per-block cleanup scopes       |

Components initialize once. Detaching and reconnecting must not duplicate DOM,
effects, handlers, or resources.

## Static-template compiler

The compiler handles only static `template(...)` calls imported from
`roqa/authoring`. It:

- rejects interpolated templates and invalid or duplicate references;
- parses the exact template DOM, including text nodes;
- strips authoring-only `data-ref` attributes;
- emits typed clone factories with direct `firstChild`/`nextSibling` traversal; and
- produces source maps.

It does not infer reactivity, events, control flow, props, or cleanup. The
`roqa/authoring` implementation fails if uncompiled syntax reaches the browser, so
there is no silent selector-based fallback.

## Tools

| Package/tool                | Responsibility                                                    |
| --------------------------- | ----------------------------------------------------------------- |
| `@roqajs/template-compiler` | Pure template transform shared by integrations                    |
| `@roqajs/vite-plugin`       | Runs the transform during development and production builds       |
| `roqa check`                | Optional diagnostics for templates, props, and ownership patterns |
| Roqa agent skill            | Teaches the vocabulary and project conventions                    |

The Vite plugin is required for applications using typed templates. CLI checks and
git hooks are supplementary diagnostics, never the mechanism that makes production
templates fast.
