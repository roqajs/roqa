import { defineComponent, cell, get, set } from "roqa";
import "./styles.css";

function App() {
	const count = cell(0);

	const increment = () => {
		set(count, get(count) + 1);
	};

	return <button onclick={increment}>Count is {get(count)}</button>;
}

defineComponent("counter-button", App);
