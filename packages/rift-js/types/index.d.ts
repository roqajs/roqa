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
 * Create a reactive cell with a static value
 */
export function cell<T>(initialValue: T): Cell<T>;

/**
 * Helper type to unwrap the return type of a function stored in a cell.
 * If T is a function, returns its return type. Otherwise returns T.
 */
type Unwrap<T> = T extends () => infer R ? R : T;

/**
 * Get the current value of a cell.
 * If the cell contains a function (derived cell), the function is executed
 * and its return value is returned.
 */
export function get<T>(cell: Cell<T>): Unwrap<T>;

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
 * Notify all effects bound to a cell
 */
export function notify<T>(cell: Cell<T>): void;

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
 * Props object passed to component functions
 */
export type ComponentProps = Record<string, unknown>;

/**
 * Options for emitting custom events
 */
export interface EmitOptions {
	/** Whether the event bubbles up through the DOM. Default: true */
	bubbles?: boolean;
	/** Whether the event can cross shadow DOM boundaries. Default: false */
	composed?: boolean;
}

/**
 * The custom element instance passed as `this` to component functions.
 * Use this type to annotate the `this` parameter in your component functions.
 *
 * The generic parameter `T` allows you to specify additional properties that
 * will be attached to the element at runtime (e.g., methods for other components to call).
 *
 * @example
 * ```tsx
 * import { defineComponent, type RiftElement } from "rift-js";
 *
 * // Basic usage
 * function MyComponent(this: RiftElement) {
 *   this.connected(() => console.log("Connected!"));
 *   return <div>Hello</div>;
 * }
 *
 * // With custom methods attached at runtime
 * interface CounterMethods {
 *   setCount: (value: number) => void;
 *   reset: () => void;
 * }
 *
 * function Counter(this: RiftElement<CounterMethods>) {
 *   const count = cell(0);
 *   this.setCount = (value) => set(count, value);
 *   this.reset = () => set(count, 0);
 *   return <p>Count: {get(count)}</p>;
 * }
 *
 * defineComponent("my-component", MyComponent);
 * defineComponent("x-counter", Counter);
 * ```
 */
export type RiftElement<T extends object = {}> = HTMLElement & RiftElementMethods & T;

/**
 * A form-associated Rift element with access to ElementInternals.
 * Use this type when your component has `formAssociated: true`.
 *
 * @example
 * ```tsx
 * function MyInput(this: FormAssociatedRiftElement<MyInputMethods>, props: MyInputProps) {
 *   this.connected(() => {
 *     // Access form internals
 *     this.internals.setFormValue(value);
 *     this.internals.setValidity({ valueMissing: true }, "Required");
 *   });
 * }
 *
 * defineComponent("my-input", MyInput, { formAssociated: true });
 * ```
 */
export type FormAssociatedRiftElement<T extends object = {}> = RiftElement<T> & {
	/**
	 * The ElementInternals object for form association.
	 * Provides access to form submission, validation, and accessibility features.
	 */
	internals: ElementInternals;
};

/**
 * Methods available on all Rift custom elements
 */
export interface RiftElementMethods {
	/**
	 * Register a callback to run when the component is connected to the DOM.
	 * Multiple callbacks can be registered and will run in order.
	 *
	 * If the callback returns a function, it will be called when the component
	 * disconnects (useful for cleanup like unsubscribing from cells).
	 *
	 * @example
	 * ```tsx
	 * this.connected(() => {
	 *   const unbind = bind(someCell, (value) => {
	 *     // react to changes
	 *   });
	 *   // Return cleanup function
	 *   return unbind;
	 * });
	 * ```
	 */
	connected(callback: () => void | (() => void)): void;

	/**
	 * Register a callback to run when the component is disconnected from the DOM.
	 * Use this for cleanup (removing event listeners, canceling timers, etc.)
	 */
	disconnected(callback: () => void): void;

	/**
	 * Add an event listener that is automatically removed when the component disconnects.
	 * This is a convenience wrapper around addEventListener with AbortController.
	 *
	 * Supports both native DOM events and custom events:
	 * ```tsx
	 * // Native DOM events are automatically typed
	 * this.on("click", (event) => {
	 *   console.log(event.clientX); // MouseEvent
	 * });
	 *
	 * this.on("keydown", (event) => {
	 *   console.log(event.key); // KeyboardEvent
	 * });
	 *
	 * // Custom events with typed detail
	 * this.on<{ count: number }>("count-changed", (event) => {
	 *   console.log(event.detail.count); // CustomEvent<{ count: number }>
	 * });
	 * ```
	 */
	on<K extends keyof HTMLElementEventMap>(
		eventName: K,
		handler: (event: HTMLElementEventMap[K]) => void,
	): void;
	on<T = unknown>(eventName: string, handler: (event: CustomEvent<T>) => void): void;

	/**
	 * Emit a custom event from this component.
	 * @param eventName - The name of the custom event
	 * @param detail - Optional data to include with the event
	 * @param options - Optional event options (bubbles, composed)
	 */
	emit<T = unknown>(eventName: string, detail?: T, options?: EmitOptions): void;

