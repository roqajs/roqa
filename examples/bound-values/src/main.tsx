import { defineComponent, cell, get, set } from "roqa";
import "./styles.css";

function BoundValues() {
	const count = cell(0);

	const increment = () => set(count, get(count) + 1);
	const setCount = (e: Event) => {
		set(count, parseInt((e.target as HTMLInputElement)?.value, 10));
	};

	return (
		<>
			<button onclick={increment}>Clicked {get(count)} times</button>
			<button onclick={increment}>Clicked {get(count)} times</button>
			<input type="number" value={get(count)} oninput={setCount} />
			<p>Bound to count state: {get(count)}</p>
		</>
	);
}

defineComponent("bound-values", BoundValues);
