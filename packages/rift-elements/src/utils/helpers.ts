/**
 * Helper to check if a prop is truthy (handles boolean attrs which may be "" or true)
 * @internal
 * @param value The value to check
 * @returns True if the value is truthy
 */
export function isTruthy(value: unknown): boolean {
	return value === true || value === "" || value === "true";
}

/**
 * Helper to set visibility of an element based on a condition.
 * Sets `display: none` when hidden, removes inline display style when visible.
 * @internal
 * @param element The element to update
 * @param visible Whether the element should be visible
 */
export function setVisibility(element: HTMLElement, visible: boolean): void {
	element.style.display = visible ? "" : "none";
}
