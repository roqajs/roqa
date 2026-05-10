# Roqa Runtime Spec

This document specifies the runtime primitives that the Roqa backend compiler
targets. The runtime is the thin layer of code that runs in the browser — it
provides the operations that can't be eliminated at compile time.

Roqa's key architectural insight is that **most reactive updates can be
resolved at compile time**. The compiler inlines `cell()`, `get()`, `set()`,
and `bind()` calls into straight-line JavaScript — no runtime graph walk, no
subscription management, no function call overhead. The runtime exists only
for the cases where compile-time resolution isn't possible.

## Reactive model: hybrid compile-time + runtime

Roqa uses a **hybrid reactive model** with two update paths:

```txt
┌─────────────────────────────────────────────────────────────────┐
│  COMPILE-TIME PATH (fast — zero runtime overhead)               │
│                                                                 │
│  The compiler statically knows every binding that reads a cell. │
│  DOM updates are inlined directly at the write site:            │
│                                                                 │
│    count.v = count.v + 1;                                       │
│    count.ref_1.nodeValue = "Count: " + count.v;                 │
│                                                                 │
│  No subscription, no notification, no graph.                    │
│  This is the default path for most cells.                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  RUNTIME PATH (dynamic — for cross-component observation)       │
│                                                                 │
│  When a cell's value may be observed by code the compiler       │
│  can't see at build time, the compiler appends a subscriber     │
│  notification loop after the inlined updates:                   │
│                                                                 │
│    count.v = count.v + 1;                                       │
│    count.ref_1.nodeValue = "Count: " + count.v;                 │
│    for (let i = 0; i < count.e.length; i++) count.e[i](count.v);│
│                                                                 │
│  When no subscribers exist, cost is one comparison (0 < 0).     │
│  Subscribers register via subscribe() and clean up on unmount.  │
└─────────────────────────────────────────────────────────────────┘
```

