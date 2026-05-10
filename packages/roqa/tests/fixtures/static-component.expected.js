import { defineComponent, template } from "roqa";

const $tmpl_1 = template('<div class="greeting">Hello, World!</div>');

defineComponent("hello-world", function HelloWorld() {
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);
	});
});
