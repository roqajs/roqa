/**
 * Rift JSX Runtime Type Definitions
 *
 * Provides TypeScript support for Rift's JSX syntax.
 * Configure in tsconfig.json:
 *   {
 *     "compilerOptions": {
 *       "jsx": "react-jsx",
 *       "jsxImportSource": "rift-js"
 *     }
 *   }
 */

import type { Cell } from 'rift-js';

// ============================================
// Component Types
// ============================================

/**
 * Rift component function type.
 * Components are imperative - they don't return JSX elements.
 * Instead, they set up reactive bindings when connected to the DOM.
 */
export type ComponentType<P = {}> = (props: P) => void;

// ============================================
// JSX Runtime Functions
// ============================================

/**
 * Create a JSX element (automatic runtime)
 * Note: This throws at runtime - JSX must be compiled
 */
export function jsx(
	type: string | ComponentType<any>,
	props?: Record<string, any>,
	key?: string | number | null
): void;

/**
 * Create a JSX element with static children
 * Note: This throws at runtime - JSX must be compiled
 */
export function jsxs(
	type: string | ComponentType<any>,
	props?: Record<string, any>,
	key?: string | number | null
): void;

/**
 * JSX Fragment - groups elements without a wrapper
 */
export function Fragment(props: { children?: any }): void;

// ============================================
// Special Components
// ============================================

/**
 * Props for the For component
 */
export interface ForProps<T> {
	/** Reactive cell containing the array to iterate */
	each: Cell<T[]>;
	/** Render callback for each item */
	children: (item: T, index?: number) => void;
}

/**
 * For component - renders a list reactively
 * Compiled into for_block() calls
 */
export function For<T>(props: ForProps<T>): void;

// ============================================
// Event Handler Types
// ============================================

export type EventHandler<E extends Event = Event> =
	| ((event: E) => void)
	| { handler: (event: E, ...args: any[]) => void; args: any[] };

// ============================================
// HTML Attribute Types
// ============================================

type Booleanish = boolean | 'true' | 'false';

interface DOMAttributes {
	children?: any;

	// Clipboard Events
	oncopy?: EventHandler<ClipboardEvent>;
	oncut?: EventHandler<ClipboardEvent>;
	onpaste?: EventHandler<ClipboardEvent>;

	// Composition Events
	oncompositionend?: EventHandler<CompositionEvent>;
	oncompositionstart?: EventHandler<CompositionEvent>;
	oncompositionupdate?: EventHandler<CompositionEvent>;

	// Focus Events
	onfocus?: EventHandler<FocusEvent>;
	onblur?: EventHandler<FocusEvent>;

	// Form Events
	onchange?: EventHandler<Event>;
	oninput?: EventHandler<Event>;
	onreset?: EventHandler<Event>;
	onsubmit?: EventHandler<Event>;
	oninvalid?: EventHandler<Event>;

	// Image Events
	onload?: EventHandler<Event>;
	onerror?: EventHandler<Event>;

	// Keyboard Events
	onkeydown?: EventHandler<KeyboardEvent>;
	onkeypress?: EventHandler<KeyboardEvent>;
	onkeyup?: EventHandler<KeyboardEvent>;

	// Mouse Events
	onclick?: EventHandler<MouseEvent>;
	oncontextmenu?: EventHandler<MouseEvent>;
	ondblclick?: EventHandler<MouseEvent>;
	ondrag?: EventHandler<DragEvent>;
	ondragend?: EventHandler<DragEvent>;
	ondragenter?: EventHandler<DragEvent>;
	ondragleave?: EventHandler<DragEvent>;
	ondragover?: EventHandler<DragEvent>;
	ondragstart?: EventHandler<DragEvent>;
	ondrop?: EventHandler<DragEvent>;
	onmousedown?: EventHandler<MouseEvent>;
	onmouseenter?: EventHandler<MouseEvent>;
	onmouseleave?: EventHandler<MouseEvent>;
	onmousemove?: EventHandler<MouseEvent>;
	onmouseout?: EventHandler<MouseEvent>;
	onmouseover?: EventHandler<MouseEvent>;
	onmouseup?: EventHandler<MouseEvent>;

	// Pointer Events
	onpointerdown?: EventHandler<PointerEvent>;
	onpointermove?: EventHandler<PointerEvent>;
	onpointerup?: EventHandler<PointerEvent>;
	onpointercancel?: EventHandler<PointerEvent>;
	onpointerenter?: EventHandler<PointerEvent>;
	onpointerleave?: EventHandler<PointerEvent>;
	onpointerover?: EventHandler<PointerEvent>;
	onpointerout?: EventHandler<PointerEvent>;

