// ============================================================================
// MIR (Mid-level IR) Types — the compiler's input format
// ============================================================================

export type ComponentIR = {
	version: 1;
	tagName: string;
	name: string;

	state: StateIR[];
	actions: ActionIR[];
	props: PropIR[];
	attrs: AttrIR[];
	emits: EmitIR[];
	lifecycle: LifecycleIR;
	render: NodeIR[];

	/** Top-level `let` / `var` declarations from the component body. These are
	 *  emitted in component scope so that closures (event handlers, lifecycle
	 *  callbacks, etc.) can capture and assign to them. */
	locals?: LocalDeclIR[];

	/** Miscellaneous top-level statements (e.g. `this.method = ...`) emitted
	 *  in component scope after locals and before the connected callback. */
	preamble?: ExprIR[];

	metadata?: ComponentMetadata;
};

export type LocalDeclIR = {
	kind: "let" | "var";
	name: string;
	init?: ExprIR;
};

export type ComponentMetadata = {
	sourceFile?: string;
	frontend?: string;
	imports?: ImportIR[];
	/** Raw module-level code (non-import, non-defineComponent statements)
	 *  that the frontend wants emitted at the top of the file. */
	moduleCode?: string;
};

// --- State ---

export type StateIR = StateValueIR | StateCollectionIR | StateComputedIR;

export type StateValueIR = {
	kind: "value";
	name: string;
	initial: unknown;
	/** When the original initializer wasn't a literal, this holds the raw JS
	 *  source so it can be evaluated at runtime (e.g. `FEEDS.top`). */
	initialExpr?: string;
	hints?: OptimizationHints;
};

export type StateCollectionIR = {
	kind: "collection";
	name: string;
	key: string | null;
	initial: unknown[];
	hints?: OptimizationHints;
};

export type StateComputedIR = {
	kind: "computed";
	name: string;
	body: ExprIR;
	hints?: OptimizationHints;
};

export type OptimizationHints = {
	writeOnce?: boolean;
	maxItems?: number;
	pureComputed?: boolean;
	hotPath?: boolean;
	immutable?: boolean;
	escapesComponent?: boolean;
};

// --- Expressions ---

export type ExprIR =
	| LiteralExpr
	| TemplateLiteralExpr
	| ObjectExpr
	| ArrayExpr
	| StateReadExpr
	| StateWriteExpr
	| PropReadExpr
	| AttrReadExpr
	| ComputedReadExpr
	| ParamReadExpr
	| BinaryExpr
	| UnaryExpr
	| ConditionalExpr
	| MemberExpr
	| IndexExpr
	| SpreadExpr
	| CallExpr
	| MethodCallExpr
	| NewExpr
	| BlockExpr
	| ReturnExpr
	| CollectionOpExpr
	| EmitExpr
	| ActionCallExpr
	| ItemFieldReadExpr
	| ClosureExpr
	| ImportedRefExpr
	| ExternalRefExpr
	| AssignExpr
	| UpdateExpr
	| OpaqueExpr;

export type LiteralExpr = {
	kind: "literal";
	value: string | number | boolean | null;
};

export type TemplateLiteralExpr = {
	kind: "template-literal";
	parts: (string | ExprIR)[];
};

export type ObjectExpr = {
	kind: "object";
	properties: ObjectPropertyIR[];
};

export type ArrayExpr = {
	kind: "array";
	elements: ExprIR[];
};

export type AssignExpr = {
	kind: "assign";
	op: "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "??=" | "||=" | "&&=";
	target: ExprIR;
	value: ExprIR;
};

export type UpdateExpr = {
	kind: "update";
	op: "++" | "--";
	prefix: boolean;
	target: ExprIR;
};

export type ObjectPropertyIR =
	| { kind: "property"; key: string; value: ExprIR }
	| { kind: "spread"; argument: ExprIR };

export type StateReadExpr = {
	kind: "state-read";
	name: string;
};

export type StateWriteExpr = {
	kind: "state-write";
	name: string;
	value: ExprIR;
};

export type PropReadExpr = {
	kind: "prop-read";
	name: string;
	path?: string[];
};

export type AttrReadExpr = {
	kind: "attr-read";
	name: string;
};

export type ComputedReadExpr = {
	kind: "computed-read";
	name: string;
};

export type ParamReadExpr = {
	kind: "param-read";
	name: string;
};

export type BinaryExpr = {
	kind: "binary";
	op:
	| "+"
	| "-"
	| "*"
	| "/"
	| "%"
	| "==="
	| "!=="
	| ">"
	| "<"
	| ">="
	| "<="
	| "&&"
	| "||"
	| "??";
	left: ExprIR;
	right: ExprIR;
};

export type UnaryExpr = {
	kind: "unary";
	op: "!" | "-" | "typeof";
	operand: ExprIR;
};

