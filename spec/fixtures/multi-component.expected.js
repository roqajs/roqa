import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template("<button> </button>");
const $tmpl_2 = template("<span> </span>");

defineComponent("click-counter", function ClickCounter() {
	const count = { v: 0, e: [] };

	const increment = () => {
		count.v = count.v + 1;
		count.ref_1.nodeValue = "Clicks: " + count.v;
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const button_1 = this.firstChild;
		const button_1_text = button_1.firstChild;

		button_1.__click = increment;

		button_1_text.nodeValue = "Clicks: " + count.v;
		count.ref_1 = button_1_text;
	});
});

defineComponent("text-display", function TextDisplay({ text }) {
	this.connected(() => {
		const $root_1 = $tmpl_2();
		this.appendChild($root_1);

		const span_1 = this.firstChild;
		const span_1_text = span_1.firstChild;

		span_1_text.nodeValue = text;
	});
});

delegate(["click"]);
