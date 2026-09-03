import { bind, defineComponent, get, template, type Cell, type RoqaElement } from "roqa";
import type { Project, Task } from "./model";
import { expectElement, expectFragment } from "./dom";

interface ProgressSummaryProps extends Record<string, unknown> {
	projects: Cell<Project[]>;
	tasks: Cell<Task[]>;
	selectedProjectId: Cell<string>;
}

const summaryTemplate = template(
	'<section class="progress-card" aria-labelledby="progress-title">' +
		'<div><div class="eyebrow">Progress</div><h2 id="progress-title"></h2></div>' +
		'<strong class="progress-value"></strong>' +
		'<progress max="100" value="0"></progress>' +
		'<p class="progress-copy"></p>' +
		"</section>",
);

function ProgressSummary(this: RoqaElement, props: ProgressSummaryProps): void {
	const { projects, tasks, selectedProjectId } = props;

	this.connected(() => {
		const fragment = expectFragment(summaryTemplate(), "progress-summary template");
		const section = expectElement(fragment.firstElementChild, HTMLElement, "progress card");
		const headingGroup = expectElement(section.firstElementChild, HTMLDivElement, "heading group");
		const heading = expectElement(headingGroup.lastElementChild, HTMLHeadingElement, "heading");
		const value = expectElement(headingGroup.nextElementSibling, HTMLElement, "progress value");
		const progress = expectElement(value.nextElementSibling, HTMLProgressElement, "progress meter");
		const copy = expectElement(section.lastElementChild, HTMLParagraphElement, "progress copy");

		const render = () => {
			const projectId = get(selectedProjectId);
			const project = get(projects).find((candidate) => candidate.id === projectId);
			const projectTasks = get(tasks).filter((task) => task.projectId === projectId);
			const completed = projectTasks.filter((task) => task.status === "done").length;
			const percent =
				projectTasks.length === 0 ? 0 : Math.round((completed / projectTasks.length) * 100);

			heading.textContent = project?.name ?? "Unknown project";
			value.textContent = `${percent}%`;
			progress.value = percent;
			copy.textContent = `${completed} of ${projectTasks.length} tasks complete`;
		};

		const unbindProjects = bind(projects, render);
		const unbindTasks = bind(tasks, render);
		const unbindSelection = bind(selectedProjectId, render);

		this.append(fragment);
		return () => {
			unbindProjects();
			unbindTasks();
			unbindSelection();
		};
	});
}

defineComponent<ProgressSummaryProps>("progress-summary", ProgressSummary);