export type ConditionalExpr = {
	kind: "conditional";
	test: ExprIR;
	consequent: ExprIR;
	alternate: ExprIR;
};

export type MemberExpr = {
	kind: "member";
	object: ExprIR;
	property: string;
};

export type IndexExpr = {
	kind: "index";
	object: ExprIR;
	index: ExprIR;
};

export type SpreadExpr = {
	kind: "spread";
	argument: ExprIR;
};

export type CallExpr = {
	kind: "call";
	callee: ExprIR;
	args: ExprIR[];
};

export type MethodCallExpr = {
	kind: "method-call";
	object: ExprIR;
	method: string;
	args: ExprIR[];
};

/** `new Constructor(args)` — used for `new Date()`, `new URL(...)`,
 *  custom class instantiation, etc. Frontends should emit this rather than
 *  `OpaqueExpr` so the backend can analyze the arguments. */
export type NewExpr = {
	kind: "new";
	callee: ExprIR;
	args: ExprIR[];
};

export type BlockExpr = {
	kind: "block";
	body: ExprIR[];
};

/** `return <value>` — used inside `ClosureExpr.body` and `BlockExpr` to
 *  produce a JavaScript `return` statement. Without this, `return { x, y }`
 *  patterns are forced through `OpaqueExpr` to preserve the `return` keyword. */
export type ReturnExpr = {
	kind: "return";
	value?: ExprIR;
};

export type CollectionOpExpr = {
	kind: "collection-op";
	op: "insert" | "remove" | "update" | "remove-where" | "move" | "clear";
	name: string;
	args: ExprIR[];
};

export type EmitExpr = {
	kind: "emit";
	event: string;
	detail?: ExprIR;
};

export type ActionCallExpr = {
	kind: "action-call";
	name: string;
	args: ExprIR[];
};

export type ItemFieldReadExpr = {
	kind: "item-field-read";
	field: string;
};

export type ClosureExpr = {
	kind: "closure";
	params: ClosureParam[];
	body: ExprIR;
	async?: boolean;
};

export type ClosureParam = string | DestructuredParam;

export type DestructuredParam = {
	kind: "destructured";
	pattern: "object" | "array";
	bindings: DestructuredBinding[];
	rest?: string;
};

export type DestructuredBinding = {
	key: string;
	alias?: string;
	default?: ExprIR;
};

export type ImportedRefExpr = {
	kind: "imported-ref";
	source: string;
	name: string;
	isDefault?: boolean;
};

export type ExternalRefExpr = {
	kind: "external-ref";
	name: string;
	path?: string[];
};

export type OpaqueExpr = {
	kind: "opaque";
	source: string;
	reads: string[];
	writes: string[];
};

// --- Nodes ---

export type NodeIR = ElementIR | TextIR | ReactiveTextIR | ShowIR | EachIR;

export type ElementIR = {
	kind: "element";
	tag: string;
	ref?: string;
	attributes: Record<string, ExprIR>;
	events: EventBindingIR[];
	children: NodeIR[];
	classes?: ClassIR;
	styles?: StyleIR;
};

export type TextIR = {
	kind: "text";
	value: string;
};

export type ReactiveTextIR = {
	kind: "reactive-text";
	source: ExprIR;
};

export type ShowIR = {
	kind: "show";
	condition: CellRef;
	render: NodeIR[];
	fallback?: NodeIR[];
};

/** Source for `EachIR`. Most frontends emit a `cell-ref` so the runtime can
 *  subscribe directly. The compiler also accepts an arbitrary `ExprIR` for
 *  static or derived sources (constant arrays, `props.items`, etc.) — these are
 *  auto-lifted to a synthetic computed cell during lowering so the same
 *  `forBlock(...)` call shape is used. */
export type EachSourceIR = CellRef | ExprIR;

export type EachIR = {
	kind: "each";
	source: EachSourceIR;
	key?: string | null;
	itemAlias: string;
	render: NodeIR[];
};

export type CellRef = {
	kind: "cell-ref";
	name: string;
};

// --- Events ---

export type EventBindingIR = {
	event: string;
	handler: ExprIR;
};

// --- Classes ---

export type ClassIR = StaticClassIR | ClassListIR;

export type StaticClassIR = {
	kind: "static-class";
	value: string;
};

export type ClassListIR = {
	kind: "class-list";
	items: ClassItemIR[];
};

export type ClassItemIR =
	| string
	| { name: string; condition: ExprIR }
	/** Arbitrary expression resolving to a class-name string. The value is
	 *  prepended with a leading space at runtime when non-empty so it composes
	 *  with sibling items. Frontends should emit this for patterns like
	 *  `class={computeCls(x)}` where the resulting class string isn't a fixed
	 *  enumeration of names. */
	| { kind: "dynamic"; value: ExprIR };

// --- Styles ---

