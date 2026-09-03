import {
	bind,
	defineComponent,
	delegate,
	forBlock,
	template,
	type Cell,
	type RoqaElement,
} from "roqa";
import type { Project } from "./model";
import { delegatedWith, expectElement, expectFragment, insertBefore } from "./dom";

interface ProjectNavProps extends Record<string, unknown> {
	projects: Cell<Project[]>;
	selectedProjectId: Cell<string>;
}

const navTemplate = template(
	'<nav class="project-nav" aria-label="Projects">' +
		'<div class="eyebrow">Workspace</div>' +
		"<h2>Projects</h2>" +
		'<ul class="project-list"></ul>' +
		"</nav>",
);

const projectTemplate = template(
	'<li><button class="project-button" type="button">' +
		'<span class="project-dot" aria-hidden="true"></span>' +
		'<span class="project-name"></span>' +
		"</button></li>",
);

function ProjectNav(this: RoqaElement, props: ProjectNavProps): void {
	const { projects, selectedProjectId } = props;

	const selectProject = (project: Project, _event: MouseEvent) => {
		this.emit("project-selected", { projectId: project.id });
	};

	this.connected(() => {
		const fragment = expectFragment(navTemplate(), "project-nav template");
		const nav = expectElement(fragment.firstElementChild, HTMLElement, "project nav");
		const list = expectElement(nav.lastElementChild, HTMLUListElement, "project list");

		const block = forBlock(list, projects, (anchor, project) => {
			const itemFragment = expectFragment(projectTemplate(), "project item template");
			const item = expectElement(itemFragment.firstElementChild, HTMLLIElement, "project item");
			const button = expectElement(item.firstElementChild, HTMLButtonElement, "project button");
			const dot = expectElement(button.firstElementChild, HTMLSpanElement, "project color");
			const name = expectElement(button.lastElementChild, HTMLSpanElement, "project name");

			dot.style.backgroundColor = project.color;
			name.textContent = project.name;
			button.__click = delegatedWith(selectProject, project);

			const unbindSelection = bind(selectedProjectId, (selectedId) => {
				const isSelected = selectedId === project.id;
				button.classList.toggle("is-selected", isSelected);
				button.setAttribute("aria-current", isSelected ? "page" : "false");
			});

			insertBefore(anchor, itemFragment);
			return { start: item, end: item, cleanup: unbindSelection };
		});

		this.append(fragment);
		return block.destroy;
	});
}

defineComponent<ProjectNavProps>("project-nav", ProjectNav);
delegate(["click"]);
