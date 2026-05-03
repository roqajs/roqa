# Reference Algorithms from the Old Compiler

The old JSX-based compiler contained several algorithms that are directly
applicable to the new MIR-based compiler. The inputs change (MIR trees
instead of Babel AST), but the core logic is the same. These are extracted
here as reference — **do not copy verbatim**, but use the approach.

---

## DOM traversal computation

Computing `firstChild`/`nextSibling` chains from a tree structure. The old
compiler walked Babel JSX AST nodes; the new compiler walks `NodeIR` trees.
The algorithm is the same:

1. The root element is always accessed via `this.firstChild` (after
   `appendChild`).
2. For each parent element, track child position:
   - First child (index 0) → `parent.firstChild`
   - Subsequent children → `prevSibling.nextSibling`
3. Text nodes that are reactive get a `_text` suffix variable:
   - If the text node is the first child → `parent.firstChild`
   - If preceded by an element → `prevElement.nextSibling`
4. Recurse into child elements.

Key edge case: when a reactive text node precedes an element child, the
element must use `textNode.nextSibling` rather than `parent.firstChild`.

**Old compiler reference** (traversal algorithm):
```js
// From transforms/jsx-to-template.js — generateTraversal / generateChildTraversal
//
// 1. Root element: isComponentRoot ? "this.firstChild" : `${rootVar}.firstChild`
//
// 2. For each parent, iterate children:
//    - Text nodes at childIndex 0 → `${parent}.firstChild`
//    - First element child:
//      - If a text node came first → `${textNode}.nextSibling`
//      - Otherwise → `${parent}.firstChild`
//    - Later element children → `${prevElement}.nextSibling`
//    - Text nodes after elements → `${prevElement}.nextSibling`
//
// 3. Recurse into each child element.
//
// 4. Only emit traversal steps for nodes that are actually referenced
//    by bindings, events, or blocks (dead step elimination in codegen.js
//    filterTraversalSteps function).
```

---

## Transitive computed dependency expansion

When inlining `set()` calls, computed cells that depend on the written cell
must have their binding update expressions expanded to reference the root
state cell directly. The old compiler did this via text-based regex
replacement on the generated code; the new compiler should do it at the
LIR level before emission.

**Old compiler reference** (expansion algorithm):
```js
// From transforms/inline-get.js — InlineContext class
//
// 1. registerDerivedCell(name, body, dependencies)
//    - Stores the transformed body (with get(x) → x.v already applied)
//    - Stores direct dependency names
//
// 2. getTransitiveDependents(cellName) → Set<string>
//    - Find all derived cells whose dependencies include cellName
//    - Then find derived cells that depend on THOSE cells
//    - Fixed-point iteration until no new dependents found
//
// 3. getExpandedDerivedBody(cellName, visited = new Set())
//    - Get the body of a derived cell
//    - For each reference to another derived cell (otherCell.v),
//      recursively replace with the other cell's expanded body
//    - Wrap replacements in parens for safety: `(expandedBody)`
//    - Track visited cells to prevent infinite loops from cycles
//
// Example: count → doubled (count.v * 2) → quadrupled (doubled.v * 2)
// Expanded quadrupled body: (count.v * 2) * 2 → count.v * 2 * 2
```

---

## Event handler delegation patterns

The old compiler's event assignment patterns are simple but must match the
runtime's delegation system exactly.

**Old compiler reference:**
```js
// From transforms/events.js and codegen.js
//
// Simple handler (ActionCallExpr with no args):
//   element.__click = handlerFn;
//
// Array form (ActionCallExpr with args):
//   element.__click = [handlerFn, arg1, arg2];
//   Runtime calls: handlerFn.call(element, arg1, arg2, event)
//
// Inline handler (ClosureExpr):
//   element.__input = (e) => { /* compiled body */ };
//   The event parameter is always named `e`.
//
// The event type name is collected for the delegate() call at file end.
```

---

## Adjacent text coalescing into single text node

