import { defineComponent, cell, get, set } from "rift-js";

function ChildComponent() {
	const count = cell(0);

	const increment = () => {
		set(count, get(count) + 1);
		this.emit("child-count-changed", { count: get(count) });
	};

	// Attach setCount method to child-component custom element class for parent to call
	this.setCount = (value) => {
		set(count, value);
		this.emit("child-count-changed", { count: get(count) });
	};

	return (
		<>
			<p>Child Component</p>
			<button onclick={increment}>Count is: {get(count)}</button>
		</>
	);
}

defineComponent("child-component", ChildComponent);
