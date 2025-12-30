import type { Cell } from "rift-js";

/**
 * The loading status of the avatar image.
 */
export type ImageLoadingStatus = "idle" | "loading" | "loaded" | "error";

export interface AvatarRootMethods {
	/**
	 * Get the current image loading status.
	 */
	getImageLoadingStatus: () => ImageLoadingStatus;
	/**
	 * Internal cell for child components to bind to image loading status.
	 */
	_imageLoadingStatusCell: Cell<ImageLoadingStatus>;
	/**
	 * Internal method for child components to set image loading status.
	 */
	_setImageLoadingStatus: (status: ImageLoadingStatus) => void;
}

export interface AvatarImageProps {
	/**
	 * The URL of the image to display.
	 */
	src?: string;
	/**
	 * Alternative text for the image.
	 */
	alt?: string;
	/**
	 * The width of the image.
	 */
	width?: string | number;
	/**
	 * The height of the image.
	 */
	height?: string | number;
	/**
	 * How the browser should handle cross-origin requests.
	 */
	crossOrigin?: "anonymous" | "use-credentials";
	/**
	 * The referrer policy for the image.
	 */
	referrerPolicy?: ReferrerPolicy;
}

export interface AvatarFallbackProps {
	/**
	 * How long to wait before showing the fallback. Specified in milliseconds.
	 */
	delay?: number;
}

/** Event detail for loading-status-change event */
export interface AvatarLoadingStatusChangeDetail {
	status: ImageLoadingStatus;
}
