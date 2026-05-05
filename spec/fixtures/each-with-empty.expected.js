import { defineComponent, forBlock, showBlock, template } from "roqa";

const $tmpl_1 = template("<ul></ul>");
const $tmpl_2 = template("<li> </li>");
const $tmpl_3 = template('<li class="empty-state">No items yet.</li>');

defineComponent("todo-list-empty", function TodoListEmpty() {
	const items = { v: [], e: [] };

	let items_forBlock;
	let items_emptyBlock;

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const ul_1 = this.firstChild;

		items_forBlock = forBlock(ul_1, items, (anchor, item, _index) => {
			const li_1 = $tmpl_2().firstChild;
			const li_1_text = li_1.firstChild;

			li_1_text.nodeValue = item.text;

			anchor.before(li_1);
			return { start: li_1, end: li_1 };
		});

		items_emptyBlock = showBlock(ul_1, () => items.v == null || items.v.length === 0, (anchor) => {
			const li_1 = $tmpl_3().firstChild;

			anchor.before(li_1);
			return { start: li_1, end: li_1 };
		}, [items]);
	});
});
