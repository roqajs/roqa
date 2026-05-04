import { defineComponent, type RoqaElement } from "roqa";
import "./styles.css";

function Lifecycle(this: RoqaElement) {
	this.connected(() => {
		console.log("Component connected to DOM");
	});

	this.disconnected(() => {
		console.log("Component disconnected from DOM");
	});

	return (
		<>
			<p>Open console to see lifecycle events</p>
			<button onclick={() => this.remove()}>Disconnect component from DOM</button>
		</>
	);
}

defineComponent("life-cycle", Lifecycle);
