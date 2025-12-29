import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";
import "./child-component.jsx";

function ParentComponent() {
	const count = cell(0);
	const childCount = cell(0);

	const passDataIntoChild = () => {
		const child = this.querySelector("child-component");
		child.setCount(get(count));
	};

	// Component level listener for events from child component
	this.on("child-count-changed", (event) => {
		set(childCount, event.detail.count);
	});

	return (
		<>
			<p>Parent Component</p>
			<input type="number" value={get(count)} oninput={(e) => set(count, Number(e.target.value))} />
			<button onclick={passDataIntoChild}>Set child count</button>
			<child-component></child-component>
			<p class="child-message">Count from child: {get(childCount)}</p>
		</>
	);
}

defineComponent("parent-component", ParentComponent);
