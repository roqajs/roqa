import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template('<div><h2> </h2><p> </p><button>-</button><button>+</button><button>Reset</button></div>');

defineComponent("multi-action", function MultiAction() {
	const count = { v: 0, e: [] };
	const label = { v: "Counter", e: [] };

	const increment = () => {
		count.v = count.v + 1;
		count.ref_1.nodeValue = "Value: " + count.v;
	};

	const decrement = () => {
		count.v = count.v - 1;
		count.ref_1.nodeValue = "Value: " + count.v;
	};

	const reset = () => {
		count.v = 0;
		count.ref_1.nodeValue = "Value: " + count.v;
		label.v = "Counter (reset)";
		label.ref_1.nodeValue = label.v;
	};

	this.connected(() => {
		console.log('MultiAction connected');

		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const h2_1 = div_1.firstChild;
		const h2_1_text = h2_1.firstChild;
		const p_1 = h2_1.nextSibling;
		const p_1_text = p_1.firstChild;
		const button_1 = p_1.nextSibling;
		const button_2 = button_1.nextSibling;
		const button_3 = button_2.nextSibling;

		button_1.__click = decrement;
		button_2.__click = increment;
		button_3.__click = reset;

		h2_1_text.nodeValue = label.v;
		label.ref_1 = h2_1_text;
		p_1_text.nodeValue = "Value: " + count.v;
		count.ref_1 = p_1_text;
	});
});

delegate(["click"]);
