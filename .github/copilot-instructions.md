---
applyTo: '**'
---

# Rift Project Overview

Rift is a **compile-time reactive UI framework** for building web components with JSX syntax. Unlike virtual DOM frameworks, Rift compiles JSX into highly optimized vanilla JavaScript that directly manipulates the DOM.

## Core Concepts

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Build Time                             │
│   ┌──────────┐    ┌────────────────┐    ┌───────────────────┐   │
│   │  .jsx    │───▶│  Vite Plugin   │───▶│  Compiled Output  │   │
│   │  files   │    │  (rift-js)     │    │  (vanilla JS)     │   │
│   └──────────┘    └────────────────┘    └───────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                           Runtime                              │
│   ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│   │   template   │  │    cell      │  │  defineComponent   │   │
│   │  (DOM clone) │  │  (reactive)  │  │  (web component)   │   │
│   └──────────────┘  └──────────────┘  └────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Key Primitives

| Primitive          | Purpose                      | Compiled Form                               |
| ------------------ | ---------------------------- | ------------------------------------------- |
| `cell(value)`      | Create reactive state        | `{ v: value, e: [] }`                       |
| `get(cell)`        | Read cell value              | `cell.v`                                    |
| `put(cell, value)` | Write without notifying      | `cell.v = value`                            |
| `set(cell, value)` | Write and notify subscribers | `{ cell.v = value; /* inlined updates */ }` |
| `bind(cell, fn)`   | Subscribe to changes         | Inlined at `set()` call sites               |
| `notify(cell)`     | Trigger all subscribers      | Loops over `cell.e` and calls each          |

---

## Project Structure

```
packages/
├── rift-js/          # Core framework
│   └── src/
│       ├── compiler/ # JSX → JS compiler (build-time)
│       └── runtime/  # Minimal runtime helpers
└── vite-plugin/      # Vite integration
```

---

## Compiler Deep Dive

> ⚠️ **CRITICAL FOR AI MODELS**: The compiler has a **strict 4-phase pipeline**. Each phase has specific inputs and outputs. Do not conflate phases.

### Compiler Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPILATION PIPELINE                                │
│                                                                             │
│   Source (.jsx)                                                             │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 1: PARSE                                                     │   │
│   │  ────────────────                                                   │   │
│   │  File: parser.js                                                    │   │
│   │  Input: JSX source code string                                      │   │
│   │  Output: Babel AST                                                  │   │
│   │  Uses: @babel/parser with jsx plugin                                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 2: VALIDATE                                                  │   │
│   │  ─────────────────                                                  │   │
│   │  File: transforms/validate.js                                       │   │
│   │  Input: Babel AST                                                   │   │
│   │  Output: AST (unchanged) or throws error                            │   │
│   │  Purpose: Reject unsupported PascalCase components                  │   │
│   │  Note: <For> and <Show> are the ONLY allowed PascalCase components  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 3: GENERATE OUTPUT                                           │   │
│   │  ────────────────────────                                           │   │
│   │  File: codegen.js (orchestrator)                                    │   │
│   │  Input: Original source + AST                                       │   │
│   │  Output: Transformed source code                                    │   │
│   │                                                                     │   │
│   │  Sub-transforms (all run within this phase):                        │   │
│   │  ┌──────────────────────────────────────────────────────────────┐   │   │
│   │  │ jsx-to-template.js  │ JSX → HTML template strings + traversal│   │   │
│   │  ├──────────────────────────────────────────────────────────────┤   │   │
│   │  │ for-transform.js    │ <For> → forBlock() calls              │   │   │
│   │  ├──────────────────────────────────────────────────────────────┤   │   │
│   │  │ show-transform.js   │ <Show> → showBlock() calls            │   │   │
│   │  ├──────────────────────────────────────────────────────────────┤   │   │
│   │  │ events.js           │ onclick={fn} → el.__click = fn         │   │   │
│   │  ├──────────────────────────────────────────────────────────────┤   │   │
│   │  │ bind-detector.js    │ Finds get() calls, generates bind()    │   │   │
│   │  └──────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PHASE 4: INLINE OPTIMIZATIONS                                      │   │
│   │  ────────────────────────────                                       │   │
│   │  File: transforms/inline-get.js                                     │   │
│   │  Input: Generated code from Phase 3                                 │   │
│   │  Output: Final optimized code                                       │   │
│   │                                                                     │   │
│   │  Transforms:                                                        │   │
│   │    get(cell)     → cell.v                                           │   │
│   │    cell(value)   → { v: value, e: [] }                              │   │
│   │    put(cell, v)  → cell.v = v                                       │   │
│   │    set(cell, v)  → { cell.v = v; /* inlined DOM updates */ }        │   │
│   │    bind(cell,fn) → cell.ref_N = element (callbacks inlined at set)  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│   Final Output (.js)                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entry Point

