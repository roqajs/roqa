import { defineComponent, forBlock, template } from "roqa";

const $tmpl_1 = template("<ol></ol>");
const $tmpl_2 = template("<li> </li>");

defineComponent("indexed-list", function IndexedList() {
	const items = { v: [], e: [] };

	let items_forBlock;

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const ol_1 = this.firstChild;

		items_forBlock = forBlock(ol_1, items, (anchor, item, i) => {
			const li_1 = $tmpl_2().firstChild;
			const li_1_text = li_1.firstChild;

			li_1_text.nodeValue = i + 1 + ". " + item.name;

			anchor.before(li_1);
			return { start: li_1, end: li_1 };
		});
	});
});
