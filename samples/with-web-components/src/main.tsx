import { defineComponent, type RiftElement } from "rift-js";
import "./vanilla-counter";
import "./lit-counter";
import "./styles.css";

function App(this: RiftElement) {
	let count: HTMLElement;

	this.connected(() => {
		count = this.querySelector("#sl-count")!;
	});

	return (
		<>
			<p>Vanilla Web Component</p>
			<vanilla-counter increment-amount="2"></vanilla-counter>
			<p>Lit Web Component</p>
			<lit-counter increment-amount="3"></lit-counter>
			<p>Shoelace Web Component</p>
			<sl-button onclick={() => (count.textContent = `${parseInt(count.textContent) + 1}`)}>
				Increment
			</sl-button>
			<span id="sl-count">0</span>
		</>
	);
}

defineComponent("rift-app", App);