	// Touch Events
	ontouchcancel?: EventHandler<TouchEvent>;
	ontouchend?: EventHandler<TouchEvent>;
	ontouchmove?: EventHandler<TouchEvent>;
	ontouchstart?: EventHandler<TouchEvent>;

	// UI Events
	onscroll?: EventHandler<UIEvent>;

	// Wheel Events
	onwheel?: EventHandler<WheelEvent>;

	// Animation Events
	onanimationstart?: EventHandler<AnimationEvent>;
	onanimationend?: EventHandler<AnimationEvent>;
	onanimationiteration?: EventHandler<AnimationEvent>;

	// Transition Events
	ontransitionend?: EventHandler<TransitionEvent>;
}

interface HTMLAttributes extends DOMAttributes {
	// Standard HTML Attributes
	accesskey?: string;
	autofocus?: boolean;
	class?: string;
	contenteditable?: Booleanish | 'inherit';
	dir?: string;
	draggable?: Booleanish;
	hidden?: boolean;
	id?: string;
	lang?: string;
	slot?: string;
	spellcheck?: Booleanish;
	style?: string | Record<string, string | number>;
	tabindex?: number;
	title?: string;
	translate?: 'yes' | 'no';

	// WAI-ARIA
	role?: string;

	// RDFa Attributes
	about?: string;
	datatype?: string;
	inlist?: any;
	prefix?: string;
	property?: string;
	resource?: string;
	typeof?: string;
	vocab?: string;

	// Non-standard Attributes
	autocapitalize?: string;
	autocorrect?: string;
	autosave?: string;
	color?: string;
	itemprop?: string;
	itemscope?: boolean;
	itemtype?: string;
	itemid?: string;
	itemref?: string;
	results?: number;
	security?: string;
	unselectable?: 'on' | 'off';

	// Living Standard
	inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
	is?: string;
}

interface AnchorHTMLAttributes extends HTMLAttributes {
	download?: any;
	href?: string;
	hreflang?: string;
	media?: string;
	ping?: string;
	rel?: string;
	target?: string;
	type?: string;
	referrerpolicy?: string;
}

interface ButtonHTMLAttributes extends HTMLAttributes {
	autofocus?: boolean;
	disabled?: boolean;
	form?: string;
	formaction?: string;
	formenctype?: string;
	formmethod?: string;
	formnovalidate?: boolean;
	formtarget?: string;
	name?: string;
	type?: 'submit' | 'reset' | 'button';
	value?: string | string[] | number;
}

interface FormHTMLAttributes extends HTMLAttributes {
	acceptcharset?: string;
	action?: string;
	autocomplete?: string;
	enctype?: string;
	method?: string;
	name?: string;
	novalidate?: boolean;
	target?: string;
}

interface ImgHTMLAttributes extends HTMLAttributes {
	alt?: string;
	crossorigin?: 'anonymous' | 'use-credentials' | '';
	decoding?: 'async' | 'auto' | 'sync';
	height?: number | string;
	loading?: 'eager' | 'lazy';
	referrerpolicy?: string;
	sizes?: string;
	src?: string;
	srcset?: string;
	usemap?: string;
	width?: number | string;
}

interface InputHTMLAttributes extends HTMLAttributes {
	accept?: string;
	alt?: string;
	autocomplete?: string;
	autofocus?: boolean;
	capture?: boolean | 'user' | 'environment';
	checked?: boolean;
	crossorigin?: string;
	disabled?: boolean;
	form?: string;
	formaction?: string;
	formenctype?: string;
	formmethod?: string;
	formnovalidate?: boolean;
	formtarget?: string;
	height?: number | string;
	list?: string;
	max?: number | string;
	maxlength?: number;
	min?: number | string;
	minlength?: number;
	multiple?: boolean;
	name?: string;
	pattern?: string;
	placeholder?: string;
	readonly?: boolean;
	required?: boolean;
	size?: number;
	src?: string;
	step?: number | string;
	type?: string;
	value?: string | string[] | number;
	width?: number | string;
}

interface LabelHTMLAttributes extends HTMLAttributes {
	form?: string;
	for?: string;
}

