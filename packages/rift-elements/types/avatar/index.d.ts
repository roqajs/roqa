import type { RiftElement } from "rift-js";

// Re-export types from source
export type {
	AvatarRootMethods,
	AvatarImageProps,
	AvatarFallbackProps,
	AvatarLoadingStatusChangeDetail,
	ImageLoadingStatus,
} from "../../src/avatar/types";

import type {
	AvatarRootMethods,
	AvatarImageProps,
	AvatarFallbackProps,
	AvatarLoadingStatusChangeDetail,
} from "../../src/avatar/types";

/**
 * The root avatar component that displays a user's profile picture, initials, or fallback icon.
 * Renders an `<avatar-root>` custom element.
 *
 * @example
 * ```tsx
 * <avatar-root>
 *   <avatar-image src="https://example.com/avatar.jpg" alt="User avatar"></avatar-image>
 *   <avatar-fallback>AB</avatar-fallback>
 * </avatar-root>
 * ```
 */
export declare function AvatarRoot(this: RiftElement<AvatarRootMethods>): void;

/**
 * The image to be displayed in the avatar.
 * Renders an `<avatar-image>` custom element containing an `<img>`.
 * Must be used as a child of `<avatar-root>`.
 *
 * @example
 * ```tsx
 * <avatar-root>
 *   <avatar-image src="https://example.com/avatar.jpg" alt="User avatar"></avatar-image>
 *   <avatar-fallback>AB</avatar-fallback>
 * </avatar-root>
 * ```
 */
export declare function AvatarImage(this: RiftElement, props: AvatarImageProps): void;

/**
 * Rendered when the image fails to load or when no image is provided.
 * Renders an `<avatar-fallback>` custom element.
 * Must be used as a child of `<avatar-root>`.
 *
 * @example
 * ```tsx
 * <avatar-root>
 *   <avatar-image src="https://example.com/avatar.jpg" alt="User avatar"></avatar-image>
 *   <avatar-fallback>AB</avatar-fallback>
 * </avatar-root>
 * ```
 */
export declare function AvatarFallback(this: RiftElement, props: AvatarFallbackProps): void;

// Augment JSX types for the avatar components
declare global {
	namespace JSX {
		interface IntrinsicElements {
			"avatar-root": {
				class?: string;
				children?: unknown;
				/** Event handler for when the image loading status changes */
				"onloading-status-change"?: (event: CustomEvent<AvatarLoadingStatusChangeDetail>) => void;
			};
			"avatar-image": AvatarImageProps & {
				class?: string;
			};
			"avatar-fallback": AvatarFallbackProps & {
				class?: string;
				children?: unknown;
			};
		}
	}
}
