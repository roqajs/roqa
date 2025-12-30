// Avatar component exports
export { AvatarRoot } from "./avatar-root";
export { AvatarImage } from "./avatar-image";
export { AvatarFallback } from "./avatar-fallback";
export type {
	AvatarRootMethods,
	AvatarImageProps,
	AvatarFallbackProps,
	AvatarLoadingStatusChangeDetail,
	ImageLoadingStatus,
} from "./types";

// Side effect import to register the custom elements
import "./avatar-root";
import "./avatar-image";
import "./avatar-fallback";
