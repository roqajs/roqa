# Roqa

Roqa is a compile-time reactive web framework for building user interfaces and applications.

Learn more about it at https://roqa.dev.

## At a glance

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

MIT
