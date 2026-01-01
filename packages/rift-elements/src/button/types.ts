import type { Cell } from "rift-js";

export interface ButtonRootProps {
	/**
	 * Whether the button should ignore user interaction.
	 * @default false
	 */
	disabled?: boolean;
	/**
	 * Whether the button should remain focusable when disabled.
	 * Useful for loading states to maintain focus and tab order.
	 * @default false
	 */
	focusableWhenDisabled?: boolean;
	/**
	 * The type of button. Only applicable for native buttons.
	 * @default "button"
	 */
	type?: "button" | "submit" | "reset";
	/**
	 * Identifies the field when a form is submitted.
	 */
	name?: string;
	/**
	 * The value submitted with the form.
	 */
	value?: string;
	/**
	 * The id of the button element.
	 */
	id?: string;
	/**
	 * The URL that processes the form submission. Only applicable when type="submit".
	 */
	formAction?: string;
	/**
	 * The encoding type for form submission. Only applicable when type="submit".
	 */
	formEnctype?: "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain";
	/**
	 * The HTTP method for form submission. Only applicable when type="submit".
	 */
	formMethod?: "get" | "post";
	/**
	 * Whether to skip form validation on submission. Only applicable when type="submit".
	 */
	formNoValidate?: boolean;
	/**
	 * Where to display the response after form submission. Only applicable when type="submit".
	 */
	formTarget?: "_self" | "_blank" | "_parent" | "_top" | string;
}

export interface ButtonRootMethods {
	/**
	 * Get the current disabled state.
	 */
	getDisabled: () => boolean;
	/**
	 * Set the disabled state programmatically.
	 */
	setDisabled: (value: boolean) => void;
	/**
	 * Internal cell for child components to bind to disabled state.
	 */
	_disabledCell: Cell<boolean>;
}