When an element has a mix of static `TextIR` and `ReactiveTextIR` children
with no element children between them, they share a **single text node** in
the template (one space `' '` placeholder). The binding concatenates all
parts into one `nodeValue` expression.

**Old compiler reference:**
```js
// From transforms/jsx-to-template.js — processElement child loop
//
// contentParts collects adjacent text/reactive children:
//   [{type: "static", value: "Count: "}, {type: "dynamic", expr: countExpr}]
//
// When a child element is encountered, flush contentParts:
//   - If any part is dynamic → emit single space ' ' in HTML, create binding
//     with full contentParts array
//   - If all static → inline text directly into HTML
//
// The binding rebuilds the full concatenation on each update:
//   textNode.nodeValue = "Count: " + count.v
//
// Multiple reactive reads in one text span create ONE binding per unique
// cell (deduplicated by cell name), but the binding expression always
// recomputes ALL parts:
//   textNode.nodeValue = "Count: " + count.v + " / Doubled: " + doubled.v
//
// Operator precedence gotcha: dynamic expressions with binary operators
// must be wrapped in parentheses when concatenated:
//   "Sum: " + (a.v + b.v)    ← correct
//   "Sum: " + a.v + b.v      ← wrong (string concat, not addition)
```

---

## Traversal step deduplication

Not all template nodes need traversal variables. Only nodes that are
referenced by bindings, events, forBlocks, or showBlocks need declarations.
Unused intermediate nodes are pruned, but their **dependencies** must be
preserved transitively.

**Old compiler reference:**
```js
// From codegen.js — filterTraversalSteps
//
// 1. Start with directly-used vars (binding targets, event targets,
//    block containers)
// 2. Iterative fixed-point expansion:
//    for each needed step, if its code references another var
//    (e.g., "div_2.firstChild" depends on "div_2"),
//    add that var to the needed set
// 3. Repeat until no new vars added
// 4. Filter traversal to only needed steps
//
// This prevents orphaned chains like:
//   const div_1 = this.firstChild;           ← needed (p_1 depends on it)
//   const p_1 = div_1.firstChild;            ← needed (has binding)
//   const span_1 = p_1.nextSibling;          ← NOT needed (no binding)
```

---

## Two-phase traversal for prop bindings

Props on custom elements must be set **before** `appendChild()`. This
requires traversing the detached fragment first for prop targets, then
traversing from `this.firstChild` after mount for everything else.

**Old compiler reference:**
```js
// From codegen.js — buildConnectedBody (lines 445-490)
//
// Phase 1 (before appendChild):
//   propUsedVars = bindings.filter(b => b.type === 'prop').map(b => b.targetVar)
//   propTraversal = filterTraversalSteps(traversal, propUsedVars)
//   // Traversal code uses $root_1.firstChild (detached fragment)
//   for step in propTraversal:
//     code = step.code.replace('this.firstChild', rootVar + '.firstChild')
//   // Set props via setProp()
//   this.appendChild($root_1)
//
// Phase 2 (after appendChild):
//   // Remaining traversal uses this.firstChild (live DOM)
//   // Skip vars already declared in phase 1
//   alreadyDeclared = Set(propTraversal vars)
//   filteredTraversal = filterTraversalSteps(traversal, usedVars, alreadyDeclared)
```

---

## SVG context tracking

Once inside an SVG element, all children inherit SVG context. SVG attributes
must use `setAttribute()` instead of property assignment (except `className`
and `nodeValue`). SVG templates use `svgTemplate()` instead of `template()`.

**Old compiler reference:**
```js
// From transforms/jsx-to-template.js
//
// SVG_ELEMENTS is a Set of ~80 SVG tag names (circle, rect, path,
// feGaussianBlur, etc.)
//
// Context propagation:
//   isInSvgContext = parentIsInSvg || SVG_ELEMENTS.has(tagName)
//   // Passed recursively to all children
//
// Attribute handling:
//   needsSetAttribute = (isSvg || attrName.includes("-"))
//                       && attrName !== "className"
//                       && attrName !== "nodeValue"
//   if needsSetAttribute:
//     element.setAttribute("cx", value)  // not element.cx = value
//
// Template registration:
//   registry.register(html, isSvg=true)  // → uses svgTemplate() in output
```

