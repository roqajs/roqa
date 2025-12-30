import { defineComponent } from "rift-js";
import "./elements/switch";
import "./elements/avatar";
import "./main.css";

function App() {
	return (
		<>
			<h1>Rift Elements</h1>
			<avatar-demo></avatar-demo>
			<switch-demo></switch-demo>
		</>
	);
}

defineComponent("rift-elements", App);
