import { defineComponent, template } from "roqa";

const $tmpl_1 = template("<article></article>");

defineComponent("raw-html-demo", function RawHtmlDemo() {
	const markup = { v: "<strong>Hello</strong> from <em>raw HTML</em>!", e: [] };

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const article_1 = this.firstChild;

		article_1.innerHTML = markup.v;
		markup.ref_1 = article_1;
	});
});
