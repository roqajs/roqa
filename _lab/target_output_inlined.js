import { defineComponent, delegate, for_block, template } from "../lib.js";

const $tmpl_1 = template(
	'<div class="container"><div class="jumbotron"><div class="row"><div class="col-md-6"><h1>Rift (Inlined)</h1></div><div class="col-md-6"><div class="row"><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run">Create 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots">Create 10,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add">Append 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update">Update every 10th row</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear">Clear</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows">Swap Rows</button></div></div></div></div></div><table class="table table-hover table-striped test-data"><tbody></tbody></table><span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span></div>',
);
const $tmpl_2 = template(
	'<tr><td class="col-md-1"> </td><td class="col-md-4"><a> </a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>',
);

const adjectives = [
	"pretty",
	"large",
	"big",
	"small",
	"tall",
	"short",
	"long",
	"handsome",
	"plain",
	"quaint",
	"clean",
	"elegant",
	"easy",
	"angry",
	"crazy",
	"helpful",
	"mushy",
	"odd",
	"unsightly",
	"adorable",
	"important",
	"inexpensive",
	"cheap",
	"expensive",
	"fancy",
];
const colours = [
	"red",
	"yellow",
	"blue",
	"green",
	"pink",
	"brown",
	"purple",
	"brown",
	"white",
	"black",
	"orange",
];
const nouns = [
	"table",
	"chair",
	"house",
	"bbq",
	"desk",
	"car",
	"pony",
	"cookie",
	"sandwich",
	"burger",
	"pizza",
	"mouse",
	"keyboard",
];

const _rand = (dict) => dict[Math.round(Math.random() * 1000) % dict.length];

function App() {
	let row_id = 1;
	let rows = {
		v: [],
		e: [],
	};
	let selected_row = {
		v: null,
		e: [],
	};

	function build_data(count = 1000) {
		const data = new Array(count);
		for (let i = 0; i < count; i++) {
			const text = _rand(adjectives) + " " + _rand(colours) + " " + _rand(nouns);
			data[i] = {
				id: row_id++,
				label: {
					v: text,
					e: [],
				},
				is_selected: {
					v: false,
					e: [],
				},
			};
		}
		return data;
	}
	const run = () => {
		rows.v = build_data(1000);
		rows_for_block.update();
	};
	const runlots = () => {
		rows.v = build_data(10000);
		rows_for_block.update();
	};
	const add = () => {
		rows.v = [...rows.v, ...build_data(1000)];
		rows_for_block.update();
	};
	const clear = () => {
		rows.v = [];
		rows_for_block.update();
		selected_row.v = null;
	};
	const update_rows = () => {
		for (let i = 0, item; (item = rows.v[i]); i += 10) {
			item.label.v += " !!!";
			// Direct DOM update - no function call overhead!
			item.label.ref_1.nodeValue = item.label.v;
		}
	};
	const swaprows = () => {
		if (rows.v.length > 998) {
			const clone = rows.v.slice();
			const temp = clone[1];
			clone[1] = clone[998];
			clone[998] = temp;
			rows.v = clone;
			rows_for_block.update();
		}
	};
	const select = (e, item) => {
		const prev = selected_row.v;
		if (prev) {
			prev.is_selected.v = false;
			// Direct DOM update - no effect loop!
			prev.is_selected.ref_1.className = prev.is_selected.v ? "danger" : "";
		}
		item.is_selected.v = true;
		// Direct DOM update - no effect loop!
		item.is_selected.ref_1.className = item.is_selected.v ? "danger" : "";
		selected_row.v = item;
	};
	const remove = (e, item) => {
		const clone = rows.v.slice();
		clone.splice(clone.indexOf(item), 1);
		rows.v = clone;
		rows_for_block.update();
	};
	let rows_for_block;
	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);
		const div_2 = this.firstChild.firstChild;
		const div_7 = div_2.firstChild.firstChild.nextSibling.firstChild.firstChild;
		const button_1 = div_7.firstChild;
		const div_8 = div_7.nextSibling;
		const button_2 = div_8.firstChild;
		const div_9 = div_8.nextSibling;
		const button_3 = div_9.firstChild;
		const div_10 = div_9.nextSibling;
		const button_4 = div_10.firstChild;
		const div_11 = div_10.nextSibling;
		const button_5 = div_11.firstChild;
		const button_6 = div_11.nextSibling.firstChild;
		const tbody_1 = div_2.nextSibling.firstChild;
		button_1.__click = run;
		button_2.__click = runlots;
		button_3.__click = add;
		button_4.__click = update_rows;
		button_5.__click = clear;
		button_6.__click = swaprows;
		rows_for_block = for_block(tbody_1, rows, (anchor, item, index) => {
			const tr_1 = $tmpl_2().firstChild;
			const td_1 = tr_1.firstChild;
			const td_1_text = td_1.firstChild;
			const td_2 = td_1.nextSibling;
			const a_1 = td_2.firstChild;
			const a_1_text = a_1.firstChild;
			const a_2 = td_2.nextSibling.firstChild;
			a_1.__click = [select, item];
			a_2.__click = [remove, item];
			item.is_selected.ref_1 = tr_1;
			td_1_text.nodeValue = item.id;
			item.label.ref_1 = a_1_text;
			anchor.before(tr_1);
			return {
				start: tr_1,
				end: tr_1,
			};
		});
	});
}
defineComponent("bench-app", App);
delegate(["click"]);
