import { defineComponent, bind, type RiftElement } from "rift-js";
import type { SwitchRootMethods } from "./types";

/**
 * The movable part of the switch that indicates whether the switch is on or off.
 * Must be used as a child of `<switch-root>`.
 *
 * Mirrors the parent switch state via attributes:
 *
 * - `checked` - Present when the switch is checked
 * - `unchecked` - Present when the switch is not checked
 * - `disabled` - Present when the switch is disabled
 * - `readonly` - Present when the switch is readonly
 * - `required` - Present when the switch is required
 *
 * @example
 * ```tsx
 * <switch-root>
 *   <switch-thumb></switch-thumb>
 * </switch-root>
 * ```
 */
export function SwitchThumb(this: RiftElement) {
	this.connected(() => {
		const root = this.closest("switch-root") as RiftElement<SwitchRootMethods> | null;
		if (!root) {
			console.warn("<switch-thumb> must be used inside <switch-root>");
			return;
		}
		const unbindChecked = bind(root._checkedCell, (checked) => {
			this.stateAttr("checked", checked);
		});
		const unbindDisabled = bind(root._disabledCell, (disabled) => {
			this.toggleAttr("disabled", disabled);
		});
		const unbindReadOnly = bind(root._readOnlyCell, (readOnly) => {
			this.toggleAttr("readonly", readOnly);
		});
		const unbindRequired = bind(root._requiredCell, (required) => {
			this.toggleAttr("required", required);
		});
		return () => {
			unbindChecked();
			unbindDisabled();
			unbindReadOnly();
			unbindRequired();
		};
	});
}

defineComponent("switch-thumb", SwitchThumb);
