import { defineComponent, type RiftElement } from "rift-js";
import type { AvatarRootMethods, AvatarImageProps, ImageLoadingStatus } from "./types";
import { setVisibility } from "../utils/helpers";

/**
 * The image to be displayed in the avatar.
 * Renders an `<avatar-image>` custom element containing an `<img>`.
 * Must be used as a child of `<avatar-root>`.
 *
 * The image is only shown when it has successfully loaded.
 *
 * @example
 * ```tsx
 * <avatar-root>
 *   <avatar-image src="https://example.com/avatar.jpg" alt="User avatar"></avatar-image>
 *   <avatar-fallback>AB</avatar-fallback>
 * </avatar-root>
 * ```
 */
export function AvatarImage(this: RiftElement, props: AvatarImageProps) {
	const src = props.src ?? this.getAttribute("src");
	const alt = props.alt ?? this.getAttribute("alt") ?? "Avatar image";
	const crossOrigin =
		props.crossOrigin ?? (this.getAttribute("crossorigin") as AvatarImageProps["crossOrigin"]);
	const referrerPolicy =
		props.referrerPolicy ?? (this.getAttribute("referrerpolicy") as ReferrerPolicy);

	this.connected(() => {
		const root = this.closest("avatar-root") as RiftElement<AvatarRootMethods> | null;
		if (!root) {
			console.warn("<avatar-image> must be used inside <avatar-root>");
			return;
		}

		// Helper to update status attribute and visibility
		const updateStatus = (status: ImageLoadingStatus) => {
			this.setAttribute("status", status);
			setVisibility(this, status === "loaded");
		};

		// If no src provided, mark as error and exit early
		if (!src) {
			root._setImageLoadingStatus("error");
			updateStatus("error");
			return;
		}

		const img = document.createElement("img");

		// Set up load/error handlers
		const handleLoad = () => {
			root._setImageLoadingStatus("loaded");
			updateStatus("loaded");
		};

		const handleError = () => {
			root._setImageLoadingStatus("error");
			updateStatus("error");
		};

		img.addEventListener("load", handleLoad);
		img.addEventListener("error", handleError);

		// Set properties on the img element
		if (props.width) img.width = Number(props.width);
		if (props.height) img.height = Number(props.height);
		if (crossOrigin) img.crossOrigin = crossOrigin;
		if (referrerPolicy) img.referrerPolicy = referrerPolicy;
		img.alt = alt;

		// Inherit styles for proper sizing
		img.style.width = "100%";
		img.style.height = "100%";
		img.style.objectFit = "cover";

		this.appendChild(img);

		// Set loading status before setting src
		root._setImageLoadingStatus("loading");
		updateStatus("loading");

		// Set src last to trigger loading (handlers are already attached)
		img.src = src;

		// Handle cached images that load synchronously
		if (img.complete && img.naturalWidth > 0) {
			handleLoad();
		}

		return () => {
			img.removeEventListener("load", handleLoad);
			img.removeEventListener("error", handleError);
			img.remove();
		};
	});
}

defineComponent("avatar-image", AvatarImage);
