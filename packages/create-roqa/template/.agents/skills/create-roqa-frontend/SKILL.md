---
name: create-roqa-frontend
description: Use this skill for creating a custom Roqa frontend that implements the RoqaFrontend interface and produces valid Roqa IR output.
---

# Goal

Convert the project's custom source format into valid Roqa `ComponentIR` objects so Vite-facing consumers can hand them to the Roqa backend compiler.

This skill folder is self-contained. Use `FRONTEND-GUIDE.md` in this directory for the full frontend author guide, and use this `SKILL.md` for the detailed IR contract and implementation checklist.

## Core workflow

1. Start in `src/index.ts`.
2. Check `handles(id)` to confirm which extensions the frontend owns.
3. Add or expand parser helpers as the source format grows.
4. Normalize the parsed result into `ComponentIR` in `toIR(code, id)`.
5. Compare the result against the reference `.roqa` files in `tests/fixtures/`.
6. Validate changes with `npm test` and `npx tsc --noEmit`.

## Frontend architecture

Roqa uses a split architecture:

```txt
your source format -> parser -> frontend model -> Roqa IR -> roqa/compiler -> optimized JavaScript
```

As a frontend author, your job stops at valid `ComponentIR` output. The backend compiler owns validation, lowering, optimization, and JavaScript emission.

Frontend responsibilities:

- Parse source code into whatever intermediate form is natural for your syntax.
- Normalize that representation into one or more valid `ComponentIR` objects.
- Return those IR objects from `toIR(code, id)`.

Backend responsibilities:

- Validate structural correctness and reference integrity.
- Lower the IR into compiler-internal runtime shapes.
- Optimize reactive cells, bindings, and render paths.
- Emit the final JavaScript module.

## Frontend interface behavior

Every frontend implements two methods:

```ts
export interface RoqaFrontend {
  handles(id: string): boolean;
  toIR(code: string, id: string): ComponentIR | ComponentIR[];
}
```

### handles(id)

`handles(id)` receives a fully resolved file path and decides whether the frontend owns that file.

```ts
handles(id) {
  return /\.[jt]sx$/.test(id);
}
```

Keep this check narrow. If your frontend only owns `.tsx`, do not claim `.jsx` or `.ts` as a convenience.

### toIR(code, id)

`toIR(code, id)` receives raw source text and the resolved path. It must return either a single `ComponentIR` or an array when one file defines multiple components.

```ts
toIR(code, id) {
  const ast = parse(code);
  const components = extractComponents(ast);
  return components.map((component) => convertToIR(component, id));
}
```

Design notes:

- Prefer deterministic normalization over preserving source-level quirks.
- Emit empty arrays or `{}` for required top-level sections instead of omitting them.
- Prefer structured `ExprIR` nodes over opaque string blobs whenever possible.

### Wiring into Vite

Roqa frontends plug into the Vite package through `roqa({ frontend })`.

```ts
import roqa from "@roqajs/vite-plugin";
import frontend from "./src/index.js";

export default {
  plugins: [roqa({ frontend })],
};
```

The plugin calls `frontend.handles(id)` during `transform()`. If it returns `true`, the plugin invokes `frontend.toIR(code, id)` and passes the result into `compile()`.

Raw `.roqa` files bypass your frontend and are compiled directly by the plugin.

## Roqa interface walkthrough

For Roqa IR schema types, prefer the dedicated `roqa/ir` import path:

```ts
import type { ComponentIR, ExprIR, NodeIR } from "roqa/ir";
```

Use `roqa/compiler` for executable compiler APIs like `compile()`, not for the frontend-facing IR contract.

The custom frontend must expose an object with this shape:

```ts
export interface RoqaFrontend {
  handles(id: string): boolean;
  toIR(code: string, id: string): ComponentIR | ComponentIR[];
}
```

`types/index.d.ts` contains this interface in the template. The return value from `toIR` can be one `ComponentIR` object or an array of them.

## Frontend-owned IR contract

The sections below reproduce the Roqa IR interface in a frontend-focused form. Keep your work centered on these shapes and the normalization decisions needed to produce them. Omit sections you do not use, but when a field exists in the interface you emit, it must follow the contract below.

Before adding syntax sugar in your frontend, anchor it back to these runtime-facing guarantees:

- `version` is always `1`.
- `tagName` is a lowercase custom element name with a hyphen.
- `render` is always an array of root nodes.
- `lifecycle` is an object even when empty.
- The backend validates the contract, but the frontend should aim to emit correct IR on the first pass.

### Component IR

```ts
type ComponentIR = {
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

  locals?: LocalDeclIR[];
  preamble?: ExprIR[];
  metadata?: ComponentMetadata;
};

type LocalDeclIR = {
  kind: "let" | "var";
  name: string;
  init?: ExprIR;
};

type ComponentMetadata = {
  sourceFile?: string;
  frontend?: string;
  imports?: ImportIR[];
  moduleCode?: string;
};
```

Frontend notes:

