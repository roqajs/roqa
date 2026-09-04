import type { Cell, RoqaElement } from "roqa";

export {};

declare module "roqa" {
	type Cleanup = () => void;
	type Disposable = Cleanup | { destroy(): void };

	/** A clone and its compiler-generated, directly traversed DOM references. */
	export interface TemplateInstance<T extends object> {
		readonly fragment: DocumentFragment;
		readonly refs: T;
	}

	export interface MountScope {
		/** Own native resources that Roqa cannot discover automatically. */
		own(...resources: Disposable[]): void;
		listen<K extends keyof WindowEventMap>(
			target: Window,
			type: K,
			listener: (event: WindowEventMap[K]) => void,
		): void;
	}

	export interface VisionRoqaElementMethods {
		/**
		 * Initializes once, pauses owned effects while detached, and resumes the same
		 * DOM and ownership graph when the custom element reconnects.
		 */
		mount(render: (scope: MountScope) => TemplateInstance<object>): void;
	}

	export interface ComponentDefinition<Props extends Record<string, unknown>> {
		readonly tagName: `${string}-${string}`;
		setProps(element: HTMLElement, props: Props): void;
	}

	export function component<Props extends Record<string, unknown>>(
		tagName: `${string}-${string}`,
		setup: (this: RoqaElement & VisionRoqaElementMethods, props: Props) => void,
	): ComponentDefinition<Props>;

	export function batch(update: () => void): void;
	export function computed<T>(derive: () => T): Cell<T>;
	export function effect(run: () => void): Cleanup;

	/**
	 * Autocomplete-friendly event tokens. Unlike a TypeScript enum, these remain
	 * plain tree-shakeable strings and can carry their event type.
	 */
	export type EventType<K extends keyof HTMLElementEventMap> = K & {
		readonly __event?: HTMLElementEventMap[K];
	};
	export const event: { [K in keyof HTMLElementEventMap]: EventType<K> };

	/** Reads as “on click, for element”; delegation is registered automatically. */
	export function on<K extends keyof HTMLElementEventMap>(
		type: EventType<K>,
		element: HTMLElement,
		handler: (event: HTMLElementEventMap[K]) => void,
	): void;
	export function on<T, K extends keyof HTMLElementEventMap>(
		type: EventType<K>,
		element: HTMLElement,
		handler: (value: T, event: HTMLElementEventMap[K]) => void,
		value: T,
	): void;

	export interface ForBlockOptions<T, K> {
		key(value: T): K;
		render(value: T, scope: MountScope): TemplateInstance<object>;
	}

	export interface BlockController {
		update(): void;
		destroy(): void;
	}

	export function forBlock<T, K>(
		container: Element,
		source: Cell<T[]>,
		options: ForBlockOptions<T, K>,
	): BlockController;

	export interface ShowBlockController extends BlockController {
		readonly isShowing: boolean;
	}

	export function showBlock(
		container: Element,
		condition: Cell<unknown> | (() => unknown) | boolean,
		render: (scope: MountScope) => TemplateInstance<object>,
	): ShowBlockController;
}
