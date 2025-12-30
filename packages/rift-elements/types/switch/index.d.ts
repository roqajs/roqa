import type { FormAssociatedRiftElement, RiftElement } from "rift-js";

// Re-export types from source
export type {
	SwitchRootProps,
	SwitchRootMethods,
	SwitchCheckedChangeDetail,
} from "../../src/switch/types";

import type {
	SwitchRootProps,
	SwitchRootMethods,
	SwitchCheckedChangeDetail,
} from "../../src/switch/types";

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
export declare function SwitchRoot(
	this: FormAssociatedRiftElement<SwitchRootMethods>,
	props: SwitchRootProps,
): void;

/**
 * The movable part of the switch that indicates whether the switch is on or off.
 * Must be used as a child of `<switch-root>`.
 *
 * @example
 * ```tsx
 * <switch-root>
 *   <switch-thumb></switch-thumb>
 * </switch-root>
 * ```
 */
export declare function SwitchThumb(this: RiftElement): void;

// Augment JSX types for the switch components
declare global {
	namespace JSX {
		interface IntrinsicElements {
			"switch-root": SwitchRootProps & {
				class?: string;
				children?: unknown;
				/** Event handler for when the switch state changes */
				"onchecked-change"?: (event: CustomEvent<SwitchCheckedChangeDetail>) => void;
			};
			"switch-thumb": {
				class?: string;
			};
		}
	}
}
