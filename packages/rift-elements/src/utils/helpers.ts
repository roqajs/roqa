/**
 * Helper to check if a prop is truthy (handles boolean attrs which may be "" or true)
 * @internal
 * @param value The value to check
 * @returns True if the value is truthy
 */
export function isTruthy(value: unknown): boolean {
	return value === true || value === "" || value === "true";
}