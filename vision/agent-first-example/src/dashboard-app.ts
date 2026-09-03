import { bind, cell, defineComponent, get, set, setProp, template, type RoqaElement } from "roqa";
import { expectElement, expectFragment } from "./dom";
import { initialProjects, initialTasks, type Task } from "./model";
import "./progress-summary";
import "./project-nav";
import "./task-board";
import "./task-composer";

const dashboardTemplate = template(
	'<main class="app-shell">' +
		'<header class="app-header">' +
		'<div><div class="eyebrow">Agent-first prototype</div><h1>Project dashboard</h1></div>' +
		'<p class="current-project"></p>' +
		"</header>" +
		'<div class="app-layout">' +
		"<project-nav></project-nav>" +
		'<section class="workspace" aria-label="Selected project">' +
		"<progress-summary></progress-summary>" +
		"<task-composer></task-composer>" +
		"<task-board></task-board>" +
		"</section>" +
		"</div>" +
		"</main>",
);

function DashboardApp(this: RoqaElement): void {
	const projects = cell(initialProjects);
	const tasks = cell(initialTasks);
	const selectedProjectId = cell(initialProjects[0].id);
	let nextTaskId = Math.max(...initialTasks.map((task) => task.id)) + 1;

	this.on<{ projectId: string }>("project-selected", (event) => {
		const exists = get(projects).some((project) => project.id === event.detail.projectId);
		if (!exists) {
			throw new Error(`Cannot select unknown project "${event.detail.projectId}"`);
		}
		set(selectedProjectId, event.detail.projectId);
	});

	this.on<{ title: string }>("task-created", (event) => {
		const projectId = get(selectedProjectId);
		if (projectId.length === 0) {
			throw new Error("Cannot create a task without a selected project");
		}
		const task: Task = {
			id: nextTaskId++,
			projectId,
			title: event.detail.title,
			status: "todo",
		};
		set(tasks, [...get(tasks), task]);
	});

	this.on<{ taskId: number }>("task-toggled", (event) => {
		let found = false;
		const nextTasks = get(tasks).map((task) => {
			if (task.id !== event.detail.taskId) return task;
			found = true;
			return { ...task, status: task.status === "done" ? "todo" : "done" } satisfies Task;
		});
		if (!found) {
			throw new Error(`Cannot toggle unknown task ${event.detail.taskId}`);
		}
		set(tasks, nextTasks);
	});

	this.on<{ taskId: number }>("task-deleted", (event) => {
		const currentTasks = get(tasks);
		const nextTasks = currentTasks.filter((task) => task.id !== event.detail.taskId);
		if (nextTasks.length === currentTasks.length) {
			throw new Error(`Cannot delete unknown task ${event.detail.taskId}`);
		}
		set(tasks, nextTasks);
	});

	this.connected(() => {
		const fragment = expectFragment(dashboardTemplate(), "dashboard template");
		const main = expectElement(fragment.firstElementChild, HTMLElement, "app shell");
		const header = expectElement(main.firstElementChild, HTMLElement, "app header");
		const currentProject = expectElement(
			header.lastElementChild,
			HTMLParagraphElement,
			"current project",
		);
		const layout = expectElement(main.lastElementChild, HTMLDivElement, "app layout");
		const projectNav = expectElement(
			layout.firstElementChild,
			HTMLElement,
			"project navigation component",
		);
		const workspace = expectElement(layout.lastElementChild, HTMLElement, "project workspace");
		const progressSummary = expectElement(
			workspace.firstElementChild,
			HTMLElement,
			"progress component",
		);
		const taskComposer = expectElement(
			progressSummary.nextElementSibling,
			HTMLElement,
			"task composer component",
		);
		const taskBoard = expectElement(
			workspace.lastElementChild,
			HTMLElement,
			"task board component",
		);

		setProp(projectNav, "projects", projects);
		setProp(projectNav, "selectedProjectId", selectedProjectId);

		setProp(progressSummary, "projects", projects);
		setProp(progressSummary, "tasks", tasks);
		setProp(progressSummary, "selectedProjectId", selectedProjectId);

		setProp(taskComposer, "selectedProjectId", selectedProjectId);

		setProp(taskBoard, "projects", projects);
		setProp(taskBoard, "tasks", tasks);
		setProp(taskBoard, "selectedProjectId", selectedProjectId);

		const unbindProjectName = bind(selectedProjectId, (projectId) => {
			const project = get(projects).find((candidate) => candidate.id === projectId);
			currentProject.textContent = project ? `Viewing ${project.name}` : "No project selected";
		});

		this.append(fragment);
		return unbindProjectName;
	});
}

defineComponent("agent-dashboard", DashboardApp);
