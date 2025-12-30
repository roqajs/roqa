import { defineComponent, cell, get, put, notify, type RiftElement } from "rift-js";
import type { AvatarRootMethods, ImageLoadingStatus } from "./types";

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
export function AvatarRoot(this: RiftElement<AvatarRootMethods>) {
	// Create reactive cell for image loading status
	const statusCell = cell<ImageLoadingStatus>("idle");

	// Internal function to update image loading status
	const setStatus = (status: ImageLoadingStatus) => {
		put(statusCell, status);
		this.setAttribute("status", status);
		notify(statusCell);
		this.emit("loading-status-change", { status });
	};

	// Expose methods for external control
	this.getImageLoadingStatus = () => get(statusCell);

	// Expose internal cell and setter for child components
	this._imageLoadingStatusCell = statusCell;
	this._setImageLoadingStatus = setStatus;

	// Set initial status attribute
	this.setAttribute("status", get(statusCell));
}

defineComponent("avatar-root", AvatarRoot);
