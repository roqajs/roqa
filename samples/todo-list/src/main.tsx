import { defineComponent, cell, For, get, set } from "rift-js";
import "./styles.css";

function TodoList() {
	const todos = cell([
		{ text: "Pick up groceries", completed: false },
		{ text: "Walk the dog", completed: false },
		{ text: "Read a book", completed: false },
	]);

	function addTodo(event: KeyboardEvent) {
		if (event.key === "Enter" && (event.target as HTMLInputElement).value.trim() !== "") {
			const newTodo = {
				text: (event.target as HTMLInputElement).value.trim(),
				completed: false,
			};
			set(todos, [...get(todos), newTodo]);
			(event.target as HTMLInputElement).value = "";
		}
	}

	function clearTodos() {
		set(
			todos,
			get(todos).filter((todo) => !todo.completed),
		);
	}

	return (
		<>
			<input type="text" onkeydown={addTodo} placeholder="Add todo item" />
			<section class="todos">
				<For each={todos}>
					{(todo) => (
						<label class="todo">
							<input
								type="checkbox"
								checked={todo.completed}
								onchange={() => {
									todo.completed = !todo.completed;
									set(todos, [...get(todos)]);
								}}
							/>
							<span class={todo.completed ? "completed" : ""}>{todo.text}</span>
						</label>
					)}
				</For>
			</section>
			<p>{get(todos).filter((todo) => !todo.completed).length} remaining</p>
			<button onclick={clearTodos}>Clear completed</button>
		</>
	);
}

defineComponent("todo-list", TodoList);
