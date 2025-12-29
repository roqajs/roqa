import { defineComponent, type RiftElement } from "rift-js";
import "./styles.css";

function App(this: RiftElement) {
	const name = "Rift";
	const message = () => alert("Hello! This message is from <" + this.tagName.toLowerCase() + ">");

	return <name-tag name={name} message={message}></name-tag>;
}

function NameTag({ name, message }: { name: string; message: () => void }) {
	return (
		<>
			<h1>Hello, {name}!</h1>
			<button onclick={message}>Read Message</button>
		</>
	);
}

defineComponent("rift-app", App);
defineComponent("name-tag", NameTag);
