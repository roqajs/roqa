import { defineComponent, template } from "roqa";
import { formatDate } from "./utils.js";

const $tmpl_1 = template("<div><p> </p><p> </p></div>");

defineComponent("external-refs", function ExternalRefs() {
	const rawValue = { v: 3.14159, e: [] };
	const timestamp = { v: 0, e: [] };
	const rounded = { v: () => Math.floor(rawValue.v * 100), e: [] };
	const formatted = { v: () => formatDate(timestamp.v), e: [] };

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const p_1 = div_1.firstChild;
		const p_1_text = p_1.firstChild;
		const p_2 = p_1.nextSibling;
		const p_2_text = p_2.firstChild;

		p_1_text.nodeValue = "Rounded: " + Math.floor(rawValue.v * 100);
		rounded.ref_1 = p_1_text;
		p_2_text.nodeValue = "Date: " + formatDate(timestamp.v);
		formatted.ref_1 = p_2_text;
	});
});
