import type { Cell } from "rift-js";

export interface SwitchRootProps {
	/**
	 * Whether the switch is currently active.
	 * To render an uncontrolled switch, use the `defaultChecked` prop instead.
	 */
	checked?: boolean;
	/**
	 * Whether the switch is initially active.
	 * To render a controlled switch, use the `checked` prop instead.
	 * @default false
	 */
	defaultChecked?: boolean;
	/**
	 * Whether the component should ignore user interaction.
	 * @default false
	 */
	disabled?: boolean;
	/**
	 * Whether the user should be unable to activate or deactivate the switch.
	 * @default false
	 */
	readOnly?: boolean;
	/**
	 * Whether the user must activate the switch before submitting a form.
	 * @default false
	 */
	required?: boolean;
	/**
	 * Identifies the field when a form is submitted.
	 */
	name?: string;
	/**
	 * The value submitted with the form when the switch is checked.
	 * @default "on"
	 */
	value?: string;
	/**
	 * The id of the switch element.
	 */
	id?: string;
}

export interface SwitchRootMethods {
	/**
	 * Toggle the switch state
	 */
	toggle: () => void;
	/**
	 * Set the checked state
	 */
	setChecked: (value: boolean) => void;
	/**
	 * Get the current checked state
	 */
	getChecked: () => boolean;
	/**
	 * Internal cell for child components to bind to checked state
	 */
	_checkedCell: Cell<boolean>;
	/**
	 * Internal cell for child components to bind to disabled state
	 */
	_disabledCell: Cell<boolean>;
	/**
	 * Internal cell for child components to bind to readonly state
	 */
	_readOnlyCell: Cell<boolean>;
	/**
	 * Internal cell for child components to bind to required state
	 */
	_requiredCell: Cell<boolean>;
}

/** Event detail for checked-change event */
export interface SwitchCheckedChangeDetail {
	checked: boolean;
}
