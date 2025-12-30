import { defineComponent, cell, get, put, notify, type FormAssociatedRiftElement } from "rift-js";
import type { SwitchRootMethods, SwitchRootProps } from "./types";
import { isTruthy } from "../utils/helpers";

/**
 * The root switch component that represents the switch itself.
 * Sets proper ARIA attributes and participates in form submission via ElementInternals.
 *
 * @example
 * ```tsx
 * <switch-root defaultChecked>
 *   <switch-thumb></switch-thumb>
 * </switch-root>
 * ```
 */
export function SwitchRoot(
	this: FormAssociatedRiftElement<SwitchRootMethods>,
	props: SwitchRootProps,
) {
	// Normalize boolean props (handles both prop={true} and bare attributes)
	const checkedProp = props.checked;
	const defaultChecked = isTruthy(props.defaultChecked);

	// Read name/value from props or fallback to HTML attributes (for static string values)
	const name = props.name ?? this.getAttribute("name");
	const value = props.value ?? this.getAttribute("value") ?? "on";

	// Determine initial value: controlled prop takes precedence, then defaultChecked
	const initialChecked = checkedProp !== undefined ? isTruthy(checkedProp) : defaultChecked;

	// Create reactive cells for all state (allows children to subscribe)
	const checkedCell = cell(initialChecked);
	const disabledCell = cell(isTruthy(props.disabled));
	const readOnlyCell = cell(isTruthy(props.readOnly));
	const requiredCell = cell(isTruthy(props.required));

	// Helper to check if interaction is allowed
	const canInteract = () => !get(disabledCell) && !get(readOnlyCell);

	// Helper to update form value via ElementInternals
	const updateFormValue = (checked: boolean) => {
		if (name) {
			// When checked, submit the value; when unchecked, submit null
			this.internals.setFormValue(checked ? value : null);
		}
	};

	// Helper to update form validity
	const updateValidity = (checked: boolean, required: boolean) => {
		if (required && !checked) {
			this.internals.setValidity({ valueMissing: true }, "Please toggle the switch", this);
		} else {
			this.internals.setValidity({});
		}
	};

	// Internal function to update checked state and notify subscribers
	const updateCheckedState = (checked: boolean) => {
		put(checkedCell, checked);
		// Update DOM attributes on this element
		this.setAttribute("aria-checked", String(checked));
		this.stateAttr("checked", checked);
		// Update form value and validity
		updateFormValue(checked);
		updateValidity(checked, get(requiredCell));
		// Notify all subscribers (like switch-thumb)
		notify(checkedCell);
	};

	// Internal function to update disabled state
	const updateDisabledState = (disabled: boolean) => {
		put(disabledCell, disabled);
		this.setAttribute("tabindex", disabled ? "-1" : "0");
		this.toggleAttr("disabled", disabled);
		if (disabled) {
			this.setAttribute("aria-disabled", "true");
		} else {
			this.removeAttribute("aria-disabled");
		}
		notify(disabledCell);
	};

	// Internal function to update readonly state
	const updateReadOnlyState = (readOnly: boolean) => {
		put(readOnlyCell, readOnly);
		this.toggleAttr("readonly", readOnly);
		if (readOnly) {
			this.setAttribute("aria-readonly", "true");
		} else {
			this.removeAttribute("aria-readonly");
		}
		notify(readOnlyCell);
	};

	// Internal function to update required state
	const updateRequiredState = (required: boolean) => {
		put(requiredCell, required);
		this.toggleAttr("required", required);
		if (required) {
			this.setAttribute("aria-required", "true");
		} else {
			this.removeAttribute("aria-required");
		}
		// Re-validate with new required state
		updateValidity(get(checkedCell), required);
		notify(requiredCell);
	};

	// Expose methods for external control
	this.toggle = () => {
		if (!canInteract()) return;
		const newValue = !get(checkedCell);
		updateCheckedState(newValue);
		this.emit("checked-change", { checked: newValue });
	};

	this.setChecked = (value: boolean) => {
		if (!canInteract()) return;
		updateCheckedState(value);
		this.emit("checked-change", { checked: value });
	};

	this.getChecked = () => get(checkedCell);

	// Expose internal cells for child components (like switch-thumb)
	this._checkedCell = checkedCell;
	this._disabledCell = disabledCell;
	this._readOnlyCell = readOnlyCell;
	this._requiredCell = requiredCell;

	this.connected(() => {
		// Set role (never changes)
		this.setAttribute("role", "switch");

		// Initialize all state using update functions
		updateDisabledState(get(disabledCell));
		updateReadOnlyState(get(readOnlyCell));
		updateRequiredState(get(requiredCell));
		updateCheckedState(get(checkedCell));

		// Handle click events
		this.on("click", () => {
			this.toggle();
		});

		// Handle keyboard events for accessibility
		this.on("keydown", (event: KeyboardEvent) => {
			if (event.key === " " || event.key === "Enter") {
				event.preventDefault();
				this.toggle();
			}
		});

		// Handle form reset
		this.on("form-reset", () => {
			updateCheckedState(defaultChecked);
		});
	});

	// Handle external attribute changes (controlled mode)
	this.attrChanged("checked", (newValue) => {
		const isChecked = newValue !== null;
		if (isChecked !== get(checkedCell)) {
			updateCheckedState(isChecked);
		}
	});

	this.attrChanged("disabled", (newValue) => {
		const isDisabled = newValue !== null;
		if (isDisabled !== get(disabledCell)) {
			updateDisabledState(isDisabled);
		}
	});

	this.attrChanged("readonly", (newValue) => {
		const isReadOnly = newValue !== null;
		if (isReadOnly !== get(readOnlyCell)) {
			updateReadOnlyState(isReadOnly);
		}
	});

	this.attrChanged("required", (newValue) => {
		const isRequired = newValue !== null;
		if (isRequired !== get(requiredCell)) {
			updateRequiredState(isRequired);
		}
	});
}

defineComponent("switch-root", SwitchRoot, {
	formAssociated: true,
	observedAttributes: ["checked", "disabled", "readonly", "required"],
});
