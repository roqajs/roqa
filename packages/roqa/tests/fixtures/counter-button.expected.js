import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template("<button> </button>");

defineComponent("counter-button", function CounterButton() {
	const count = { v: 0, e: [] };

	const increment = () => {
		count.v = count.v + 1;
		count.ref_1.nodeValue = "Count: " + count.v;
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const button_1 = this.firstChild;
		const button_1_text = button_1.firstChild;

		button_1.__click = increment;

		button_1_text.nodeValue = "Count: " + count.v;
		count.ref_1 = button_1_text;
	});
});

delegate(["click"]);