interface SelectHTMLAttributes extends HTMLAttributes {
	autocomplete?: string;
	autofocus?: boolean;
	disabled?: boolean;
	form?: string;
	multiple?: boolean;
	name?: string;
	required?: boolean;
	size?: number;
	value?: string | string[] | number;
}

interface TextareaHTMLAttributes extends HTMLAttributes {
	autocomplete?: string;
	autofocus?: boolean;
	cols?: number;
	dirname?: string;
	disabled?: boolean;
	form?: string;
	maxlength?: number;
	minlength?: number;
	name?: string;
	placeholder?: string;
	readonly?: boolean;
	required?: boolean;
	rows?: number;
	value?: string | string[] | number;
	wrap?: string;
}

interface TableHTMLAttributes extends HTMLAttributes {
	cellpadding?: number | string;
	cellspacing?: number | string;
	summary?: string;
}

interface TdHTMLAttributes extends HTMLAttributes {
	align?: 'left' | 'center' | 'right' | 'justify' | 'char';
	colspan?: number;
	headers?: string;
	rowspan?: number;
	scope?: string;
	valign?: 'top' | 'middle' | 'bottom' | 'baseline';
}

interface ThHTMLAttributes extends HTMLAttributes {
	align?: 'left' | 'center' | 'right' | 'justify' | 'char';
	colspan?: number;
	headers?: string;
	rowspan?: number;
	scope?: string;
	valign?: 'top' | 'middle' | 'bottom' | 'baseline';
}

interface SVGAttributes extends DOMAttributes {
	// SVG Specific attributes
	class?: string;
	color?: string;
	height?: number | string;
	id?: string;
	lang?: string;
	max?: number | string;
	media?: string;
	method?: string;
	min?: number | string;
	name?: string;
	style?: string | Record<string, string | number>;
	target?: string;
	type?: string;
	width?: number | string;

	// SVG Presentation Attributes
	'clip-path'?: string;
	cx?: number | string;
	cy?: number | string;
	d?: string;
	fill?: string;
	'fill-opacity'?: number | string;
	'fill-rule'?: 'nonzero' | 'evenodd' | 'inherit';
	filter?: string;
	'font-family'?: string;
	'font-size'?: number | string;
	fx?: number | string;
	fy?: number | string;
	gradientTransform?: string;
	gradientUnits?: string;
	href?: string;
	markerEnd?: string;
	markerMid?: string;
	markerStart?: string;
	offset?: number | string;
	opacity?: number | string;
	patternContentUnits?: string;
	patternUnits?: string;
	points?: string;
	preserveAspectRatio?: string;
	r?: number | string;
	rx?: number | string;
	ry?: number | string;
	spreadMethod?: string;
	'stop-color'?: string;
	'stop-opacity'?: number | string;
	stroke?: string;
	'stroke-dasharray'?: string | number;
	'stroke-dashoffset'?: string | number;
	'stroke-linecap'?: 'butt' | 'round' | 'square' | 'inherit';
	'stroke-linejoin'?: 'miter' | 'round' | 'bevel' | 'inherit';
	'stroke-miterlimit'?: number | string;
	'stroke-opacity'?: number | string;
	'stroke-width'?: number | string;
	textAnchor?: string;
	transform?: string;
	viewBox?: string;
	x?: number | string;
	x1?: number | string;
	x2?: number | string;
	xmlns?: string;
	y?: number | string;
	y1?: number | string;
	y2?: number | string;
}

// ============================================
// Global JSX Namespace
// ============================================

