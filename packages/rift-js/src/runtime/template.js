// ============================================
// Template primitive
// ============================================

const { cloneNode } = Node.prototype;

/**
 * Create a template from an HTML string and return a clone function
 * @param {string} html - The HTML string to create a template from
 * @returns {() => Node} - A function that returns a deep clone of the template content
 */
export const template = (html) => {
	const t = document.createElement('template');
	t.innerHTML = html;
	return () => cloneNode.call(t.content, true);
};
