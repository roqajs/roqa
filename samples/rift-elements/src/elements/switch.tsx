import { defineComponent, cell, get, set, type RiftElement } from "rift-js";
// Import switch components (registers the custom elements)
import "rift-elements/switch";
import "./switch.css";

function SwitchDemo(this: RiftElement) {
	const basicStatus = cell("off");

	// Use connected callback to set up event listener on specific switch
	this.connected(() => {
		const basicSwitch = this.querySelector<HTMLElement>("#basic-switch");
		basicSwitch?.addEventListener("checked-change", (e: Event) => {
			const detail = (e as CustomEvent<{ checked: boolean }>).detail;
			set(basicStatus, detail.checked ? "on" : "off");
		});
	});

	return (
		<>
			<h1>Switch</h1>
			<p class="description">A component used to toggle between two states, such as on and off.</p>
			<section>
				<h2>Basic Switch</h2>
				<switch-root id="basic-switch">
					<switch-thumb></switch-thumb>
				</switch-root>
				<p>Status: {get(basicStatus)}</p>
			</section>
			<section>
				<h2>Default Checked</h2>
				<switch-root defaultChecked={true}>
					<switch-thumb></switch-thumb>
				</switch-root>
			</section>
			<section>
				<h2>Disabled Switch</h2>
				<switch-root disabled={true}>
					<switch-thumb></switch-thumb>
				</switch-root>
			</section>
			<section>
				<h2>Read-Only Switch</h2>
				<switch-root defaultChecked={true} readOnly={true}>
					<switch-thumb></switch-thumb>
				</switch-root>
			</section>
			<section>
				<h2>With Form Name</h2>
				<form
					onsubmit={(e: Event) => {
						e.preventDefault();
						const formData = new FormData(e.target as HTMLFormElement);
						alert("Form submitted! Notifications: " + formData.get("notifications"));
					}}
				>
					<switch-root id="notifications-switch" name="notifications" defaultChecked={true}>
						<switch-thumb></switch-thumb>
					</switch-root>
					<label for="notifications-switch">Enable Notifications</label>
					<button type="submit">Submit</button>
				</form>
			</section>
			<section class="validation-demo">
				<h2>Required with CSS Validity</h2>
				<p class="hint">
					Toggle the switch to see <code>:valid</code> and <code>:invalid</code> CSS states
				</p>
				<form
					onsubmit={(e: Event) => {
						e.preventDefault();
						alert("Form is valid! Terms accepted.");
					}}
				>
					<switch-root id="terms-switch" name="terms" required={true}>
						<switch-thumb></switch-thumb>
					</switch-root>
					<label for="terms-switch">I accept the terms and conditions</label>
					<button type="submit">Submit</button>
				</form>
			</section>
		</>
	);
}

defineComponent("switch-demo", SwitchDemo);
