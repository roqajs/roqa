# Rift Elements

A library of unstyled, accessible UI components for Rift, in the vein of Radix UI and Base UI.

## Installation

```bash
npm install rift-elements
```

## Components

### Switch

A toggle switch component with full accessibility support.

```tsx
import { defineComponent, cell, get, set, type RiftElement } from "rift-js";
import "rift-elements/switch";

function App(this: RiftElement) {
  const isEnabled = cell(false);

  this.on<{ checked: boolean }>("checked-change", (event) => {
    set(isEnabled, event.detail.checked);
  });

  return (
    <>
      <switch-root class="switch">
        <switch-thumb class="thumb"></switch-thumb>
      </switch-root>
      <p>Status: {get(isEnabled) ? "on" : "off"}</p>
    </>
  );
}

defineComponent("my-app", App);
```

#### Props

**`<switch-root>`**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean` | - | Controlled checked state |
| `defaultChecked` | `boolean` | `false` | Initial checked state (uncontrolled) |
| `disabled` | `boolean` | `false` | Whether the switch is disabled |
| `readOnly` | `boolean` | `false` | Whether the switch is read-only |
| `required` | `boolean` | `false` | Whether the switch is required in a form |
| `name` | `string` | - | Form field name (creates hidden checkbox) |
| `id` | `string` | - | Element ID |

#### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `checked-change` | `{ checked: boolean }` | Fired when the switch state changes |

#### Data Attributes

Both `<switch-root>` and `<switch-thumb>` have the following data attributes for styling:

| Attribute | Description |
|-----------|-------------|
| `data-checked` | Present when the switch is on |

#### ARIA Attributes

| Attribute | Description |
|-----------|-------------|
| `role="switch"` | Applied to root |
| `aria-checked` | Reflects checked state |
| `aria-disabled` | Present when disabled |
| `aria-readonly` | Present when read-only |
| `aria-required` | Present when required |

#### Styling Example

```css
.switch {
  position: relative;
  display: flex;
  padding: 2px;
  width: 2.5rem;
  height: 1.5rem;
  border-radius: 1.5rem;
  background-color: #ccc;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.switch[data-checked] {
  background-color: #0066cc;
}

.switch[aria-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
}

.thumb {
  display: block;
  aspect-ratio: 1 / 1;
  height: 100%;
  border-radius: 100%;
  background-color: white;
  transition: translate 150ms ease;
}

.thumb[data-checked] {
  translate: 1rem 0;
}
```

#### Methods

The `<switch-root>` element exposes methods for programmatic control:

```tsx
const switchEl = document.querySelector<RiftElement<SwitchRootMethods>>("switch-root");

// Toggle the switch
switchEl?.toggle();

// Set checked state
switchEl?.setChecked(true);

// Get current state
const isChecked = switchEl?.getChecked();
```