import { bind, defineComponent, delegate, template, type Cell, type RoqaElement } from "roqa";
import { delegated, expectElement, expectFragment } from "./dom";

interface TaskComposerProps extends Record<string, unknown> {
	selectedProjectId: Cell<string>;
}

const composerTemplate = template(
	'<form class="task-composer">' +
		'<label for="new-task">New task</label>' +
		'<div class="composer-row">' +
		'<input id="new-task" name="title" autocomplete="off" placeholder="What needs doing?" required />' +
		'<button type="submit">Add task</button>' +
		"</div>" +
		"</form>",
);

function TaskComposer(this: RoqaElement, props: TaskComposerProps): void {
	const { selectedProjectId } = props;

	this.connected(() => {
		const fragment = expectFragment(composerTemplate(), "task-composer template");
		const form = expectElement(fragment.firstElementChild, HTMLFormElement, "task form");
		const row = expectElement(form.lastElementChild, HTMLDivElement, "composer row");
		const input = expectElement(row.firstElementChild, HTMLInputElement, "task title");
		const submit = expectElement(row.lastElementChild, HTMLButtonElement, "submit button");

		form.__submit = delegated((event: SubmitEvent) => {
			event.preventDefault();
			const title = input.value.trim();
			if (title.length === 0) {
				input.focus();
				return;
			}
			this.emit("task-created", { title });
			form.reset();
			input.focus();
		});

		const unbindSelection = bind(selectedProjectId, (projectId) => {
			const disabled = projectId.length === 0;
			input.disabled = disabled;
			submit.disabled = disabled;
		});

		this.append(fragment);
		return unbindSelection;
	});
}

defineComponent<TaskComposerProps>("task-composer", TaskComposer);
delegate(["submit"]);
