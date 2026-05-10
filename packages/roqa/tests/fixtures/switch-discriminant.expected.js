import { defineComponent, switchBlock, template } from "roqa";

const $tmpl_1 = template("<div></div>");
const $tmpl_2 = template("<p>Loading...</p>");
const $tmpl_3 = template('<p class="success">Done!</p>');
const $tmpl_4 = template("<p>Unknown status.</p>");

defineComponent("status-message", function StatusMessage() {
	const status = { v: "loading", e: [] };

	let status_switchBlock;

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;

		status_switchBlock = switchBlock(div_1, [
			{
				test: () => status.v === "loading",
				render: (anchor) => {
					const p_1 = $tmpl_2().firstChild;

					anchor.before(p_1);
					return { start: p_1, end: p_1 };
				},
			},
			{
				test: () => status.v === "success",
				render: (anchor) => {
					const p_1 = $tmpl_3().firstChild;

					anchor.before(p_1);
					return { start: p_1, end: p_1 };
				},
			}
		],
		(anchor) => {
			const p_1 = $tmpl_4().firstChild;

			anchor.before(p_1);
			return { start: p_1, end: p_1 };
		}, [status]);
	});
});
