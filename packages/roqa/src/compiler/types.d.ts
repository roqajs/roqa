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
	| LocalReadExpr
	| LetExpr
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

/** Read a name introduced by an enclosing scope: action params, closure
 *  params, `EachIR.itemAlias`, `EachIR.indexAlias`, `LetExpr`, or (future)
 *  `TryIR.catch.errorAlias`. Compiles to a bare identifier reference. */
export type LocalReadExpr = {
	kind: "local-read";
	name: string;
};

/** Declare a local binding inside a `BlockExpr` body. The binding is in
 *  scope for every subsequent statement in the same block (including nested
 *  expressions). Compiles to `let <name> = <value>;`. */
export type LetExpr = {
	kind: "let";
	name: string;
	value: ExprIR;
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

export type NodeIR =
	| ElementIR
	| DynamicElementIR
	| TextIR
	| ReactiveTextIR
	| RawHtmlIR
	| ShowIR
	| SwitchIR
	| EachIR
	| TryIR;

export type ElementIR = {
	kind: "element";
	tag: string;
	/** Zero or more refs on this element. Currently only the `name` kind is
	 *  emitted by the backend; `callback` and `binding` kinds are reserved
	 *  for v2 and trigger an `unsupported-ir-node` diagnostic. */
	refs?: RefIR[];
	attributes: Record<string, ExprIR>;
	events: EventBindingIR[];
	children: NodeIR[];
	classes?: ClassIR;
	styles?: StyleIR;
	/** Optional source position metadata. Honored by the (future) source-map
	 *  emitter; ignored otherwise. */
	loc?: SourceLocation;
};

/** Runtime-dispatched element. `tag` is an expression that resolves to a
 *  string at render time (TSRX-style `<@Heading />`).
 *
 *  Reserved for v2 — the compiler currently rejects this node with
 *  `unsupported-ir-node`. */
export type DynamicElementIR = {
	kind: "dynamic-element";
	tag: ExprIR;
	refs?: RefIR[];
	attributes: Record<string, ExprIR>;
	events: EventBindingIR[];
	children: NodeIR[];
	classes?: ClassIR;
	styles?: StyleIR;
	loc?: SourceLocation;
};

export type RefIR =
	| { kind: "name"; name: string }
	| { kind: "callback"; handler: ExprIR }
	| { kind: "binding"; target: ExprIR };

export type SourceLocation = {
	start: { line: number; column: number };
	end?: { line: number; column: number };
	source?: string;
};

export type TextIR = {
	kind: "text";
	value: string;
};

export type ReactiveTextIR = {
	kind: "reactive-text";
	source: ExprIR;
};

/** Raw HTML insertion. Reserved for v2 — frontends may emit, but the compiler
 *  currently rejects with `unsupported-ir-node`. */
export type RawHtmlIR = {
	kind: "raw-html";
	source: ExprIR;
	trusted?: boolean;
};

export type ShowIR = {
	kind: "show";
	condition: CellRef;
	render: NodeIR[];
	fallback?: NodeIR[];
};

/** Multi-branch rendering: `if/else if/else`, `switch`, `match`. */
export type SwitchIR = {
	kind: "switch";
	/** Optional discriminant. When present, each arm's `test` is compared
	 *  with `===` against this value (`switch (x)` semantics). When absent,
	 *  each arm's `test` is evaluated as a boolean predicate (if/else-if). */
	discriminant?: ExprIR;
	arms: SwitchArmIR[];
	fallback?: NodeIR[];
	/** Optional explicit dependency cells. Frontends may declare them when
	 *  the compiler can't statically derive them from arm tests. */
	deps?: CellRef[];
};

export type SwitchArmIR = {
	test: ExprIR;
	render: NodeIR[];
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
	/** Optional alias bound to the iteration index. Read inside `render` via
	 *  `local-read` with `name: <indexAlias>`. */
	indexAlias?: string;
	render: NodeIR[];
	/** Optional view tree rendered when the source is empty. Toggled in/out
	 *  at the same anchor as the items. */
	empty?: NodeIR[];
};

/** Error / async boundary. Reserved for v2 — frontends may emit, but the
 *  compiler currently rejects with `unsupported-ir-node`. */
export type TryIR = {
	kind: "try";
	render: NodeIR[];
	catch?: { errorAlias: string; render: NodeIR[] };
	pending?: { render: NodeIR[] };
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
	blockType: "show" | "each" | "fallback" | "switch" | "empty";
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
	/** When true, the binding writes raw HTML via `target.innerHTML = value`.
	 *  Only emitted for `RawHtmlIR` lowerings. The `property` field is
	 *  always `"innerHTML"` in this case. */
	isInnerHTML?: boolean;
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
	blockType: "show" | "each" | "switch";
	container: string;
	source: string;
	controllerVar: string;
	templateId?: string;
	/** Render body for show/each. For switch blocks, arm bodies live in
	 *  `switchArms` and this field is omitted. */
	renderBody?: BlockRenderBody;
	fallbackBody?: BlockRenderBody;
	fallbackControllerVar?: string;
	key?: string;
	itemAlias?: string;
	indexAlias?: string;
	/** Empty-body for `each` blocks. When set, an extra controller toggles
	 *  this fallback in/out as the source's length crosses zero. */
	emptyBody?: BlockRenderBody;
	emptyControllerVar?: string;
	/** Switch arms. Set only when blockType === "switch". Each arm carries
	 *  its own template, root element, render body, and arm test. */
	switchArms?: SwitchArmOp[];
	/** When true, switch arms compare against `source` (the discriminant
	 *  variable name) with `===`. When false, each arm's test is a boolean
	 *  predicate. Only relevant for blockType === "switch". */
	switchHasDiscriminant?: boolean;
	/** Cell names this switch depends on (for runtime subscription). Only
	 *  relevant for blockType === "switch". */
	switchDeps?: string[];
};

export type SwitchArmOp = {
	templateId: string;
	rootElement: string;
	traversals: TraversalOp[];
	events: EventOp[];
	bindings: BindingOp[];
	classBindings: ClassBinding[];
	/** Compiled test expression. Always a boolean expression in the emitted
	 *  output (the discriminant comparison is folded in at lowering time). */
	testExpr: string;
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
