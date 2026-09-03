import {
	bind,
	cell,
	defineComponent,
	delegate,
	forBlock,
	get,
	set,
	showBlock,
	template,
	type Cell,
	type RoqaElement,
} from "roqa";
import type { Project, Task } from "./model";
import { delegatedWith, expectElement, expectFragment, insertBefore } from "./dom";

interface TaskBoardProps extends Record<string, unknown> {
	projects: Cell<Project[]>;
	tasks: Cell<Task[]>;
	selectedProjectId: Cell<string>;
}

const boardTemplate = template(
	'<section class="task-panel" aria-labelledby="task-list-title">' +
		'<div class="task-panel-heading">' +
		'<div><div class="eyebrow">Current project</div><h2 id="task-list-title"></h2></div>' +
		'<span class="task-count"></span>' +
		"</div>" +
		'<div class="empty-region"></div>' +
		'<ul class="task-list"></ul>' +
		"</section>",
);

const emptyTemplate = template(
	'<div class="empty-state"><strong>No tasks yet</strong><span>Add the first task above.</span></div>',
);

const taskTemplate = template(
	'<li class="task-item">' +
		'<label><input type="checkbox" /><span></span></label>' +
		'<button class="delete-button" type="button" aria-label="Delete task">Delete</button>' +
		"</li>",
);

function TaskBoard(this: RoqaElement, props: TaskBoardProps): void {
	const { projects, tasks, selectedProjectId } = props;
	const visibleTasks = cell<Task[]>([]);

	const syncVisibleTasks = () => {
		const projectId = get(selectedProjectId);
		set(
			visibleTasks,
			get(tasks).filter((task) => task.projectId === projectId),
		);
	};

	const toggleTask = (task: Task, _event: Event) => {
		this.emit("task-toggled", { taskId: task.id });
	};

	const deleteTask = (task: Task, _event: MouseEvent) => {
		this.emit("task-deleted", { taskId: task.id });
	};

	this.connected(() => {
		const fragment = expectFragment(boardTemplate(), "task-board template");
		const section = expectElement(fragment.firstElementChild, HTMLElement, "task panel");
		const headingRow = expectElement(section.firstElementChild, HTMLDivElement, "task heading row");
		const headingGroup = expectElement(
			headingRow.firstElementChild,
			HTMLDivElement,
			"task heading group",
		);
		const heading = expectElement(
			headingGroup.lastElementChild,
			HTMLHeadingElement,
			"task heading",
		);
		const count = expectElement(headingRow.lastElementChild, HTMLSpanElement, "task count");
		const emptyRegion = expectElement(
			headingRow.nextElementSibling,
			HTMLDivElement,
			"empty region",
		);
		const list = expectElement(section.lastElementChild, HTMLUListElement, "task list");

		const unbindTasks = bind(tasks, syncVisibleTasks);
		const unbindSelection = bind(selectedProjectId, syncVisibleTasks);

		const unbindHeading = bind(selectedProjectId, (projectId) => {
			const project = get(projects).find((candidate) => candidate.id === projectId);
			heading.textContent = project?.name ?? "Tasks";
		});

		const unbindCount = bind(visibleTasks, (currentTasks) => {
			count.textContent = `${currentTasks.length} ${currentTasks.length === 1 ? "task" : "tasks"}`;
		});

		const empty = showBlock(
			emptyRegion,
			() => get(visibleTasks).length === 0,
			(anchor) => {
				const emptyFragment = expectFragment(emptyTemplate(), "empty-state template");
				const state = expectElement(emptyFragment.firstElementChild, HTMLDivElement, "empty state");
				insertBefore(anchor, emptyFragment);
				return { start: state, end: state };
			},
			[visibleTasks],
		);

		const listBlock = forBlock(list, visibleTasks, (anchor, task) => {
			const itemFragment = expectFragment(taskTemplate(), "task-item template");
			const item = expectElement(itemFragment.firstElementChild, HTMLLIElement, "task item");
			const label = expectElement(item.firstElementChild, HTMLLabelElement, "task label");
			const checkbox = expectElement(label.firstElementChild, HTMLInputElement, "task checkbox");
			const title = expectElement(label.lastElementChild, HTMLSpanElement, "task title");
			const deleteButton = expectElement(item.lastElementChild, HTMLButtonElement, "delete button");

			checkbox.checked = task.status === "done";
			title.textContent = task.title;
			item.classList.toggle("is-complete", checkbox.checked);
			checkbox.__change = delegatedWith(toggleTask, task);
			deleteButton.__click = delegatedWith(deleteTask, task);

			insertBefore(anchor, itemFragment);
			return { start: item, end: item };
		});

		this.append(fragment);
		return () => {
			unbindTasks();
			unbindSelection();
			unbindHeading();
			unbindCount();
			empty.destroy();
			listBlock.destroy();
		};
	});
}

defineComponent<TaskBoardProps>("task-board", TaskBoard);
delegate(["change", "click"]);
