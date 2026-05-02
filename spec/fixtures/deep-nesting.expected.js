import { defineComponent, template } from "roqa";

const $tmpl_1 = template('<div id="container"><header><h1> </h1></header><main><p>Some content</p></main><footer>Footer text</footer></div>');

defineComponent("deep-nesting", function DeepNesting() {
	const title = { v: "Hello", e: [] };
	const active = { v: false, e: [] };

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const header_1 = div_1.firstChild;
		const h1_1 = header_1.firstChild;
		const h1_1_text = h1_1.firstChild;
		const main_1 = header_1.nextSibling;

		h1_1_text.nodeValue = title.v;
		title.ref_1 = h1_1_text;
		main_1.className = "content" + (active.v ? " active" : "");
		active.ref_1 = main_1;
	});
});