export type StyleIR = StaticStyleIR | StyleMapIR;

export type StaticStyleIR = {
	kind: "static-style";
	value: string;
};

export type StyleMapIR = {
	kind: "style-map";
	properties: StylePropertyIR[];
};

export type StylePropertyIR = {
	property: string;
	value: ExprIR;
};

// --- Actions ---

export type ActionIR = {
	kind: "action";
	name: string;
	params: string[];
	body: ExprIR;
	async?: boolean;
};

// --- Props, Attrs, Emits ---

export type PropIR = {
	kind: "prop";
	name: string;
	required: boolean;
	default?: unknown;
};

export type AttrIR = {
	kind: "attr";
	name: string;
	default?: unknown;
	reflect: boolean;
};

export type EmitIR = {
	kind: "emit-decl";
	name: string;
	eventName: string;
};

export type ImportBinding =
	| string
	| {
			local: string;
			imported?: string;
			kind?: "named" | "default" | "namespace";
	  };

export type ImportIR = {
	kind: "import";
	source: string;
	bindings: ImportBinding[];
	sideEffect?: boolean;
};

// --- Lifecycle ---

export type LifecycleIR = {
	onConnect?: ExprIR;
	onDisconnect?: ExprIR;
};

// ============================================================================
// LIR (Low-level IR) Types — the compiler's internal codegen format
// ============================================================================

export type ComponentLIR = {
	tagName: string;
	name: string;
	props: PropIR[];
	attrs: AttrIR[];
	templates: TemplateOp[];
	cells: CellOp[];
	functions: FunctionOp[];
	blockVars: BlockVar[];
	connected: ConnectedBlock;
	delegatedEvents: string[];
	imports: string[];
	userImports: UserImport[];
	observedAttributes: string[];
	lifecycle: LifecycleIR;
	locals: LocalDeclIR[];
	preamble: ExprIR[];
	moduleCode?: string;
};

export type UserImport = {
	source: string;
	bindings: ImportBinding[];
	sideEffect?: boolean;
};

export type BlockVar = {
	name: string;
	blockType: "show" | "each" | "fallback";
};

export type ConnectedBlock = {
	traversals: TraversalOp[];
	bindings: BindingOp[];
	events: EventOp[];
	blocks: BlockOp[];
	propSets: PropSetOp[];
};

export type TemplateOp = {
	kind: "template";
	id: string;
	html: string;
	svg: boolean;
};

export type TraversalOp = {
	kind: "traversal";
	varName: string;
	path: string;
};

export type CellOp = {
	kind: "cell";
	varName: string;
	initial: string;
	inlined: boolean;
};

export type FunctionOp = {
	kind: "function";
	varName: string;
	params: string[];
	body: string;
	inlinedSets: InlinedSet[];
	async?: boolean;
};

export type InlinedSet = {
	cellName: string;
	valueExpr: string;
	updates: InlinedUpdate[];
	blockUpdates: InlinedBlockUpdate[];
	notify: boolean;
	/** Body code that must run immediately before this set (e.g. local var
	 *  declarations) to preserve the original action's statement order. */
	prelude?: string;
};

export type InlinedUpdate = {
	target: string;
	expression: string;
};

export type InlinedBlockUpdate = {
	blockVar: string;
	method: "update";
};

export type BindingOp = {
	kind: "binding";
	cellName: string;
	refName: string;
	target: string;
	property: string;
	expression: string;
	initialValue: string;
	inlined: boolean;
	isSvgAttr?: boolean;
	/** When true, the binding writes to a style property via
	 *  `target.style.setProperty("<property>", value)` instead of
	 *  `target.<property> = value`. The `property` field holds the kebab-case
	 *  CSS property name (e.g. `font-size`, `--my-var`). */
	isStyleProp?: boolean;
};

export type EventOp = {
	kind: "event";
	target: string;
	event: string;
	handler: string;
	delegated: boolean;
};

export type BlockOp = {
	kind: "block";
	blockType: "show" | "each";
	container: string;
	source: string;
	controllerVar: string;
	templateId?: string;
	renderBody: BlockRenderBody;
	fallbackBody?: BlockRenderBody;
	fallbackControllerVar?: string;
	key?: string;
	itemAlias?: string;
};

export type BlockRenderBody = {
	templateId: string;
	rootElement: string;
	traversals: TraversalOp[];
	events: EventOp[];
	bindings: BindingOp[];
	classBindings: ClassBinding[];
};

export type ClassBinding = {
	target: string;
	expression: string;
};

export type PropSetOp = {
	kind: "prop-set";
	target: string;
	propName: string;
	value: string;
};

// --- Diagnostics ---

export type Diagnostic = {
	code: string;
	severity: "error" | "warning" | "info";
	message: string;
	component: string;
	path?: string[];
};

export type CompileResult = {
	code: string;
	map: null;
};