---

## Dynamic attributes are omitted from template HTML

Only static attribute values go into the HTML template string. Dynamic
attributes (any attribute bound to reactive state) are created entirely at
runtime via property assignment or `setAttribute()`. No placeholder values
are needed in the template.

**Old compiler reference:**
```js
// From transforms/jsx-to-template.js — attribute processing
//
// Static: <div id="container">  →  html += ' id="container"'
// Dynamic: <div class={expr}>   →  html unchanged, binding created
// Boolean: <button disabled>    →  html += ' disabled'
//
// This means the template for <input value={get(draft)}>
// is just "<input>" — no value attribute in the HTML.
// The binding sets input_1.value = draft.v at runtime.
```

---

## Cleanup tracking for forBlock/showBlock bindings

Bindings inside forBlock/showBlock callbacks that use `bind()` (non-inlined)
must capture the unsubscribe function and call it when the item is destroyed.
Without this, subscriptions leak.

**Old compiler reference:**
```js
// From codegen.js — generateBindingWithCleanup, showBlock/forBlock codegen
//
// Each bind() inside a block captures a cleanup var:
//   const _cleanup_0 = bind(cell, (v) => { ... });
//   const _cleanup_1 = bind(cell2, (v) => { ... });
//
// The return object includes a cleanup callback:
//   return {
//     start: firstElement,
//     end: firstElement,
//     cleanup: () => { _cleanup_0(); _cleanup_1(); }
//   };
//
// If ALL bindings are inlined (ref-based, no bind()), the cleanup
// property is omitted entirely — the runtime skips cleanup for items
// without it.
//
// For the new compiler: if a BindingOp has inlined=false inside a
// BlockOp, generate the cleanup pattern. If all BindingOps are
// inlined, omit cleanup.
```

---

## Show block condition complexity detection

Show blocks have three forms based on condition complexity. The compiler
must detect which form to use.

**Old compiler reference:**
```js
// From codegen.js — generateShowBlock (lines 858-876)
//
// Analyze get() calls in the condition expression:
//
// 1. Simple cell (1 get(), isOnlyExpression=true):
//    showBlock(container, cellRef, callback)
//    → Most efficient, no closure
//
// 2. Complex expression (1+ get() calls, mixed with operators):
//    showBlock(container, () => expr, callback, [dep1, dep2])
//    → Getter function + deps array for subscription
//
// 3. Static (0 get() calls):
//    showBlock(container, staticValue, callback)
//    → Evaluated once, never re-checked
//
// Detection: count get() calls in condition. If exactly 1 AND it's the
// entire expression → simple. If >0 but mixed → complex. If 0 → static.
```

---

## Naming conventions and constants

Variable names and prefixes used in generated output follow strict
conventions. Using different names will break runtime interop.

**Old compiler reference:**
```js
// From utils.js — CONSTANTS
//
// EVENT_PREFIX:    "__"       element.__click = handler
// REF_PREFIX:      "ref_"    cell.ref_1 = element
// TEMPLATE_PREFIX: "$tmpl_"  const $tmpl_1 = template(...)
// ROOT_PREFIX:     "$root_"  const $root_1 = $tmpl_1()
//
// Element variable naming:  tagName_N     (e.g., button_1, div_2)
// Text node naming:         parent_text   (e.g., button_1_text, p_1_text)
// forBlock variable naming: collName_forBlock (e.g., todos_forBlock)
// Show anchor naming:       show_anchor_N (not used — showBlock manages its own anchor)
//
// Custom element tags with hyphens: replace - with _ for variable names
//   <my-counter> → my_counter_1
//
// String escaping for template HTML:
//   escapeAttr(str): " → &quot;  ' → &#39;
//   escapeHtml(str): & → &amp;  < → &lt;  > → &gt;  " → &quot;
//   escapeTemplateString(str): \ → \\  ' → \'  (for JS string literals)
```
