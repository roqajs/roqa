import type { FormAssociatedRiftElement } from "rift-js";

// Re-export types from source
export type { ButtonRootProps, ButtonRootMethods } from "../../src/button/types";

import type { ButtonRootProps, ButtonRootMethods } from "../../src/button/types";

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
export declare function ButtonRoot(
	this: FormAssociatedRiftElement<ButtonRootMethods>,
	props: ButtonRootProps,
): void;

// Augment JSX types for the button component
declare global {
	namespace JSX {
		interface IntrinsicElements {
			"button-root": ButtonRootProps & {
				class?: string;
				children?: unknown;
				/** Event handler for click events */
				onclick?: (event: MouseEvent) => void;
			};
		}
	}
}