declare global {
	namespace JSX {
		// JSX expressions return void in Rift (imperative, no virtual DOM)
		type Element = void;

		interface ElementChildrenAttribute {
			children: {};
		}

		interface IntrinsicElements {
			// Main root
			html: HTMLAttributes;

			// Document metadata
			head: HTMLAttributes;
			title: HTMLAttributes;
			base: HTMLAttributes;
			link: HTMLAttributes;
			meta: HTMLAttributes;
			style: HTMLAttributes;

			// Sectioning root
			body: HTMLAttributes;

			// Content sectioning
			address: HTMLAttributes;
			article: HTMLAttributes;
			aside: HTMLAttributes;
			footer: HTMLAttributes;
			header: HTMLAttributes;
			h1: HTMLAttributes;
			h2: HTMLAttributes;
			h3: HTMLAttributes;
			h4: HTMLAttributes;
			h5: HTMLAttributes;
			h6: HTMLAttributes;
			main: HTMLAttributes;
			nav: HTMLAttributes;
			section: HTMLAttributes;

			// Text content
			blockquote: HTMLAttributes;
			dd: HTMLAttributes;
			div: HTMLAttributes;
			dl: HTMLAttributes;
			dt: HTMLAttributes;
			figcaption: HTMLAttributes;
			figure: HTMLAttributes;
			hr: HTMLAttributes;
			li: HTMLAttributes;
			ol: HTMLAttributes;
			p: HTMLAttributes;
			pre: HTMLAttributes;
			ul: HTMLAttributes;

			// Inline text semantics
			a: AnchorHTMLAttributes;
			abbr: HTMLAttributes;
			b: HTMLAttributes;
			bdi: HTMLAttributes;
			bdo: HTMLAttributes;
			br: HTMLAttributes;
			cite: HTMLAttributes;
			code: HTMLAttributes;
			data: HTMLAttributes;
			dfn: HTMLAttributes;
			em: HTMLAttributes;
			i: HTMLAttributes;
			kbd: HTMLAttributes;
			mark: HTMLAttributes;
			q: HTMLAttributes;
			rp: HTMLAttributes;
			rt: HTMLAttributes;
			ruby: HTMLAttributes;
			s: HTMLAttributes;
			samp: HTMLAttributes;
			small: HTMLAttributes;
			span: HTMLAttributes;
			strong: HTMLAttributes;
			sub: HTMLAttributes;
			sup: HTMLAttributes;
			time: HTMLAttributes;
			u: HTMLAttributes;
			var: HTMLAttributes;
			wbr: HTMLAttributes;

			// Image and multimedia
			area: HTMLAttributes;
			audio: HTMLAttributes;
			img: ImgHTMLAttributes;
			map: HTMLAttributes;
			track: HTMLAttributes;
			video: HTMLAttributes;

			// Embedded content
			embed: HTMLAttributes;
			iframe: HTMLAttributes;
			object: HTMLAttributes;
			param: HTMLAttributes;
			picture: HTMLAttributes;
			portal: HTMLAttributes;
			source: HTMLAttributes;

			// SVG and MathML
			svg: SVGAttributes;
			math: HTMLAttributes;

			// Scripting
			canvas: HTMLAttributes;
			noscript: HTMLAttributes;
			script: HTMLAttributes;

			// Demarcating edits
			del: HTMLAttributes;
			ins: HTMLAttributes;

			// Table content
			caption: HTMLAttributes;
			col: HTMLAttributes;
			colgroup: HTMLAttributes;
			table: TableHTMLAttributes;
			tbody: HTMLAttributes;
			td: TdHTMLAttributes;
			tfoot: HTMLAttributes;
			th: ThHTMLAttributes;
			thead: HTMLAttributes;
			tr: HTMLAttributes;

			// Forms
			button: ButtonHTMLAttributes;
			datalist: HTMLAttributes;
			fieldset: HTMLAttributes;
			form: FormHTMLAttributes;
			input: InputHTMLAttributes;
			label: LabelHTMLAttributes;
			legend: HTMLAttributes;
			meter: HTMLAttributes;
			optgroup: HTMLAttributes;
			option: HTMLAttributes;
			output: HTMLAttributes;
			progress: HTMLAttributes;
			select: SelectHTMLAttributes;
			textarea: TextareaHTMLAttributes;

			// Interactive elements
			details: HTMLAttributes;
			dialog: HTMLAttributes;
			menu: HTMLAttributes;
			summary: HTMLAttributes;

			// Web Components
			slot: HTMLAttributes;
			template: HTMLAttributes;

			// SVG elements
			circle: SVGAttributes;
			clipPath: SVGAttributes;
			defs: SVGAttributes;
			ellipse: SVGAttributes;
			g: SVGAttributes;
			image: SVGAttributes;
			line: SVGAttributes;
			linearGradient: SVGAttributes;
			mask: SVGAttributes;
			path: SVGAttributes;
			pattern: SVGAttributes;
			polygon: SVGAttributes;
			polyline: SVGAttributes;
			radialGradient: SVGAttributes;
			rect: SVGAttributes;
			stop: SVGAttributes;
			text: SVGAttributes;
			tspan: SVGAttributes;
			use: SVGAttributes;

			// Rift special components
			For: ForProps<any>;

			// Allow any element (for custom elements)
			[elemName: string]: any;
		}
	}
}

export {};
