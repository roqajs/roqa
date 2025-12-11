import { defineComponent, delegate, for_block, template } from "../lib.js";

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
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
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

const root_tmpl = template(
  '<div class="container"><div class="jumbotron"><div class="row"><div class="col-md-6"><h1>Rift (Inlined)</h1></div><div class="col-md-6"><div class="row"><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run">Create 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots">Create 10,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add">Append 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update">Update every 10th row</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear">Clear</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows">Swap Rows</button></div></div></div></div></div><table class="table table-hover table-striped test-data"><tbody></tbody></table><span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span></div>'
);
const row_tmpl = template(
  '<tr><td class="col-md-1"> </td><td class="col-md-4"><a> </a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>'
);

function App() {
  let rowId = 1;
  let items = { v: [], e: [] };
  let selected_item = { v: null };

  function build_data(count = 1000) {
    const data = new Array(count);
    for (let i = 0; i < count; i++) {
      const text = _rand(adjectives) + " " + _rand(colours) + " " + _rand(nouns);
      data[i] = {
        id: rowId++,
        label: { v: text, node: null },
        is_selected: { v: false, row: null },
      };
    }
    return data;
  }

  this.connected(() => {
    const root = root_tmpl();
    this.appendChild(root);

    const buttons_row =
      this.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild?.nextElementSibling
        ?.firstElementChild;

    const button_div_1 = buttons_row.firstElementChild;
    const button_div_2 = button_div_1.nextElementSibling;
    const button_div_3 = button_div_2.nextElementSibling;
    const button_div_4 = button_div_3.nextElementSibling;
    const button_div_5 = button_div_4.nextElementSibling;
    const button_div_6 = button_div_5.nextElementSibling;

    const button_1 = button_div_1.firstElementChild;
    const button_2 = button_div_2.firstElementChild;
    const button_3 = button_div_3.firstElementChild;
    const button_4 = button_div_4.firstElementChild;
    const button_5 = button_div_5.firstElementChild;
    const button_6 = button_div_6.firstElementChild;

    const tbody = this.firstElementChild?.firstElementChild?.nextElementSibling?.firstElementChild;

    button_1.__click = run;
    button_2.__click = runlots;
    button_3.__click = add;
    button_4.__click = update_rows;
    button_5.__click = clear;
    button_6.__click = swaprows;

    for_block(tbody, items, (anchor, item, index) => {
      const row = row_tmpl();
      const tr = row.firstChild;

      const label_anchor = tr.firstChild.nextSibling.firstChild;
      const label_node = label_anchor.firstChild;
      const remove_anchor = tr.firstChild.nextSibling.nextSibling.firstChild;

      label_anchor.__click = [select, item];
      remove_anchor.__click = [remove, item];

      tr.firstChild.firstChild.nodeValue = item.id;

      label_node.nodeValue = item.label.v;
      item.label.node = label_node;
      item.is_selected.row = tr;

      anchor.before(row);
      return { start: tr, end: tr };
    });
  });

  const run = () => {
    items.v = build_data(1000);
    for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
  };

  const runlots = () => {
    items.v = build_data(10000);
    for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
  };

  const add = () => {
    items.v = [...items.v, ...build_data(1000)];
    for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
  };

  const clear = () => {
    items.v = [];
    for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
    selected_item.v = null;
  };

  const update_rows = () => {
    for (let i = 0, item; (item = items.v[i]); i += 10) {
      item.label.v += " !!!";
      // Direct DOM update - no function call overhead!
      item.label.node.nodeValue = item.label.v;
    }
  };

  const swaprows = () => {
    if (items.v.length > 998) {
      const clone = items.v.slice();
      const temp = clone[1];
      clone[1] = clone[998];
      clone[998] = temp;
      items.v = clone;
      for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
    }
  };

  const select = (e, item) => {
    const prev = selected_item.v;
    if (prev) {
      prev.is_selected.v = false;
      // Direct DOM update - no effect loop!
      prev.is_selected.row.className = "";
    }
    item.is_selected.v = true;
    // Direct DOM update - no effect loop!
    item.is_selected.row.className = "danger";
    selected_item.v = item;
  };

  const remove = (e, item) => {
    const clone = items.v.slice();
    clone.splice(clone.indexOf(item), 1);
    items.v = clone;
    for (let i = 0; i < items.e.length; i++) items.e[i](items.v);
  };
}

defineComponent("bench-app", App);

delegate(["click"]);
