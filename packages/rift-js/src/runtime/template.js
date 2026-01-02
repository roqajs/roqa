const { cloneNode } = Node.prototype;

/**
 * Create a template from an HTML string and return a clone function
 * @param {string} html - The HTML string to create a template from
 * @returns {() => Node} - A function that returns a deep clone of the template content
 */
export const template = (html) => {
	const t = document.createElement("template");
	t.innerHTML = html;
	return () => cloneNode.call(t.content, true);
};

/**
 * Create a template from an SVG string and return a clone function.
 * SVG elements must be created in the SVG namespace to render correctly.
 * @param {string} svg - The SVG string (can be a full <svg> or inner SVG content)
 * @returns {() => Node} - A function that returns a deep clone of the SVG content
 */
export const svgTemplate = (svg) => {
	// Wrap in an SVG element to ensure proper namespace parsing
	const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	wrapper.innerHTML = svg;

	// Use a document fragment to match the behavior of the regular template function
	// The traversal code expects to call .firstChild on the result
	const fragment = document.createDocumentFragment();
	while (wrapper.firstChild) {
		fragment.appendChild(wrapper.firstChild);
	}
	return () => cloneNode.call(fragment, true);
};
