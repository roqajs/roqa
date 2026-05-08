<a href="https://roqa.dev">
	<img src="assets/banner.png" alt="Roqa – A UI framework that's built small, so you can build big." />
</a>
<div align="right">

*Banner design incorporates art from [The Met Open Access Collection](https://www.metmuseum.org/art/collection/search/436782)*

</div>

## What is Roqa?

Roqa is a universal compiler backend that turns UI component definitions into hyper-optimized vanilla JavaScript Web Components. Think of it as the LLVM of web UI.

Named for the intricate creations of the *Baroque* era, Roqa provides a deliberately minimal, ruthlessly fast base layer so *you* have the headroom to build grand, beautiful, and rich web experiences. You design the authoring experience –– whether it's JSX for humans, a deterministic DSL for AI coding agents, or a drag-and-drop GUI builder. As long as your tool can output Roqa MIR, the backend compiler will handle the rest.

**Bring your own syntax. Roqa writes the DOM.**

## At a glance

Roqa is structured like a native compiler:

```
Frontend (JSX, DSL, GUI, AI agent) → MIR (.roqa) → Backend Compiler → Optimized JS
```

1. **The frontend** is any authoring tool that produces component definitions.
2. **Roqa MIR** is a deterministic, JSON-serializable blueprint of a component –– the view tree, state, bindings, events, and lifecycle. This is the contract between frontends and the backend.
3. **The backend compiler** validates, lowers, optimizes, and emits the final vanilla JavaScript.

Here's the pipeline in action. A component authored using the reference JSX frontend:

```jsx
import { defineComponent, cell, get, set } from "roqa";

function App() {
	const count = cell(0);

	const increment = () => {
		set(count, get(count) + 1);
	};

	return <button onclick={increment}>Count is {get(count)}</button>;
}

defineComponent("counter-button", App);
```

The JSX frontend compiles this into MIR –– a normalized, frontend-independent IR:

```json
{
	"version": 1,
	"tagName": "counter-button",
	"name": "CounterButton",
	"state": [{ "kind": "value", "name": "count", "initial": 0 }],
	"actions": [{
		"kind": "action",
		"name": "increment",
		"params": [],
		"body": {
			"kind": "state-write",
			"name": "count",
			"value": {
				"kind": "binary",
				"op": "+",
				"left": { "kind": "state-read", "name": "count" },
				"right": { "kind": "literal", "value": 1 }
			}
		}
	}],
	"render": [{
		"kind": "element",
		"tag": "button",
		"events": [{ "event": "click", "handler": { "kind": "action-call", "name": "increment", "args": [] } }],
		"children": [
			{ "kind": "text", "value": "Count: " },
			{ "kind": "reactive-text", "source": { "kind": "state-read", "name": "count" } }
		]
	}]
}
```

The backend compiler consumes this MIR and emits a hyper-optimized Web Component:

```js
import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template("<button> </button>");

defineComponent("counter-button", function CounterButton() {
	const count = { v: 0, e: [] };

	const increment = () => {
		count.v = count.v + 1;
		count.ref_1.nodeValue = "Count: " + count.v;
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const button_1 = this.firstChild;
		const button_1_text = button_1.firstChild;

		button_1.__click = increment;

		button_1_text.nodeValue = "Count: " + count.v;
		count.ref_1 = button_1_text;
	});
});

delegate(["click"]);
```

Reactivity is compiled away. `cell()` becomes a plain object `{ v: 0, e: [] }`. DOM updates are inlined directly at the write site –– no virtual DOM, no runtime graph walk, no subscription overhead. Just straight-line JavaScript.

## World-class performance, for free

When you build a custom frontend or DSL, you usually have to write a custom rendering engine. With Roqa, you get an elite rendering engine out of the box.

Using the reference JSX frontend, **Roqa is currently the #2 fastest fully declarative framework in the [JS Framework Benchmark](https://krausest.github.io/js-framework-benchmark/)** –– surpassing Svelte, Solid, and Vue.

## The agent-first web foundation

For years, we've forced AI models to scaffold web apps using frameworks built for human ergonomics. Syntactic sugar like React Hooks and Svelte runes is great for developers, but it creates unnecessary complexity and hallucination risks for coding agents.

Roqa decouples *authoring syntax* from *execution*. An AI researcher can design whatever structured format best suits their model –– a Python-like DSL, a YAML schema, raw JSON –– and as long as it produces valid MIR, the output is production-grade. This makes it possible to benchmark different AI authoring formats against one another structurally, all while guaranteeing the output is optimized and correct.

## Output characteristics

- **Standard Web Components:** Every compiled component is a real custom element. Drop it into React, Vue, plain HTML –– it just works.
- **No Shadow DOM:** Global CSS, Tailwind classes, and design systems apply normally.
- **Tiny runtime:** Only minimal primitives survive compilation (`template`, `defineComponent`, `delegate`, and list/conditional helpers). Everything else is compiled away.

## Getting Started

To try Roqa with the reference JSX frontend, bootstrap a new Vite project:

```bash
npm create roqa@latest my-app
cd my-app
npm install
npm run dev
```

### Writing custom frontends

If you're building a custom frontend targeting the Roqa compiler, see the [Frontend Author Guide](spec/frontend-guide.md) and the [MIR Spec](spec/ir.md).

## License

[MIT](./LICENSE)
