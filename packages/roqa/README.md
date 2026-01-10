# Roqa

Roqa is a compile-time reactive web framework for building user interfaces and applications.

## At a glance

Roqa ships a familiar API and syntax for writing component based web UIs, with a few unique differences.

Under the hood every Roqa component is transformed into unbelievably optimized and performant custom elements & vanilla JavaScript. This means a compiled Roqa component is extremely portable and can be used in any other web framework or web-based environment. Additionally, by default Roqa does not use Shadow DOM, so you won't have to have to fight the styling gods to create beautiful web pages and applications –– you can use any of your favorite styling solutions out of the box.

The reactive primitive of Roqa is a `cell`. It can roughly be thought of as a signal, but at compile time, this "signal" is compiled to an ultra-lightweight plain JavaScript object. A handful of functions (i.e. `get`, `set`, `put`) are provided to manipulate the data in this object and reactive updates are automatically applied after a change is made.

Continue to learn more about Roqa at https://roqa.dev.

```jsx
import { defineComponent, cell, get, set } from "roqa";

function App() {
	const count = cell(0);
	const doubled = cell(() => get(count) * 2);

	const increment = () => {
		set(count, get(count) + 1);
	};

	return (
		<>
			<button onclick={increment}>Count is {get(count)}</button>
			<p>Doubled: {get(doubled)}</p>
		</>
	);
}

defineComponent("counter-button", App);
```

## License

[MIT](./LICENSE)
