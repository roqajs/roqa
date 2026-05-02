import { defineComponent, delegate, template } from "roqa";

const $tmpl_1 = template("<div><button>Increment</button><p> </p><p> </p><p> </p></div>");

defineComponent("derived-counter", function DerivedCounter() {
	const count = { v: 0, e: [] };
	const doubled = { v: () => count.v * 2, e: [] };
	const quadrupled = { v: () => doubled.v * 2, e: [] };

	const increment = () => {
		count.v = count.v + 1;
		count.ref_1.nodeValue = "Count: " + count.v;
		doubled.ref_1.nodeValue = "Doubled: " + count.v * 2;
		quadrupled.ref_1.nodeValue = "Quadrupled: " + count.v * 2 * 2;
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const button_1 = div_1.firstChild;
		const p_1 = button_1.nextSibling;
		const p_1_text = p_1.firstChild;
		const p_2 = p_1.nextSibling;
		const p_2_text = p_2.firstChild;
		const p_3 = p_2.nextSibling;
		const p_3_text = p_3.firstChild;

		button_1.__click = increment;

		p_1_text.nodeValue = "Count: " + count.v;
		count.ref_1 = p_1_text;
		p_2_text.nodeValue = "Doubled: " + count.v * 2;
		doubled.ref_1 = p_2_text;
		p_3_text.nodeValue = "Quadrupled: " + count.v * 2 * 2;
		quadrupled.ref_1 = p_3_text;
	});
});

delegate(["click"]);
