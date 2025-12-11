import { defineComponent, cell, get, put, set, batch } from 'rift-js';

const adjectives = [
	'pretty',
	'large',
	'big',
	'small',
	'tall',
	'short',
	'long',
	'handsome',
	'plain',
	'quaint',
	'clean',
	'elegant',
	'easy',
	'angry',
	'crazy',
	'helpful',
	'mushy',
	'odd',
	'unsightly',
	'adorable',
	'important',
	'inexpensive',
	'cheap',
	'expensive',
	'fancy',
];
const colours = [
	'red',
	'yellow',
	'blue',
	'green',
	'pink',
	'brown',
	'purple',
	'brown',
	'white',
	'black',
	'orange',
];
const nouns = [
	'table',
	'chair',
	'house',
	'bbq',
	'desk',
	'car',
	'pony',
	'cookie',
	'sandwich',
	'burger',
	'pizza',
	'mouse',
	'keyboard',
];

const rand = (dict) => dict[Math.round(Math.random() * 1000) % dict.length];

function App() {
	let rowId = 1;
	let items = cell([]);
	let selected_item = cell(null);

	function build_data(count = 1000) {
		const data = new Array(count);
		for (let i = 0; i < count; i++) {
			const text = rand(adjectives) + ' ' + rand(colours) + ' ' + rand(nouns);
			data[i] = {
				id: rowId++,
				label: cell(text),
				is_selected: cell(false),
			};
		}
		return data;
	}

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
			for (let i = 0, row; (row = get(items)[i]); i += 10) {
				set(row.label, get(row.label) + ' !!!');
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

	const select = (row) => {
		const prev = get(selected_item);
		if (prev) set(prev.is_selected, false);
		set(row.is_selected, true);
		put(selected_item, row);
	};

	const remove = (row) => {
		const clone = get(items).slice();
		clone.splice(clone.indexOf(row), 1);
		set(items, clone);
	};

	return (
		<div class="container">
			<div class="jumbotron">
				<div class="row">
					<div class="col-md-6">
						<h1>Riftttt</h1>
					</div>
					<div class="col-md-6">
						<div class="row">
							<div class="col-sm-6 smallpad">
								<button type="button" class="btn btn-primary btn-block" id="run" onclick={run}>
									Create 1,000 rows
								</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button
									type="button"
									class="btn btn-primary btn-block"
									id="runlots"
									onclick={runlots}
								>
									Create 10,000 rows
								</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button type="button" class="btn btn-primary btn-block" id="add" onclick={add}>
									Append 1,000 rows
								</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button
									type="button"
									class="btn btn-primary btn-block"
									id="update"
									onclick={update_rows}
								>
									Update every 10th row
								</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button type="button" class="btn btn-primary btn-block" id="clear" onclick={clear}>
									Clear
								</button>
							</div>
							<div class="col-sm-6 smallpad">
								<button
									type="button"
									class="btn btn-primary btn-block"
									id="swaprows"
									onclick={swaprows}
								>
									Swap Rows
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<table class="table table-hover table-striped test-data">
				<tbody>
					<For each={items}>
						{(row) => (
							<tr class={get(row.is_selected) ? 'danger' : ''}>
								<td class="col-md-1">{row.id}</td>
								<td class="col-md-4">
									<a onclick={() => select(row)}>{get(row.label)}</a>
								</td>
								<td class="col-md-1">
									<a onclick={() => remove(row)}>
										<span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
									</a>
								</td>
								<td class="col-md-6"></td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
			<span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
		</div>
	);
}

defineComponent('bench-app', App);
