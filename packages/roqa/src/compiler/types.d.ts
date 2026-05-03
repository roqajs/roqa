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

	metadata?: ComponentMetadata;
};

export type ComponentMetadata = {
	sourceFile?: string;
	frontend?: string;
	imports?: ImportIR[];
};

// --- State ---

export type StateIR = StateValueIR | StateCollectionIR | StateComputedIR;

export type StateValueIR = {
	kind: "value";
	name: string;
	initial: unknown;
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
	| BlockExpr
	| CollectionOpExpr
	| EmitExpr
	| ActionCallExpr
	| ItemFieldReadExpr
	| ClosureExpr
	| ImportedRefExpr
	| ExternalRefExpr
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

export type BlockExpr = {
	kind: "block";
	body: ExprIR[];
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

export type EachIR = {
	kind: "each";
	source: CellRef;
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

export type ClassItemIR = string | { name: string; condition: ExprIR };

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

export type ImportIR = {
	kind: "import";
	source: string;
	bindings: string[];
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
};

export type UserImport = {
	source: string;
	bindings: string[];
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
};

export type InlinedSet = {
	cellName: string;
	valueExpr: string;
	updates: InlinedUpdate[];
	blockUpdates: InlinedBlockUpdate[];
	notify: boolean;
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
