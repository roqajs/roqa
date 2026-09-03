type ElementConstructor<T extends Element> = new () => T;

export function expectFragment(node: Node, label: string): DocumentFragment {
	if (!(node instanceof DocumentFragment)) {
		throw new TypeError(`${label} must be a DocumentFragment`);
	}
	return node;
}

export function expectElement<T extends Element>(
	element: Element | null,
	constructor: ElementConstructor<T>,
	label: string,
): T {
	if (!(element instanceof constructor)) {
		throw new TypeError(`${label} did not resolve to ${constructor.name}`);
	}
	return element;
}

export function insertBefore(anchor: Node, content: Node): void {
	const parent = anchor.parentNode;
	if (!parent) {
		throw new Error("Cannot insert content before a detached block anchor");
	}
	parent.insertBefore(content, anchor);
}

export function delegated<E extends Event>(handler: (event: E) => void): (event: E) => void {
	return handler;
}

export function delegatedWith<T, E extends Event>(
	handler: (value: T, event: E) => void,
	value: T,
): [(value: T, event: E) => void, T] {
	return [handler, value];
}