**File**: `packages/rift-js/src/compiler/index.js`

```js
export function compile(code, filename) {
  const ast = parse(code, filename); // Phase 1
  validateNoCustomComponents(ast); // Phase 2
  const result = generateOutput(code, ast); // Phase 3
  const inlined = inlineGetCalls(result.code); // Phase 4
  return inlined;
}
```

---

## Phase 3 Detail: Code Generation

Phase 3 is the most complex phase. Here's what happens:

### 3.1 Template Extraction (`jsx-to-template.js`)

Converts JSX to static HTML template strings and DOM traversal code.

**Input:**

```jsx
<div class="foo">
  <span>{get(name)}</span>
</div>
```

**Output:**

```js
const $tmpl_1 = template('<div class="foo"><span> </span></div>');

// Traversal code generated:
const div_1 = this.firstChild;
const span_1 = div_1.firstChild;
const span_1_text = span_1.firstChild; // The space placeholder
```

Key insight: Dynamic text uses a **space placeholder** (`' '`) in the template, creating a text node that can be updated via `nodeValue`.

### 3.2 For Transform (`for-transform.js`)

Transforms `<For>` components into `forBlock()` runtime calls.

**Input:**

```jsx
<For each={items}>{(item) => <li>{get(item.name)}</li>}</For>
```

**Output:**

```js
forBlock(container, items, (anchor, item, index) => {
  const li_1 = $tmpl_2().firstChild;
  // ... bindings
  anchor.before(li_1);
  return { start: li_1, end: li_1 };
});
```

### 3.3 Show Transform (`show-transform.js`)

Transforms `<Show>` components into `showBlock()` runtime calls for conditional rendering.

**Input:**

```jsx
<Show when={get(isVisible)}>
  <div>Conditional content</div>
</Show>
```

**Output:**

```js
showBlock(container, isVisible, (anchor) => {
  const div_1 = $tmpl_3().firstChild;
  anchor.before(div_1);
  return { start: div_1, end: div_1 };
});
```

### 3.4 Event Transform (`events.js`)

Converts JSX event handlers to delegated event format.

**Input:**

```jsx
<button onclick={handleClick}>Click</button>
<button onclick={() => select(item)}>Select</button>
```

**Output:**

```js
button_1.__click = handleClick; // Simple handler
button_2.__click = [select, item]; // Parameterized (array format)
```

### 3.5 Bind Detection (`bind-detector.js`)

Finds `get()` calls in expressions and generates reactive bindings.

**Input:**

```jsx
<p class={get(isActive) ? 'active' : ''}>{get(count)}</p>
```

**Output:**

```js
p_1.className = get(isActive) ? 'active' : '';
bind(isActive, (v) => {
  p_1.className = v ? 'active' : '';
});

p_1_text.nodeValue = get(count);
count.ref_1 = p_1_text; // For direct ref updates
```

---

## Phase 4 Detail: Inlining (`inline-get.js`)

This phase eliminates runtime overhead by:

1. **Inlining primitive calls:**