The compiler decides per-cell which path to use via escape analysis. See
[compiler.md §Hybrid reactive model](./compiler.md#hybrid-reactive-model) for
the full decision logic.

### Why not a full signal runtime?

A full signal runtime (auto-tracking reads, topological update ordering,
lazy memoization) would add overhead to **every** read and write — even
cells that the compiler could have fully resolved. Roqa's approach preserves
zero-cost updates for the common case and only pays for runtime subscription
where necessary.

### Known limitations of the hybrid model

These are deliberate tradeoffs, not bugs. Below is a list of some of the
biggst tradeoffs, their impact, and a proposed mitigation strategy.

**1. Diamond dependency glitch.**
When cell `A` has two computed dependents `B` and `C`, and `D` observes
both, setting `A` fires `B`'s subscriber then `C`'s. `D` may briefly see
a state where `B` is updated but `C` is stale.

_Impact:_ Invisible for DOM updates (browser only paints final state).
Matters for side effects in subscribers (network requests, analytics).

_Future mitigation:_ `queueMicrotask`-based batching in `subscribe()` —
coalesce notifications so subscribers fire once per microtask. Can be added
to the runtime without IR or compiler changes.

**2. Coarse-grained reactivity.**
Cells are whole-value containers. Updating one field of an object notifies
all subscribers, even those that only read a different field.

_Impact:_ Unnecessary re-renders when large objects are partially updated.

_Mitigation:_ Use fine-grained cells (one cell per value) rather than
monolithic object-shaped state. The IR's `StateValueIR` encourages this
pattern. Collections handle the list case.

**3. Static over-subscription for conditional dependencies.**
The compiler subscribes to all cells that _may_ be read in a computed body,
even branches that aren't taken at runtime.

_Impact:_ Unnecessary recomputation when inactive-branch dependencies
change. Negligible for cheap computations.

_Future mitigation:_ Compiler pattern-matching for simple conditionals
(`cond ? readA : readB`) to generate dynamic subscribe/unsubscribe code.

**4. No first-class effects or watchers.**
No `createEffect()` equivalent for observing multiple cells. Must use
individual `subscribe()` calls.

_Future mitigation:_ A `watch(cells[], callback)` helper built on top of
`subscribe()`, with microtask batching.

**5. Eager evaluation.**
Computed values recompute immediately when dependencies change, even if the
result isn't read.

_Future mitigation:_ Compiler-generated memoization wrappers that skip
notification when the computed result is unchanged.

---

## Runtime modules

### Module overview

```txt
packages/roqa/src/runtime/
├── cell.js           # Reactive primitives (cell, get, set, put, bind, notify, subscribe)
├── component.js      # defineComponent, RoqaElement base class, setProp, getProps
├── events.js         # Event delegation system
├── for-block.js      # List rendering with LIS reconciliation
├── show-block.js     # Conditional rendering
├── switch-block.js   # Multi-branch rendering (if/else-if, switch, match)
├── template.js       # DOM template creation (HTML + SVG)
└── index.js          # Public exports
```

### Change status for the rewrite

| Module            | Status    | Notes                                                              |
| ----------------- | --------- | ------------------------------------------------------------------ |
| `cell.js`         | ✅ Done   | `subscribe()` function added                                       |
| `component.js`    | Unchanged | `RoqaElement`, `defineComponent`, `setProp`, `getProps` are stable |
| `events.js`       | Unchanged | Event delegation system is stable                                  |
| `for-block.js`    | Unchanged | LIS reconciliation is stable                                       |
| `show-block.js`   | Unchanged | Conditional rendering is stable                                    |
| `switch-block.js` | ✅ New    | Multi-branch rendering for `SwitchIR`                              |
| `template.js`     | Unchanged | Template cloning is stable                                         |
| `index.js`        | ✅ Done   | `subscribe`, `switchBlock` added to exports                        |

---

## cell.js — reactive primitives

### Existing primitives (unchanged)

```js
// Create a cell (reactive value container)
// Compiler inlines as: { v: value, e: [] }
export const cell = (v) => ({ v, e: [] });

// Read cell value
// Compiler inlines as: cell.v
export const get = (s) => s.v;

// Write cell value + notify subscribers
// Compiler inlines as: { cell.v = v; /* inlined DOM updates */ /* subscriber loop */ }
export const set = (cell, v) => {
  cell.v = v;
  for (let i = 0; i < cell.e.length; i++) cell.e[i](v);
};

// Write cell value without notification
// Compiler inlines as: cell.v = v
export const put = (s, v) => {
  s.v = v;
};

// Bind an effect to a cell — calls immediately, then on each change
// Returns an unsubscribe function
// Compiler inlines as: ref storage (cell.ref_N = element)
export const bind = (cell, fn) => {
  fn(cell.v);
  cell.e.push(fn);
  return () => {
    const idx = cell.e.indexOf(fn);
    if (idx > -1) cell.e.splice(idx, 1);
  };
};

// Trigger all subscribers
export const notify = (cell) => {
  for (let i = 0; i < cell.e.length; i++) cell.e[i](cell.v);
};
```

These are the **fallback** implementations. In optimized output, the compiler
inlines most of these away — `cell()` becomes `{ v, e: [] }`, `get()` becomes
`cell.v`, `set()` becomes a block with inlined DOM updates. The runtime
functions exist for non-inlined cases (e.g., bindings inside `forBlock`
callbacks).

**Why `e` and not `effects` or `subscribers`?** The `e` property is accessed
on every notification loop — short property names are a deliberate
micro-optimization (V8 inline caches, monomorphic access). The full meaning
is "subscriber list" (not "events" or "effects"). Developers never interact
with `e` directly — they use `subscribe()`, `bind()`, and the MIR. The raw
cell shape `{ v, e }` only appears in compiled output.

### `subscribe()`

> **Already implemented** — `subscribe()` has been added to `cell.js` and
> exported from `index.js`. No action needed. Tests should still be written
> (see §Implementation order below).

```js
// Runtime subscription — for dynamic bindings the compiler can't inline.
// Does NOT call the callback immediately (unlike bind()).
// Returns an unsubscribe function for cleanup.
export function subscribe(cell, callback) {
  cell.e.push(callback);
  return () => {
    const idx = cell.e.indexOf(callback);
    if (idx !== -1) cell.e.splice(idx, 1);
  };
}
```

**`subscribe()` vs `bind()` — when to use which:**

|                                    | `bind()`                                 | `subscribe()`                      |
| ---------------------------------- | ---------------------------------------- | ---------------------------------- |
| Calls callback immediately?        | Yes                                      | No                                 |
| Used by compiler for               | Static bindings (inlined to ref storage) | Cross-component observation        |
| Used inside `forBlock`/`showBlock` | Yes (existing behavior)                  | Yes (new, for prop-received cells) |
| Generated by                       | Phase 2 lowering (binding detection)     | Phase 2 lowering (escape analysis) |

`bind()` is for the initial render path — "set this value now and update
it later." `subscribe()` is for observation — "notify me when this changes,
I'll handle my own initial render."

The emitter generates `subscribe()` calls in child components that receive
cells via props. The child's `connected()` callback sets the initial value
manually and uses `subscribe()` for future updates, with cleanup in
`disconnected()`:

```js
this.connected(() => {
  const countCell = getProps(this).count;
  span_1.nodeValue = "Items: " + countCell.v; // Initial render
  const unsub = subscribe(countCell, (v) => {
    // Future updates
    span_1.nodeValue = "Items: " + v;
  });
  this.disconnected(() => unsub()); // Cleanup
});
```

### The `e` array — subscriber list

Every cell has an `e` array: `{ v: value, e: [] }`. This array serves
double duty:

1. **Non-inlined `bind()` callbacks** — used by `forBlock` and `showBlock`
   for dynamic bindings that can't be statically resolved.

2. **Runtime `subscribe()` callbacks** — used by child components
   observing cells received via props.

The compiler's inline optimization replaces `bind()` calls with direct ref
storage (`cell.ref_1 = element`), eliminating the `e` array for those
bindings. But the array is always present because the compiler can't know
at build time whether runtime subscribers will be added later (e.g., a child
component that hasn't been compiled yet).

### Future: microtask batching

A future optimization adds batching to the notification loop. Instead of
calling each subscriber synchronously:

```js
// Current: synchronous notification
for (let i = 0; i < cell.e.length; i++) cell.e[i](v);
```

A batched version would defer notifications to the next microtask:

```js
// Future: batched notification
let pending = null;
function scheduleBatch(cell, v) {
  if (!pending) {
    pending = new Set();
    queueMicrotask(() => {
      for (const [cell, v] of pending) {
        for (let i = 0; i < cell.e.length; i++) cell.e[i](v);
      }
      pending = null;
    });
  }
  pending.add([cell, v]);
}
```

This solves the diamond dependency glitch (subscribers fire once per
microtask, not once per write) and reduces DOM thrashing when multiple
cells are written in the same synchronous block.

**Not part of v1.** The synchronous model is simpler, correct for all
single-cell updates, and has no timing surprises. Add batching when
profiling shows it's needed for real-world multi-cell update patterns.

---

## component.js — web component registration

### `defineComponent(tagName, fn, options?)`

Registers a custom element. Creates a `RoqaElement` subclass and calls
`customElements.define()`.

The component function `fn` is called with `this` bound to the element
instance and `props` (from `getProps()`) as the first argument. The function
registers `connected()` and `disconnected()` callbacks.

**No changes needed for the rewrite.** The component lifecycle, prop
passing (`setProp`/`getProps`), attribute observation (`attrChanged`), and
event helpers (`on`, `emit`, `toggleAttr`, `stateAttr`) are all stable.

### `RoqaElement` base class methods

| Method                        | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `connected(fn)`               | Register callback for when mounted                    |
| `disconnected(fn)`            | Register callback for when unmounted                  |
| `on(event, handler)`          | Add event listener (auto-cleanup via AbortController) |
| `emit(event, detail)`         | Dispatch custom event                                 |
| `toggleAttr(name, condition)` | Add/remove boolean attribute                          |
| `stateAttr(name, condition)`  | Set mutually exclusive attrs (checked/unchecked)      |
| `attrChanged(name, callback)` | React to observed attribute changes                   |

#### `this.on()` vs `delegate()` — different purposes

`delegate()` handles events declared on elements in the render tree via
`EventBindingIR` — these use the `__eventname` delegation pattern and are
the standard way to handle UI interaction events (`click`, `input`, etc.).

`this.on()` handles events that don't fit the delegation model:

- **Window/document events** — `resize`, `scroll`, `keydown` fire on
  `window`/`document`, not on elements in the component's render tree.
- **Custom events from children** — listening for custom events bubbling up
  from child components (e.g., `this.on("viewcomments", ...)`).
- **Non-bubbling events** — `focus`, `blur`, `mouseenter`, `mouseleave`
  don't bubble, so delegation can't catch them.
- **Events on the host element itself** — `this.on("mousemove", ...)` to
  track mouse position over the component.

`this.on()` uses `addEventListener` with an `AbortController` signal —
all listeners are automatically cleaned up on `disconnectedCallback`. This
makes it safe for lifecycle-bound subscriptions without manual cleanup.

`this.on()` is not currently modeled in the MIR — it's used from
`LifecycleIR` expressions or the component function body. A future
`ListenerIR` node could formalize this if the pattern becomes common enough
to benefit from compiler analysis, but it's not needed for v1.

### `setProp(element, propName, value)` / `getProps(element)`

WeakMap-based prop passing that works before custom element upgrade. The
parent component calls `setProp()` before `appendChild()`, and the child's
`connectedCallback` retrieves props via `getProps()`.

**No changes needed.** The prop mechanism is independent of the reactive
model — it passes values (including cells for the hybrid model) without
understanding what they are.

---

## events.js — event delegation

Attaches one listener per event type to the document root. When an event
fires, walks the composed path looking for elements with `__eventname`
properties.

Handler formats:

- `element.__click = fn` → `fn.call(element, event)`
- `element.__click = [fn, arg1, arg2]` → `fn.call(element, arg1, arg2, event)`

The array form avoids closure allocation in `forBlock` render callbacks.

**No changes needed.** Event delegation is orthogonal to the reactive model.

---

## for-block.js — list reconciliation

Efficient list rendering using a Longest Increasing Subsequence (LIS)
algorithm for minimal DOM operations.

```js
forBlock(container, sourceCell, renderFn) → { update, destroy, state }
```

The render callback receives `(anchor, item, index)` and must return
`{ start, end, cleanup? }` — the DOM range for one item.

`forBlock` subscribes to the source cell via `bind()` and calls the
reconciler on each update. The reconciler diffs by reference equality
(or by key when the `EachIR` has a `key` field).

**No changes needed.** `forBlock` already uses the `e[]` subscriber array
internally (via `bind()`). The hybrid model doesn't change how list
reconciliation works — it just means the source cell may also have
additional subscribers from other components.

### Clear-to-empty fast path

When a list transitions from non-empty to empty, `reconcileFastClear`
picks one of two strategies based on whether the for-block exclusively
owns its parent container:

- **Fast path** — `parent.textContent = ""` followed by re-attaching the
  anchor. Used when `items[0].start === parent.firstChild` _and_
  `anchor === parent.lastChild` (i.e., no sibling DOM in the parent).
  This is the fastest possible bulk-clear in browsers.
- **Slow path** — `Range.deleteContents()` over the items' DOM range.
  Used when siblings exist in the same parent (e.g., the anchor of an
  `each.empty` showBlock, or static template content rendered alongside
  the for-block). Removes only the items' nodes without touching
  siblings.

The `Range`-based slow path is correct and currently passes all tests,
but its performance has not been thoroughly characterized.

> **TODO (perf):** Benchmark `Range.deleteContents()` against alternative
> slow-path implementations — e.g., a manual `node.remove()` loop walking
> from `items[0].start` to `anchor.previousSibling`, batching via
> `DocumentFragment`, or detaching the parent and reattaching after a
> `textContent` clear. Pick whichever is fastest across the engines we
> care about. The fast path is already optimal; only the slow path is
> open for tuning.

---

## show-block.js — conditional rendering

Conditional rendering that creates and destroys DOM subtrees based on a
cell's truthiness.

```js
showBlock(container, condition, renderFn, deps?) → { update, destroy, isShowing }
```

Supports three condition types:

- **Cell** — subscribes to the cell, shows/hides on value change
- **Getter function** — calls the function on each update
- **Static value** — evaluates once

**No changes needed.** Like `forBlock`, `showBlock` already uses the `e[]`
subscriber array internally.

---

## switch-block.js — multi-branch rendering

Multi-branch rendering — the runtime target for `if/else if/else`, `switch`,
and `match`-style template constructs. Tracks which arm is active and only
swaps DOM when the active arm changes.

```js
switchBlock(container, arms, fallbackRender, deps?)
  → { update, destroy, get activeArm() }
```

- **arms** — ordered list of `{ test: () => boolean, render: (anchor) => { start, end, cleanup? } }`.
  Tests are evaluated in declaration order; first match wins.
- **fallbackRender** — optional render fn used when no arm matches; pass
  `null` to leave the block empty in that case.
- **deps** — cells the block subscribes to so updates re-pick the active arm.
- **activeArm** — `0..arms.length-1` for an arm, `arms.length` for the
  fallback, or `-1` when nothing is rendered.

**Discriminant vs predicate modes** are folded at compile time:

- **Discriminant mode** (`switch (x)`): each arm's test becomes
  `() => x === <armValue>`.
- **Predicate mode** (`if/else if`): each arm's test is its own boolean
  expression.

The runtime treats both modes the same — it just calls each arm's `test`
function until one returns truthy.

---

## template.js — DOM template creation

```js
template(html) → () => Node     // HTML templates
svgTemplate(svg) → () => Node   // SVG templates (proper namespace)
```

Creates a `<template>` element, sets `innerHTML`, and returns a function
that deep-clones `content`. SVG templates use `createElementNS` for correct
namespace handling.

**No changes needed.** Template cloning is purely a DOM operation.

### Future: `mathTemplate()` for MathML (lower priority)

MathML elements require the MathML namespace (`http://www.w3.org/1998/Math/MathML`)
to render correctly, just as SVG elements require the SVG namespace. A
`mathTemplate()` function would follow the same pattern as `svgTemplate()`:

```js
export const mathTemplate = (mathml) => {
  const wrapper = document.createElementNS(
    "http://www.w3.org/1998/Math/MathML",
    "math",
  );
  wrapper.innerHTML = mathml;
  const fragment = document.createDocumentFragment();
  while (wrapper.firstChild) {
    fragment.appendChild(wrapper.firstChild);
  }
  return () => cloneNode.call(fragment, true);
};
```

Beyond the runtime function, MathML support requires:

1. **Compiler detection** — the compiler must recognize MathML elements
   (`<math>`, `<mrow>`, `<mfrac>`, `<msup>`, etc.) and route to
   `mathTemplate()` instead of `template()`. This is the same pattern as
   SVG detection (the compiler already checks for `<svg>` and switches to
   `svgTemplate()`).

2. **Attribute handling** — MathML attributes use `setAttribute()` like SVG
   (not property assignment). The compiler's attribute lowering for MathML
   elements should follow the SVG path.

3. **No additional IR changes** — MathML elements are represented as regular
   `ElementIR` nodes with MathML tag names. The distinction between HTML,
   SVG, and MathML is a compiler/runtime concern, not an IR concern.

**Priority:** Lower — implement after the core compiler rewrite is working.
MathML support is a straightforward extension of the SVG pattern.

---

## index.js — public exports

All runtime primitives are re-exported from a single entry point. The
compiler emits `import { ... } from "roqa"` with only the functions used
by the component.

### Current exports

```js
// Template
export { template, svgTemplate } from "./template.js";

// Reactive primitives
export { cell, get, put, bind, notify, set } from "./cell.js";

// Event delegation
export { delegate, handleRootEvents } from "./events.js";

// Component definition
export { defineComponent, setProp, getProps } from "./component.js";

// List rendering
export { forBlock } from "./for-block.js";

// Conditional rendering
export { showBlock } from "./show-block.js";
```

### Required update

> **Already done** — `subscribe` has been added to the exports.

```js
export { cell, get, put, bind, notify, set, subscribe } from "./cell.js";
```

---

## Implementation order

The runtime changes are minimal — one new function and one updated export.
Here's when to make each change relative to the compiler rewrite:

### Before starting the compiler

> **Steps 1 and 2 are already done** — `subscribe()` has been added to
> `cell.js` and exported from `index.js`.

1. ~~**Add `subscribe()` to `cell.js`**~~ — ✅ Done.

2. ~~**Add `subscribe` to `index.js` exports**~~ — ✅ Done.

3. **Write tests for `subscribe()`** — verify:
   - Returns an unsubscribe function
   - Does NOT call callback immediately (unlike `bind`)
   - Callback is invoked when `set()` is called on the cell
   - Unsubscribe removes the callback from `e[]`
   - Multiple subscribers on the same cell all fire
   - Unsubscribing one doesn't affect others

### During compiler implementation

No runtime changes needed. The compiler emits code that uses the existing
runtime API. The `subscribe()` function will be available for cross-component
binding code generation.

### After compiler is working

4. **Profile real-world apps** — measure whether the synchronous subscriber
   notification loop causes performance issues with diamond dependencies or
   multi-cell updates.

5. **If needed: add microtask batching** — modify the notification loop in
   `set()` and in compiler-generated inlined sets. This is a runtime-only
   change — no IR or compiler changes needed.

6. **If needed: add `watch()` helper** — a convenience function for
   multi-cell observation built on `subscribe()`:

   ```js
   export function watch(cells, callback) {
     const notify = () => callback(cells.map((c) => c.v));
     const unsubs = cells.map((c) => subscribe(c, notify));
     return () => unsubs.forEach((fn) => fn());
   }
   ```

7. **If needed: add memoized computed support** — compiler-generated
   wrappers that skip notification when the computed result is unchanged:
   ```js
   // Compiler generates this for computed cells with downstream subscribers
   let prev = doubled.v;
   subscribe(count, () => {
     const next = count.v * 2;
     if (next !== prev) {
       prev = next;
       doubled.v = next;
       for (let i = 0; i < doubled.e.length; i++) doubled.e[i](next);
     }
   });
   ```

---

## API stability

The runtime API is the contract between the compiler and the browser. Changes
must be backward-compatible — compiled output from older compiler versions
should continue to work with newer runtime versions.

### Stable (will not change)

- Cell shape: `{ v, e: [] }` — changing this would break all compiled output
- `template()` / `svgTemplate()` signatures
- `defineComponent()` signature and `RoqaElement` base class
- `delegate()` and event delegation `__eventname` convention
- `forBlock()` and `showBlock()` signatures
- `setProp()` / `getProps()` signatures

### Stable but may gain optional parameters

- `bind()` — may accept an options object in the future (e.g., `{ once: true }`)
- `showBlock()` — already accepts optional `deps` array

### New in the rewrite

- `subscribe()` — new function, no backward compatibility concern

### Future additions (not part of v1)

- `watch(cells[], callback)` — multi-cell observation helper
- `batch(fn)` — explicit batching scope for synchronous multi-cell writes
- Microtask batching in the notification loop
- Memoized computed wrappers
- `mathTemplate(mathml)` — MathML namespace template creation (same pattern as SVG)
