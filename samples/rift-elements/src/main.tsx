import { defineComponent } from "rift-js";
import "./elements/switch";
import "./main.css";

function App() {
	return (
		<>
			<h1>Rift Elements Demo</h1>
			<switch-demo></switch-demo>
		</>
	);
}

defineComponent("rift-elements", App);
