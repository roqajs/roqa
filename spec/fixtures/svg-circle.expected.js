import { defineComponent, delegate, svgTemplate } from "roqa";

const $tmpl_1 = svgTemplate('<svg width="100" height="100"><circle cx="50" cy="50"></circle></svg>');

defineComponent("icon-dot", function IconDot() {
	const radius = { v: 20, e: [] };

	const grow = () => {
		radius.v = radius.v + 5;
		radius.ref_1.setAttribute("r", radius.v);
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const svg_1 = this.firstChild;
		const circle_1 = svg_1.firstChild;

		svg_1.__click = grow;

		circle_1.setAttribute("r", radius.v);
		radius.ref_1 = circle_1;
	});
});

delegate(["click"]);
