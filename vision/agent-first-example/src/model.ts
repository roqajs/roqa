export interface Project {
	id: string;
	name: string;
	color: string;
}

export type TaskStatus = "todo" | "done";

export interface Task {
	id: number;
	projectId: string;
	title: string;
	status: TaskStatus;
}

export const initialProjects: Project[] = [
	{ id: "website", name: "Marketing site", color: "#7c3aed" },
	{ id: "runtime", name: "Runtime primitives", color: "#0891b2" },
	{ id: "skill", name: "Agent skill", color: "#ea580c" },
];

export const initialTasks: Task[] = [
	{ id: 1, projectId: "website", title: "Draft the launch page", status: "done" },
	{ id: 2, projectId: "website", title: "Review mobile navigation", status: "todo" },
	{ id: 3, projectId: "runtime", title: "Specify binding cleanup", status: "todo" },
	{ id: 4, projectId: "skill", title: "Write the list rendering recipe", status: "done" },
	{ id: 5, projectId: "skill", title: "Add accessibility checks", status: "todo" },
];
