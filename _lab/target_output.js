import { defineComponent, delegate, for_block, cell, get, put, set, bind, batch, template } from "./lib.js";

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

const rand = (dict) => dict[Math.round(Math.random() * 1000) % dict.length];

const $tmpl_1 = template(
  '<div class="container"><div class="jumbotron"><div class="row"><div class="col-md-6"><h1>Rift</h1></div><div class="col-md-6"><div class="row"><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="run">Create 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="runlots">Create 10,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="add">Append 1,000 rows</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="update">Update every 10th row</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="clear">Clear</button></div><div class="col-sm-6 smallpad"><button type="button" class="btn btn-primary btn-block" id="swaprows">Swap Rows</button></div></div></div></div></div><table class="table table-hover table-striped test-data"><tbody></tbody></table><span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span></div>'
);
const $tmpl_2 = template(
  '<tr><td class="col-md-1"> </td><td class="col-md-4"><a> </a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>'
);

function App() {
  let rowId = 1;
  let items = cell([]);
  let selected_item = cell(null);

  function build_data(count = 1000) {
    const data = new Array(count);
    for (let i = 0; i < count; i++) {
      const text = rand(adjectives) + " " + rand(colours) + " " + rand(nouns);
      data[i] = {
        id: rowId++,
        label: cell(text),
        is_selected: cell(false),
      };
    }
    return data;
  }

  this.connected(() => {
    const $root_1 = $tmpl_1();
    this.appendChild($root_1);

    const div_1 = this.firstChild;
    const div_2 = div_1.firstChild;
    const div_3 = div_2.firstChild;
    const div_4 = div_3.firstChild;
    const div_5 = div_4.nextSibling;
    const div_6 = div_5.firstChild;
    const div_7 = div_6.firstChild;
    const button_1 = div_7.firstChild;
    const div_8 = div_7.nextSibling;
    const button_2 = div_8.firstChild;
    const div_9 = div_8.nextSibling;
    const button_3 = div_9.firstChild;
    const div_10 = div_9.nextSibling;
    const button_4 = div_10.firstChild;
    const div_11 = div_10.nextSibling;
    const button_5 = div_11.firstChild;
    const div_12 = div_11.nextSibling;
    const button_6 = div_12.firstChild;
    const table_1 = div_2.nextSibling;
    const tbody_1 = table_1.firstChild;

    button_1.__click = run;
    button_2.__click = runlots;
    button_3.__click = add;
    button_4.__click = update_rows;
    button_5.__click = clear;
    button_6.__click = swaprows;

    for_block(tbody_1, items, (anchor, item, index) => {
      const $root_2 = $tmpl_2();

      const tr_1 = $root_2.firstChild;
      const td_1 = tr_1.firstChild;
      const td_1_text = td_1.firstChild;
      const td_2 = td_1.nextSibling;
      const a_1 = td_2.firstChild;
      const a_1_text = a_1.firstChild;
      const td_3 = td_2.nextSibling;
      const a_2 = td_3.firstChild;

      a_1.__click = [select, item];
      a_2.__click = [remove, item];

      // Set row id
      td_1_text.nodeValue = item.id;

      // Set label text and bind to label cell
      a_1_text.nodeValue = get(item.label);
      bind(item.label, (v) => {
        a_1_text.nodeValue = v;
      });

      // Bind effect: when selected cell updates, update row class
      bind(item.is_selected, (v) => {
        tr_1.className = v ? "danger" : "";
      });

      // Insert the row before the anchor
      anchor.before(tr_1);
      // Return the range of affected rows
      return { start: tr_1, end: tr_1 };
    });
  });

  const run = () => {
    set(items, build_data(1000));
  };

  const runlots = () => {
    set(items, build_data(10000));
  };

  const add = () => {
    set(items, [...get(items), ...build_data(1000)]);
  };

  const clear = () => {
    set(items, []);
    put(selected_item, null);
  };

  const update_rows = () => {
    batch(() => {
      for (let i = 0, item; (item = get(items)[i]); i += 10) {
        set(item.label, get(item.label) + " !!!");
      }
    });
  };

  const swaprows = () => {
    if (get(items).length > 998) {
      const clone = get(items).slice();
      const temp = clone[1];
      clone[1] = clone[998];
      clone[998] = temp;
      set(items, clone);
    }
  };

  const select = (e, item) => {
    const prev = get(selected_item);
    if (prev) set(prev.is_selected, false);
    set(item.is_selected, true);
    put(selected_item, item);
  };

  const remove = (e, item) => {
    const clone = get(items).slice();
    clone.splice(clone.indexOf(item), 1);
    set(items, clone);
  };
}

defineComponent("bench-app", App);

delegate(["click"]);
