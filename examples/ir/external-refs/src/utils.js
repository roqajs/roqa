/**
 * Format a timestamp as a human-readable date string.
 * @param {number} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
	if (!timestamp) return "N/A";
	return new Date(timestamp).toLocaleDateString();
}
