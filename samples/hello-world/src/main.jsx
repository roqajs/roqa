import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";

function HelloWorld() {
	const name = cell("World");

	const updateName = (event) => {
		set(name, event.target.value);
	};

	return (
		<>
			<label for="name">Enter name:</label>
			<input id="name" type="text" value={get(name)} oninput={updateName} />
			<p id="msg">Hello {get(name)}!</p>
		</>
	);
}

defineComponent("hello-world", HelloWorld);
