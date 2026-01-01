import { defineComponent, cell, get, set, type RiftElement } from "rift-js";
// Import button component (registers the custom element)
import "rift-elements/button";
import "./button.css";

function ButtonDemo(this: RiftElement) {
	const clickCount = cell(0);
	const loading = cell(false);

	return (
		<>
			<h1>Button</h1>
			<p class="description">A component used to trigger actions.</p>
			<section>
				<h2>Basic Button</h2>
				<button-root onclick={() => set(clickCount, get(clickCount) + 1)}>
					Count is {get(clickCount)}
				</button-root>
			</section>
			<section>
				<h2>Disabled Button</h2>
				<button-root disabled>Disabled</button-root>
			</section>
			<section>
				<h2>Focusable When Disabled</h2>
				<p class="hint">Button remains in tab order when disabled. Useful for loading states.</p>
				<button-root disabled focusableWhenDisabled>
					Still Focusable
				</button-root>
			</section>
			<section>
				<h2>Loading State</h2>
				<p class="hint">Click to simulate a loading state. Focus stays on the button.</p>
				<button-root
					disabled={get(loading)}
					focusableWhenDisabled
					onclick={() => {
						set(loading, true);
						setTimeout(() => set(loading, false), 2000);
					}}
				>
					{get(loading) ? "Loading..." : "Submit"}
				</button-root>
			</section>
			<section>
				<h2>Form Submit</h2>
				<form
					onsubmit={(e: Event) => {
						e.preventDefault();
						const formData = new FormData(e.target as HTMLFormElement);
						alert("Form submitted! Action: " + formData.get("action"));
					}}
				>
					<input type="text" name="username" placeholder="Username" />
					<button-root type="submit" name="action" value="save">
						Save
					</button-root>
				</form>
			</section>
			<section>
				<h2>Form Reset</h2>
				<form>
					<input type="text" name="field" placeholder="Type something..." />
					<button-root type="reset">Reset Form</button-root>
				</form>
			</section>
		</>
	);
}

defineComponent("button-demo", ButtonDemo);