- `version` must be `1`.
- `tagName` must be a valid custom element name.
- Empty sections are still emitted as empty arrays or `{}` for `lifecycle`.
- `render` is always an array, even for a single-root component.

### Expression IR

```ts
type ExprIR =
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

type LiteralExpr = {
  kind: "literal";
  value: string | number | boolean | null;
};

type TemplateLiteralExpr = {
  kind: "template-literal";
  parts: (string | ExprIR)[];
};

type ObjectExpr = {
  kind: "object";
  properties: ObjectPropertyIR[];
};

type ObjectPropertyIR =
  | { kind: "property"; key: string; value: ExprIR }
  | { kind: "spread"; argument: ExprIR };

type ArrayExpr = {
  kind: "array";
  elements: ExprIR[];
};

type StateReadExpr = {
  kind: "state-read";
  name: string;
};

type StateWriteExpr = {
  kind: "state-write";
  name: string;
  value: ExprIR;
};

type PropReadExpr = {
  kind: "prop-read";
  name: string;
  path?: string[];
};

type AttrReadExpr = {
  kind: "attr-read";
  name: string;
};

type ComputedReadExpr = {
  kind: "computed-read";
  name: string;
};

type LocalReadExpr = {
  kind: "local-read";
  name: string;
};

type LetExpr = {
  kind: "let";
  name: string;
  value: ExprIR;
};

type BinaryExpr = {
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

type UnaryExpr = {
  kind: "unary";
  op: "!" | "-" | "typeof";
  operand: ExprIR;
};

type ConditionalExpr = {
  kind: "conditional";
  test: ExprIR;
  consequent: ExprIR;
  alternate: ExprIR;
};

type AssignExpr = {
  kind: "assign";
  op: "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "??=" | "||=" | "&&=";
  target: ExprIR;
  value: ExprIR;
};

type UpdateExpr = {
  kind: "update";
  op: "++" | "--";
  prefix: boolean;
  target: ExprIR;
};

type MemberExpr = {
  kind: "member";
  object: ExprIR;
  property: string;
};

type IndexExpr = {
  kind: "index";
  object: ExprIR;
  index: ExprIR;
};

type SpreadExpr = {
  kind: "spread";
  argument: ExprIR;
};

type CallExpr = {
  kind: "call";
  callee: ExprIR;
  args: ExprIR[];
};

type MethodCallExpr = {
  kind: "method-call";
  object: ExprIR;
  method: string;
  args: ExprIR[];
};

type NewExpr = {
  kind: "new";
  callee: ExprIR;
  args: ExprIR[];
};

type BlockExpr = {
  kind: "block";
  body: ExprIR[];
};

type ReturnExpr = {
  kind: "return";
  value?: ExprIR;
};

type ClosureExpr = {
  kind: "closure";
  params: ClosureParam[];
  body: ExprIR;
  async?: boolean;
};

type ClosureParam = string | DestructuredParam;

type DestructuredParam = {
  kind: "destructured";
  pattern: "object" | "array";
  bindings: DestructuredBinding[];
  rest?: string;
};

type DestructuredBinding = {
  key: string;
  alias?: string;
  default?: ExprIR;
};

type CollectionOpExpr = {
  kind: "collection-op";
  op: "insert" | "remove" | "update" | "remove-where" | "move" | "clear";
  name: string;
  args: ExprIR[];
};

type EmitExpr = {
  kind: "emit";
  event: string;
  detail?: ExprIR;
};

type ActionCallExpr = {
  kind: "action-call";
  name: string;
  args: ExprIR[];
};

type ImportedRefExpr = {
  kind: "imported-ref";
  source: string;
  name: string;
  isDefault?: boolean;
};

type ExternalRefExpr = {
  kind: "external-ref";
  name: string;
  path?: string[];
};

type OpaqueExpr = {
  kind: "opaque";
  source: string;
  reads: string[];
  writes: string[];
};
```

Frontend notes:

- Prefer structured expressions over `opaque` whenever possible.
- `LocalReadExpr` is the generic local-scope read node. Do not invent `item-field-read` style nodes.
- Use `MemberExpr` over `LocalReadExpr` for list-item field access.
- Use `cell-ref` only where a consumer truly needs the cell handle.

### State IR

```ts
type StateIR = StateValueIR | StateCollectionIR | StateComputedIR;

type StateValueIR = {
  kind: "value";
  name: string;
  initial: unknown;
  initialExpr?: string;
  hints?: OptimizationHints;
};

type StateCollectionIR = {
  kind: "collection";
  name: string;
  key: string | null;
  initial: unknown[];
  hints?: OptimizationHints;
};

type StateComputedIR = {
  kind: "computed";
  name: string;
  body: ExprIR;
  hints?: OptimizationHints;
};

type OptimizationHints = {
  writeOnce?: boolean;
  maxItems?: number;
  pureComputed?: boolean;
  hotPath?: boolean;
  immutable?: boolean;
  escapesComponent?: boolean;
};
```

### Node IR

