/** Set of Roqa framework imports that are consumed during translation */
export const ROQA_IMPORTS = new Set([
	"cell",
	"get",
	"set",
	"put",
	"bind",
	"notify",
	"subscribe",
	"defineComponent",
	"For",
	"Show",
	"template",
	"svgTemplate",
	"delegate",
	"handleRootEvents",
	"forBlock",
	"showBlock",
	"setProp",
	"getProps",
]);

/** Set of known JavaScript globals (not component-scoped) */
export const KNOWN_GLOBALS = new Set([
	"Math",
	"console",
	"JSON",
	"Date",
	"Number",
	"String",
	"Boolean",
	"Array",
	"Object",
	"Map",
	"Set",
	"WeakMap",
	"WeakSet",
	"Promise",
	"Error",
	"TypeError",
	"RangeError",
	"RegExp",
	"Symbol",
	"parseInt",
	"parseFloat",
	"isNaN",
	"isFinite",
	"NaN",
	"Infinity",
	"undefined",
	"globalThis",
	"window",
	"document",
	"navigator",
	"location",
	"history",
	"localStorage",
	"sessionStorage",
	"fetch",
	"setTimeout",
	"setInterval",
	"clearTimeout",
	"clearInterval",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"alert",
	"confirm",
	"prompt",
	"performance",
	"queueMicrotask",
	"structuredClone",
	"URL",
	"URLSearchParams",
	"FormData",
	"Headers",
	"Request",
	"Response",
	"AbortController",
	"AbortSignal",
	"Event",
	"CustomEvent",
	"KeyboardEvent",
	"MouseEvent",
	"InputEvent",
	"DOMRect",
	"HTMLElement",
	"HTMLInputElement",
	"HTMLSelectElement",
	"HTMLTextAreaElement",
	"SVGElement",
	"MutationObserver",
	"ResizeObserver",
	"IntersectionObserver",
]);

/**
 * Normalize an event attribute name to a DOM event name.
 * Strips "on"/"on" prefix and lowercases the rest.
 *
 * @param {string} name - e.g., "onClick", "onclick", "onKeyDown"
 * @returns {string} - e.g., "click", "click", "keydown"
 */
export function normalizeEventName(name) {
	if (name.startsWith("on")) {
		return name.slice(2).toLowerCase();
	}
	return name.toLowerCase();
}

/**
 * Check if a JSX attribute name is an event handler.
 * @param {string} name
 * @returns {boolean}
 */
export function isEventAttribute(name) {
	return /^on[A-Z]/.test(name) || /^on[a-z]/.test(name);
}

/**
 * Convert a PascalCase component name to a kebab-case tag name.
 * @param {string} name
 * @returns {string}
 */
export function toKebabCase(name) {
	return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}