	/**
	 * Toggle a boolean attribute based on a condition.
	 * When true, the attribute is present (empty string value).
	 * When false, the attribute is removed.
	 *
	 * @param name - The attribute name
	 * @param condition - Whether the attribute should be present
	 *
	 * @example
	 * ```tsx
	 * this.toggleAttr("disabled", isDisabled);
	 * // true  → <my-element disabled>
	 * // false → <my-element>
	 * ```
	 */
	toggleAttr(name: string, condition: boolean): void;

	/**
	 * Set a state attribute with mutually exclusive on/off variants.
	 * Creates a pair of attributes where only one is present at a time.
	 * The "off" variant is prefixed with "un" (e.g., "checked" / "unchecked").
	 *
	 * @param name - The base attribute name
	 * @param condition - The state value
	 *
	 * @example
	 * ```tsx
	 * this.stateAttr("checked", isChecked);
	 * // true  → <my-element checked>
	 * // false → <my-element unchecked>
	 * ```
	 */
	stateAttr(name: string, condition: boolean): void;

	/**
	 * Register a callback for when an observed attribute changes.
	 * The attribute must be declared in the `observedAttributes` option of defineComponent.
	 * Uses the native `attributeChangedCallback` lifecycle method.
	 *
	 * @param name - The attribute name (must be in observedAttributes)
	 * @param callback - Called when attribute changes
	 *
	 * @example
	 * ```tsx
	 * // Declare observed attributes in defineComponent:
	 * defineComponent("my-switch", MySwitch, {
	 *   observedAttributes: ["checked", "disabled"]
	 * });
	 *
	 * // Handle changes in component:
	 * this.attrChanged("checked", (newValue, oldValue) => {
	 *   console.log("checked changed from", oldValue, "to", newValue);
	 * });
	 * ```
	 */
	attrChanged(
		name: string,
		callback: (newValue: string | null, oldValue: string | null) => void,
	): void;
}

/**
 * Component function type.
 * @template P - Props type passed to the component
 * @template E - Runtime methods/properties attached to the element
 */
export type ComponentFunction<
	P extends ComponentProps = ComponentProps,
	E extends object = object,
> = (this: RiftElement<E>, props: P) => void;

/**
 * Set a prop on an element (works before element is upgraded)
 * Props are stored in a WeakMap and retrieved when the element connects
 */
export function setProp(element: Element, propName: string, value: unknown): void;

/**
 * Get all props for an element
 */
export function getProps(element: Element): ComponentProps;

/**
 * Options for defineComponent
 */
export interface DefineComponentOptions {
	/**
	 * Attributes to observe for changes via attributeChangedCallback.
	 * Use `this.attrChanged()` in your component to handle changes.
	 */
	observedAttributes?: string[];
	/**
	 * Whether the element participates in form submission.
	 * When true, the element gets access to `this.internals` (ElementInternals)
	 * for form value submission, validation, and accessibility.
	 *
	 * @example
	 * ```tsx
	 * defineComponent("my-switch", MySwitch, {
	 *   formAssociated: true,
	 *   observedAttributes: ["checked"]
	 * });
	 * ```
	 */
	formAssociated?: boolean;
}

/**
 * Define a custom element component
 * @param tagName - The custom element tag name (must contain a hyphen)
 * @param fn - The component function that receives props as its first argument
 * @param options - Optional configuration (observedAttributes, etc.)
 */
export function defineComponent<
	P extends ComponentProps = ComponentProps,
	E extends object = object,
>(tagName: string, fn: ComponentFunction<P, E>, options?: DefineComponentOptions): void;

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
	render: (
		anchor: Node,
		item: T,
		index: number,
	) => { start: Node; end: Node; cleanup?: () => void },
): ForBlockController<T>;

// ============================================
// JSX Control Flow Components
// ============================================

/**
 * Props for the For component
 */
export interface ForProps<T> {
	/** Reactive cell containing the array to iterate */
	each: Cell<T[]>;
	/** Render callback for each item */
	children: (item: T, index: number) => void;
}

/**
 * For component - renders a list reactively.
 * This is a compile-time component that gets transformed into for_block() calls.
 *
 * @example
 * ```tsx
 * import { cell, For } from "rift-js";
 *
 * const items = cell([
 *   { label: "A", value: 30 },
 *   { label: "B", value: 80 },
 * ]);
 *
 * <For each={items}>
 *   {(item, index) => (
 *     <div>
 *       {index}: {item.label} = {item.value}
 *     </div>
 *   )}
 * </For>
 * ```
 */
export declare function For<T>(props: ForProps<T>): JSX.Element;

/**
 * Props for the Show component
 */
export interface ShowProps {
	/** Condition to evaluate - content is shown when truthy */
	when: boolean;
	/** Content to render when condition is true */
	children: unknown;
}

/**
 * Show component - conditionally renders content.
 * This is a compile-time component that gets transformed into show_block() calls.
 *
 * @example
 * ```tsx
 * import { cell, get, Show } from "rift-js";
 *
 * const isVisible = cell(true);
 *
 * <Show when={get(isVisible)}>
 *   <div>This content is conditionally shown</div>
 * </Show>
 * ```
 */
export declare function Show(props: ShowProps): JSX.Element;
