import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";

function DerivedCount() {
	const count = cell(0);
	const doubled = cell(() => get(count) * 2);
	const quadrupled = cell(() => get(doubled) * 2);
	const octupled = cell(() => get(quadrupled) * 2);

	const increment = () => {
		set(count, get(count) + 1);
	};

	return (
		<>
			<button onclick={increment}>Increment count</button>
			<p>Count: {get(count)}</p>
			<p>Doubled: {get(doubled)}</p>
			<p>Quadrupled: {get(quadrupled)}</p>
			<p>Octupled: {get(octupled)}</p>
		</>
	);
}

defineComponent("derived-count", DerivedCount);
