/**
 * Rift Framework Type Definitions
 */

// ============================================
// Reactive Primitives
// ============================================

/**
 * A reactive cell - a container for a value that can be observed
 */
export interface Cell<T> {
	/** Current value */
	v: T;
	/** Effect subscribers */
	e: Array<(value: T) => void>;
}

/**
 * Create a reactive cell
 */
export function cell<T>(initialValue: T): Cell<T>;

/**
 * Get the current value of a cell
 */
export function get<T>(cell: Cell<T>): T;

/**
 * Set a cell's value without triggering effects
 */
export function put<T>(cell: Cell<T>, value: T): void;

/**
 * Set a cell's value and trigger effects
 */
export function set<T>(cell: Cell<T>, value: T): void;

/**
 * Bind an effect function to a cell
 * @returns Unsubscribe function
 */
export function bind<T>(cell: Cell<T>, effect: (value: T) => void): () => void;

/**
 * Remove an effect from a cell
 */
export function unbind<T>(cell: Cell<T>, effect: (value: T) => void): void;

/**
 * Notify all effects bound to a cell
 */
export function notify<T>(cell: Cell<T>): void;

/**
 * Batch multiple updates - effects only run once after batch completes
 */
export function batch(fn: () => void): void;

// ============================================
// Template
// ============================================

/**
 * Create a template from an HTML string
 * @returns A function that clones the template
 */
export function template(html: string): () => Node;

// ============================================
// Event Delegation
// ============================================

/**
 * Register event types for delegation
 */
export function delegate(events: string[]): void;

/**
 * Set up event handling on a root element
 * @returns Cleanup function
 */
export function handle_root_events(target: EventTarget): () => void;

// ============================================
// Component Definition
// ============================================

/**
 * Define a custom element component
 */
export function defineComponent(tagName: string, fn: (this: HTMLElement) => void): void;

// ============================================
// List Rendering
// ============================================

export interface ForBlockState<T> {
	array: T[];
	items: Array<{ s: { start: Node; end: Node; cleanup?: () => void }; v: T }>;
}

export interface ForBlockController<T> {
	update: () => void;
	destroy: () => void;
	readonly state: ForBlockState<T>;
}

/**
 * Create a reactive for loop block
 */
export function for_block<T>(
	container: Element,
	source: Cell<T[]>,
	render: (anchor: Node, item: T, index: number) => { start: Node; end: Node; cleanup?: () => void }
): ForBlockController<T>;
