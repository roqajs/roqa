import { defineComponent, template } from "roqa";

const $tmpl_1 = template("<div><span> </span> </div>");

defineComponent("prop-display", function PropDisplay({ label, value = 0 }) {
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const span_1 = div_1.firstChild;
		const span_1_text = span_1.firstChild;
		const div_1_text = span_1.nextSibling;

		span_1_text.nodeValue = label;
		div_1_text.nodeValue = ": " + value;
	});
}, {
	observedAttributes: ["variant"]
});
