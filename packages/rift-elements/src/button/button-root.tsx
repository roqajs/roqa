import { defineComponent, cell, get, put, notify, type FormAssociatedRiftElement } from "rift-js";
import type { ButtonRootMethods, ButtonRootProps } from "./types";
import { isTruthy } from "../utils/helpers";

/**
 * A button component that can be used to trigger actions.
 * Renders a `<button-root>` custom element with proper accessibility attributes.
 * Supports form association for submit/reset functionality.
 *
 * @example
 * ```tsx
 * <button-root>Click me</button-root>
 * ```
 *
 * @example
 * ```tsx
 * // Disabled button that remains focusable (useful for loading states)
 * <button-root disabled focusableWhenDisabled>
 *   Loading...
 * </button-root>
 * ```
 *
 * @example
 * ```tsx
 * // Form submit button
 * <button-root type="submit" name="action" value="save">
 *   Save
 * </button-root>
 * ```
 */
export function ButtonRoot(
	this: FormAssociatedRiftElement<ButtonRootMethods>,
	props: ButtonRootProps,
) {
	// Create reactive cell for disabled state (will be initialized in connected)
	const disabledCell = cell(false);
	// Store focusableWhenDisabled state
	let focusableWhenDisabled = false;

	// Internal function to update disabled state
	const updateDisabledState = (disabled: boolean) => {
		put(disabledCell, disabled);

		// Update tabindex based on disabled and focusableWhenDisabled
		if (disabled && !focusableWhenDisabled) {
			this.setAttribute("tabindex", "-1");
		} else {
			this.setAttribute("tabindex", "0");
		}

		// Set disabled attribute for styling (custom attribute, not data-*)
		this.toggleAttr("disabled", disabled);

		// Set aria-disabled for assistive technologies
		if (disabled) {
			this.setAttribute("aria-disabled", "true");
		} else {
			this.removeAttribute("aria-disabled");
		}

		notify(disabledCell);
	};

	// Expose methods for external control
	this.getDisabled = () => get(disabledCell);

	this.setDisabled = (value: boolean) => {
		updateDisabledState(value);
	};

	// Expose internal cell for child components
	this._disabledCell = disabledCell;

	this.connected(() => {
		// Read boolean props - check props first, then fall back to HTML attributes
		// Static attributes like `disabled` are baked into the template HTML by Rift
		const disabledProp =
			props.disabled !== undefined ? isTruthy(props.disabled) : this.hasAttribute("disabled");
		focusableWhenDisabled =
			props.focusableWhenDisabled !== undefined
				? isTruthy(props.focusableWhenDisabled)
				: this.hasAttribute("focusablewhendisabled") || this.hasAttribute("focusableWhenDisabled");

		// Read form-related props or fallback to HTML attributes
		const type = props.type ?? (this.getAttribute("type") as ButtonRootProps["type"]) ?? "button";
		const name = props.name ?? this.getAttribute("name");
		const value = props.value ?? this.getAttribute("value");
		const formAction = props.formAction ?? this.getAttribute("formaction");
		const formEnctype =
			props.formEnctype ?? (this.getAttribute("formenctype") as ButtonRootProps["formEnctype"]);
		const formMethod =
			props.formMethod ?? (this.getAttribute("formmethod") as ButtonRootProps["formMethod"]);
		const formNoValidate =
			props.formNoValidate !== undefined
				? isTruthy(props.formNoValidate)
				: this.hasAttribute("formnovalidate");
		const formTarget = props.formTarget ?? this.getAttribute("formtarget");

		// Set role for accessibility (button role for non-native elements)
		this.setAttribute("role", "button");

		// Initialize disabled state with the resolved value
		put(disabledCell, disabledProp);
		updateDisabledState(disabledProp);

		// Handle click events
		this.on("click", (event: MouseEvent) => {
			// Prevent action if disabled
			if (get(disabledCell)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}

			// Handle form submission/reset
			// Try ElementInternals.form first, fall back to closest <form>
			const form = this.internals.form ?? this.closest("form");
			if (form) {
				if (type === "submit") {
					// Create a temporary native button to trigger form submission
					// This ensures proper handling of formAction, formMethod, etc.
					const submitter = document.createElement("button");
					submitter.type = "submit";
					submitter.style.display = "none";

					if (name) submitter.name = name;
					if (value) submitter.value = value;
					if (formAction) submitter.formAction = formAction;
					if (formEnctype) submitter.formEnctype = formEnctype;
					if (formMethod) submitter.formMethod = formMethod;
					if (formNoValidate) submitter.formNoValidate = formNoValidate;
					if (formTarget) submitter.formTarget = formTarget;

					form.appendChild(submitter);
					submitter.click();
					submitter.remove();
				} else if (type === "reset") {
					form.reset();
				}
			}
		});

		// Handle keyboard events for accessibility
		this.on("keydown", (event: KeyboardEvent) => {
			// Prevent action if disabled
			if (get(disabledCell)) {
				if (event.key === " " || event.key === "Enter") {
					event.preventDefault();
				}
				return;
			}

			// Trigger click on Enter or Space
			if (event.key === "Enter") {
				event.preventDefault();
				this.click();
			} else if (event.key === " ") {
				// Space should trigger on keyup, prevent scroll on keydown
				event.preventDefault();
			}
		});

		// Handle space key release (buttons activate on space keyup)
		this.on("keyup", (event: KeyboardEvent) => {
			if (get(disabledCell)) {
				return;
			}

			if (event.key === " ") {
				event.preventDefault();
				this.click();
			}
		});
	});

	// Handle external attribute changes
	this.attrChanged("disabled", (newValue) => {
		const isDisabled = newValue !== null;
		if (isDisabled !== get(disabledCell)) {
			updateDisabledState(isDisabled);
		}
	});
}

defineComponent("button-root", ButtonRoot, {
	formAssociated: true,
	observedAttributes: ["disabled"],
});
