import { defineComponent, delegate, forBlock, template } from "roqa";

const $tmpl_1 = template('<div><input><button>Add</button><ul></ul></div>');
const $tmpl_2 = template('<li> </li>');

defineComponent("todo-list", function TodoList() {
	const todos = { v: [], e: [] };
	const draft = { v: "", e: [] };

	const addTodo = () => {
		todos.v = [...todos.v, { id: Date.now(), text: draft.v, completed: false }];
		todos_forBlock.update();
		draft.v = "";
		draft.ref_1.value = draft.v;
	};

	const toggleTodo = (id) => {
		todos.v = todos.v.map((t) => t.id === id ? { ...t, completed: !t.completed } : t);
		todos_forBlock.update();
	};

	let todos_forBlock;

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;
		const input_1 = div_1.firstChild;
		const button_1 = input_1.nextSibling;
		const ul_1 = button_1.nextSibling;

		input_1.__input = (e) => {
			draft.v = e.target.value;
		};
		button_1.__click = addTodo;

		todos_forBlock = forBlock(ul_1, todos, (anchor, todo, index) => {
			const li_1 = $tmpl_2().firstChild;
			const li_1_text = li_1.firstChild;

			li_1.__click = [toggleTodo, todo.id];
			li_1.className = "todo" + (todo.completed ? " completed" : "");
			li_1_text.nodeValue = todo.text;

			anchor.before(li_1);
			return { start: li_1, end: li_1 };
		});

		input_1.value = draft.v;
		draft.ref_1 = input_1;
	});
});

delegate(["input", "click"]);
