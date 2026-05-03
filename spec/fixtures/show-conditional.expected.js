import { defineComponent, delegate, showBlock, template } from "roqa";

const $tmpl_1 = template("<div><button>Toggle</button></div>");
const $tmpl_2 = template("<p>Now you see me!</p>");

defineComponent("show-toggle", function ShowToggle() {
	const visible = { v: false, e: [] };

	let visible_showBlock;

	const toggle = () => {
		visible.v = !visible.v;
		visible_showBlock.update();
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const button_1 = div_1.firstChild;

		button_1.__click = toggle;

		visible_showBlock = showBlock(div_1, visible, (anchor) => {
			const p_1 = $tmpl_2().firstChild;
			anchor.before(p_1);
			return { start: p_1, end: p_1 };
		});
	});
});

delegate(["click"]);
