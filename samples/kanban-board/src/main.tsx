import { defineComponent, cell, For, get, set } from "rift-js";
import "./styles.css";

let taskId = 0;

function createTask(text: string) {
	return {
		id: taskId++,
		text: cell(text),
	};
}

function KanbanBoard() {
	const columns = cell([
		{
			id: "todo",
			name: "Todo",
			tasks: cell([
				createTask("Build something cool"),
				createTask("Write tests"),
				createTask("Read documentation"),
			]),
		},
		{
			id: "in-progress",
			name: "In Progress",
			tasks: cell([createTask("Learn Rift")]),
		},
		{
			id: "done",
			name: "Done",
			tasks: cell([createTask("Install dependencies")]),
		},
	]);

	const newTaskText = cell("");

	function addTask() {
		const text = get(newTaskText).trim();
		if (!text) return;

		const cols = get(columns);
		const todoColumn = cols[0];
		set(todoColumn.tasks, [...get(todoColumn.tasks), createTask(text)]);
		set(newTaskText, "");
	}

	function moveTask(fromColumnIndex: number, taskId: number, direction: number) {
		const cols = get(columns);
		const toColumnIndex = fromColumnIndex + direction;

		if (toColumnIndex < 0 || toColumnIndex >= cols.length) return;

		const fromColumn = cols[fromColumnIndex];
		const toColumn = cols[toColumnIndex];
		const fromTasks = get(fromColumn.tasks);
		const task = fromTasks.find((t) => t.id === taskId);

		if (!task) return;

		set(
			fromColumn.tasks,
			fromTasks.filter((t) => t.id !== taskId),
		);
		set(toColumn.tasks, [...get(toColumn.tasks), task]);
	}

	function deleteTask(columnIndex: number, taskId: number) {
		const cols = get(columns);
		const column = cols[columnIndex];
		set(
			column.tasks,
			get(column.tasks).filter((t) => t.id !== taskId),
		);
	}

	return (
		<>
			<h1>Kanban Board</h1>
			<div class="add-task">
				<input
					type="text"
					placeholder="New task..."
					value={get(newTaskText)}
					oninput={(e: Event) => set(newTaskText, (e.target as HTMLInputElement).value)}
					onkeydown={(e) => e.key === "Enter" && addTask()}
				/>
				<button onclick={addTask}>Add to Todo</button>
			</div>
			<div class="board">
				<For each={columns}>
					{(column, columnIndex) => (
						<div class="column">
							<h2>{column.name}</h2>
							<div class="task-count">{get(column.tasks).length} task(s)</div>
							<div class="tasks">
								<For each={column.tasks}>
									{(task) => (
										<div class="task">
											<span class="task-text">{get(task.text)}</span>
											<div class="task-actions">
												<button class="move-btn" onclick={() => moveTask(columnIndex, task.id, -1)}>
													←
												</button>
												<button class="move-btn" onclick={() => moveTask(columnIndex, task.id, 1)}>
													→
												</button>
												<button class="delete-btn" onclick={() => deleteTask(columnIndex, task.id)}>
													×
												</button>
											</div>
										</div>
									)}
								</For>
							</div>
						</div>
					)}
				</For>
			</div>
		</>
	);
}

defineComponent("kanban-board", KanbanBoard);
