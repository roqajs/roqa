import { defineComponent, setProp, template } from "roqa";

const $tmpl_1 = template("<div><h2>Card</h2><status-badge></status-badge><p> </p></div>");

defineComponent("card-wrapper", function CardWrapper() {
	const total = { v: 5, e: [] };

	this.connected(() => {
		const $root_1 = $tmpl_1();

		const div_1 = $root_1.firstChild;
		const status_badge_1 = div_1.firstChild.nextSibling;

		setProp(status_badge_1, "label", "Active");
		setProp(status_badge_1, "count", total.v);

		this.appendChild($root_1);

		const p_1 = status_badge_1.nextSibling;
		const p_1_text = p_1.firstChild;

		p_1_text.nodeValue = "Total: " + total.v;
		total.ref_1 = p_1_text;
	});
});
