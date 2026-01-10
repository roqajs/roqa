import { defineComponent, cell, get, type RoqaElement, set } from "roqa";
import "./styles.css";

function MousePosition(this: RoqaElement) {
	const x = cell(0);
	const y = cell(0);
	let clientRect: DOMRect;

	this.connected(() => {
		clientRect = this.getBoundingClientRect();
		this.on("mousemove", updatePosition);
	});

	const updatePosition = (event: MouseEvent) => {
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
