import { defineComponent, type RoqaElement } from "roqa";
import "./styles.css";

function App(this: RoqaElement) {
	const name = "Roqa";
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

defineComponent("roqa-app", App);
defineComponent("name-tag", NameTag);
