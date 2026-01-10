import { defineComponent, cell, get, set, type RoqaElement } from "roqa";

export interface CounterMethods {
	setCount: (value: number) => void;
}

function Counter(this: RoqaElement<CounterMethods>) {
	const count = cell(0);

	const increment = () => {
		set(count, get(count) + 1);
		this.emit("count-changed", { count: get(count) });
	};

	// Attach setCount method to custom element at runtime for parent to call
	this.setCount = (value: number) => {
		set(count, value);
		this.emit("count-changed", { count: get(count) });
	};

	return (
		<>
			<p>Child Component</p>
			<button onclick={increment}>Count is: {get(count)}</button>
		</>
	);
}

defineComponent("x-counter", Counter);
