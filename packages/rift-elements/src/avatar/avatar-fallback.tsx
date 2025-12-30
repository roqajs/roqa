import { defineComponent, bind, get, type RiftElement } from "rift-js";
import type { AvatarRootMethods, AvatarFallbackProps, ImageLoadingStatus } from "./types";
import { setVisibility } from "../utils/helpers";

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
 *
 * @example With delay
 * ```tsx
 * <avatar-root>
 *   <avatar-image src="https://example.com/avatar.jpg" alt="User avatar"></avatar-image>
 *   <avatar-fallback delay={500}>AB</avatar-fallback>
 * </avatar-root>
 * ```
 */
export function AvatarFallback(this: RiftElement, props: AvatarFallbackProps) {
	const delay =
		props.delay ?? (this.hasAttribute("delay") ? Number(this.getAttribute("delay")) : undefined);

	this.connected(() => {
		const root = this.closest("avatar-root") as RiftElement<AvatarRootMethods> | null;
		if (!root) {
			console.warn("<avatar-fallback> must be used inside <avatar-root>");
			return;
		}

		let delayPassed = delay === undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		// Helper to update visibility based on loading status and delay
		const updateStatus = (status: ImageLoadingStatus) => {
			this.setAttribute("status", status);
			setVisibility(this, status !== "loaded" && delayPassed);
		};

		// Start with hidden if delay is set
		if (!delayPassed) {
			setVisibility(this, false);
		}

		// If delay is set, start the timer
		if (delay !== undefined) {
			timeoutId = setTimeout(() => {
				delayPassed = true;
				updateStatus(get(root._imageLoadingStatusCell));
			}, delay);
		}

		// Update visibility based on initial status
		updateStatus(get(root._imageLoadingStatusCell));

		// Bind to status changes
		const unbindStatus = bind(root._imageLoadingStatusCell, updateStatus);

		return () => {
			unbindStatus();
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
		};
	});
}

defineComponent("avatar-fallback", AvatarFallback);
