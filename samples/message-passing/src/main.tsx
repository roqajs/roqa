import { defineComponent, cell, get, set, type RiftElement } from "rift-js";
import type { CounterMethods } from "./counter";
import "./counter";
import "./styles.css";

function App(this: RiftElement) {
	const count = cell(0);
	const counterCount = cell(0);

	const passDataIntoCounter = () => {
		const counter = this.querySelector<RiftElement<CounterMethods>>("x-counter");
		counter?.setCount(get(count));
	};

	// Component level listener for events from counter component
	this.on<{ count: number }>("count-changed", (event) => {
		set(counterCount, event.detail.count);
	});

	return (
		<>
			<p>Parent Component</p>
			<input
				type="number"
				value={get(count)}
				oninput={(e) => set(count, Number((e.target as HTMLInputElement).value))}
			/>
			<button onclick={passDataIntoCounter}>Set counter value</button>
			<x-counter></x-counter>
			<p class="child-message">Count from counter: {get(counterCount)}</p>
		</>
	);
}

defineComponent("message-passing", App);