- `get(cell)` → `cell.v`
- `cell(value)` → `{ v: value, e: [] }`
- `put(cell, value)` → `cell.v = value`

2. **Inlining `set()` with DOM updates:**

```js
// Before
set(count, count.v + 1);

// After (bind callbacks inlined)
{
  count.v = count.v + 1;
  count.ref_1.nodeValue = count.v;
}
```

3. **Removing `bind()` calls** and storing element refs on cells:
   ```js
   // bind() is removed, ref stored for set() to use
   count.ref_1 = p_1_text;
   ```

---

## Vite Plugin

**File**: `packages/vite-plugin/src/index.js`

The plugin:

1. Preserves JSX (doesn't let esbuild transform it)
2. Intercepts `.jsx` files
3. Calls the Rift compiler
4. Returns transformed code with source maps

```js
transform(code, id) {
  if (!id.endsWith('.jsx')) return null;
  return compile(code, id);
}
```

---

## Runtime (`packages/rift-js/src/runtime/`)

Minimal runtime for features that can't be compile-time:

| Module          | Purpose                                        |
| --------------- | ---------------------------------------------- |
| `template.js`   | Creates cloneable DOM templates (HTML and SVG) |
| `cell.js`       | Reactive primitives (fallback if not inlined)  |
| `component.js`  | `defineComponent()` for web components         |
| `for-block.js`  | Efficient list reconciliation (LIS algorithm)  |
| `show-block.js` | Conditional rendering (`<Show>` component)     |
| `events.js`     | Event delegation system                        |

### Component API (`component.js`)

The `RiftElement` base class provides these methods on `this`:

| Method                          | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `connected(fn)`                 | Register callback for when mounted          |
| `disconnected(fn)`              | Register callback for when unmounted        |
| `on(event, handler)`            | Add event listener (auto-cleanup)           |
| `emit(event, detail)`           | Dispatch custom event                       |
| `toggleAttr(name, condition)`   | Add/remove boolean attribute                |
| `stateAttr(name, condition)`    | Set mutually exclusive attrs (e.g. checked/unchecked) |
| `attrChanged(name, callback)`   | React to observed attribute changes         |

`defineComponent()` accepts an options object:

```js
defineComponent('my-switch', Switch, {
  observedAttributes: ['checked', 'disabled']  // Enable attrChanged() for these
});
```

---

## Example Transformation

### Input (JSX)

```jsx
import { defineComponent, cell, get, set } from 'rift-js';

function Counter() {
  const count = cell(0);
  return <button onclick={() => set(count, get(count) + 1)}>Count: {get(count)}</button>;
}
defineComponent('my-counter', Counter);
```

### Output (Compiled)

```js
import { defineComponent, delegate, template } from 'rift-js';

const $tmpl_1 = template('<button> </button>');

function Counter() {
  const count = { v: 0, e: [] };

  this.connected(() => {
    const button_1 = this.firstChild;
    const button_1_text = button_1.firstChild;

    button_1.__click = () => {
      count.v = count.v + 1;
      count.ref_1.nodeValue = 'Count: ' + count.v;
    };

    button_1_text.nodeValue = 'Count: ' + count.v;
    count.ref_1 = button_1_text;
  });
}
defineComponent('my-counter', Counter);
delegate(['click']);
```

---

## Common Gotchas for AI Models

1. **No component composition**: Rift does NOT support `<MyComponent>` syntax. Use web components via `defineComponent()`.

2. **`<For>` and `<Show>` are special**: They're the only PascalCase elements allowed. `<For>` compiles to `forBlock()`, `<Show>` compiles to `showBlock()`.

3. **Phase order matters**: Don't try to inline `get()` calls before code generation. Phase 4 needs the full context.

4. **Templates are static**: All dynamic content becomes traversal code + bindings. You can't have conditional elements in templates (use `<Show>` instead).

5. **Event delegation**: Events use `__eventname` properties, not `addEventListener`. The `delegate()` call registers them at the document level.
