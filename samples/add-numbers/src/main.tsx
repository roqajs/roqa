import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";

function App() {
	const numbers = cell([1, 2, 3, 4]);
	const sum = cell(10);

	const addNumber = () => {
		set(numbers, [...get(numbers), get(numbers).length + 1]);
		set(
			sum,
			get(numbers).reduce((a, b) => a + b, 0),
		);
	};

	return (
		<>
			<p>
				{get(numbers).join(" + ")} = {get(sum)}
			</p>
			<button onclick={addNumber}>Add number</button>
		</>
	);
}

defineComponent("add-numbers", App);
