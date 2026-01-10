import _traverse from "@babel/traverse";

/**
 * Shared utilities for the Roqa compiler
 */

// Handle CJS/ESM interop for @babel/traverse
export const traverse = _traverse.default || _traverse;

/**
 * Compiler constants to avoid magic strings
 */
export const CONSTANTS = {
	/** Prefix for delegated event handlers (e.g., __click) */
	EVENT_PREFIX: "__",
	/** Prefix for cell refs used in inline updates (e.g., ref_1) */
	REF_PREFIX: "ref_",
	/** Prefix for template variables (e.g., $tmpl_1) */
	TEMPLATE_PREFIX: "$tmpl_",
	/** Prefix for root variables (e.g., $root_1) */
	ROOT_PREFIX: "$root_",
	/** Internal key used for root variable counter */
	ROOT_COUNTER_KEY: "$root",
};

/**
 * Escape single quotes and backslashes in template strings
 * @param {string} str
 * @returns {string}
 */
export function escapeTemplateString(str) {
	return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Escape special characters in a string literal
 * @param {string} str
 * @returns {string}
 */
export function escapeStringLiteral(str) {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Escape attribute values
 * @param {string} str
 * @returns {string}
 */
export function escapeAttr(str) {
	return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