```ts
type NodeIR =
  | ElementIR
  | DynamicElementIR
  | TextIR
  | ReactiveTextIR
  | RawHtmlIR
  | ShowIR
  | SwitchIR
  | EachIR
  | TryIR;

type ElementIR = {
  kind: "element";
  tag: string;
  refs?: RefIR[];
  attributes: Record<string, ExprIR>;
  events: EventBindingIR[];
  children: NodeIR[];
  classes?: ClassIR;
  styles?: StyleIR;
  loc?: SourceLocation;
};

type RefIR =
  | { kind: "name"; name: string }
  | { kind: "callback"; handler: ExprIR }
  | { kind: "binding"; target: ExprIR };

type SourceLocation = {
  start: { line: number; column: number };
  end?: { line: number; column: number };
  source?: string;
};

type DynamicElementIR = {
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

type TextIR = {
  kind: "text";
  value: string;
};

type ReactiveTextIR = {
  kind: "reactive-text";
  source: ExprIR;
};

type ShowIR = {
  kind: "show";
  condition: CellRef;
  render: NodeIR[];
  fallback?: NodeIR[];
};

type SwitchIR = {
  kind: "switch";
  discriminant?: ExprIR;
  arms: SwitchArmIR[];
  fallback?: NodeIR[];
  deps?: CellRef[];
};

type SwitchArmIR = {
  test: ExprIR;
  render: NodeIR[];
};

type EachIR = {
  kind: "each";
  source: EachSourceIR;
  key?: string | null;
  itemAlias: string;
  indexAlias?: string;
  render: NodeIR[];
  empty?: NodeIR[];
};

type EachSourceIR = CellRef | ExprIR;

type RawHtmlIR = {
  kind: "raw-html";
  source: ExprIR;
  trusted?: boolean;
};

type TryIR = {
  kind: "try";
  render: NodeIR[];
  catch?: {
    errorAlias: string;
    render: NodeIR[];
  };
  pending?: { render: NodeIR[] };
};
```

Frontend notes:

- `attributes.class` and `classes` are mutually exclusive on the same element.
- `ReactiveTextIR` is for dynamic text content; use `TextIR` for static strings.
- `ShowIR.condition` is a `CellRef`, not a `state-read`.
- `EachIR.source` can be either a `CellRef` or any `ExprIR`.
- `RawHtmlIR` should only be emitted when the frontend intends raw HTML insertion.

### Cell references

```ts
type CellRef = {
  kind: "cell-ref";
  name: string;
};
```

Use `cell-ref` when the IR site needs the cell handle itself. Use `state-read` when the site needs the current value.

### Event bindings

```ts
type EventBindingIR = {
  event: string;
  handler: ExprIR;
};
```

Common handler forms:

- `ActionCallExpr` for named or bound actions.
- `ClosureExpr` for inline handlers.

### Classes

```ts
type ClassIR = StaticClassIR | ClassListIR;

type StaticClassIR = {
  kind: "static-class";
  value: string;
};

type ClassListIR = {
  kind: "class-list";
  items: ClassItemIR[];
};

type ClassItemIR =
  | string
  | { name: string; condition: ExprIR }
  | { kind: "dynamic"; value: ExprIR };
```

### Styles

```ts
type StyleIR = StaticStyleIR | StyleMapIR;

type StaticStyleIR = {
  kind: "static-style";
  value: string;
};

type StyleMapIR = {
  kind: "style-map";
  properties: StylePropertyIR[];
};

type StylePropertyIR = {
  property: string;
  value: ExprIR;
};
```

Frontend note: normalize style property names to kebab-case in the emitted IR.

### Actions

```ts
type ActionIR = {
  kind: "action";
  name: string;
  params: string[];
  body: ExprIR;
  async?: boolean;
};
```

### Props, attrs, emits, imports, lifecycle

```ts
type PropIR = {
  kind: "prop";
  name: string;
  required: boolean;
  default?: unknown;
};

type AttrIR = {
  kind: "attr";
  name: string;
  default?: unknown;
  reflect: boolean;
};

type EmitIR = {
  kind: "emit-decl";
  name: string;
  eventName: string;
};

type ImportIR = {
  kind: "import";
  source: string;
  bindings: ImportBinding[];
  sideEffect?: boolean;
};

type ImportBinding =
  | string
  | {
      local: string;
      imported?: string;
      kind?: "named" | "default" | "namespace";
    };

type LifecycleIR = {
  onConnect?: ExprIR;
  onDisconnect?: ExprIR;
};
```

## Minimal valid component

```json
{
  "version": 1,
  "tagName": "hello-card",
  "name": "HelloCard",
  "state": [],
  "actions": [],
  "props": [],
  "attrs": [],
  "emits": [],
  "lifecycle": {},
  "render": [
    {
      "kind": "element",
      "tag": "p",
      "attributes": {},
      "events": [],
      "children": [{ "kind": "text", "value": "Hello" }]
    }
  ]
}
```

## Practical guidance

- Prefer a small parser boundary and a separate normalization step once the syntax stops being trivial.
- If your syntax introduces sugar, lower that sugar before generating IR.
- When debugging output shape, temporarily emit IR that matches a reference file exactly before adding more abstraction.
