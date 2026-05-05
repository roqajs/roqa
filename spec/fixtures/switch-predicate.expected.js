import { defineComponent, switchBlock, template } from "roqa";

const $tmpl_1 = template("<div></div>");
const $tmpl_2 = template('<span class="gold">Gold</span>');
const $tmpl_3 = template('<span class="silver">Silver</span>');
const $tmpl_4 = template('<span class="none">Try again</span>');

defineComponent("score-badge", function ScoreBadge() {
	const score = { v: 0, e: [] };

	let score_switchBlock;

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;

		score_switchBlock = switchBlock(div_1, [
			{
				test: () => score.v >= 90,
				render: (anchor) => {
					const span_1 = $tmpl_2().firstChild;

					anchor.before(span_1);
					return { start: span_1, end: span_1 };
				},
			},
			{
				test: () => score.v >= 70,
				render: (anchor) => {
					const span_1 = $tmpl_3().firstChild;

					anchor.before(span_1);
					return { start: span_1, end: span_1 };
				},
			}
		],
		(anchor) => {
			const span_1 = $tmpl_4().firstChild;

			anchor.before(span_1);
			return { start: span_1, end: span_1 };
		}, [score]);
	});
});
