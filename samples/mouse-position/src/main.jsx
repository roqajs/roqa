import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";

function MousePosition() {
	const x = cell(0);
	const y = cell(0);
	let clientRect;

	this.connected(() => {
		clientRect = this.getBoundingClientRect();
		this.on("mousemove", updatePosition);
	});

	const updatePosition = (event) => {
		set(x, event.clientX - Number(clientRect.left.toFixed(0)));
		set(y, event.clientY - Number(clientRect.top.toFixed(0)));
	};

	return (
		<p>
			The mouse position is {get(x)} x {get(y)}
		</p>
	);
}

defineComponent("mouse-position", MousePosition);
