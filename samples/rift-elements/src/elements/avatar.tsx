import { defineComponent } from "rift-js";
import "rift-elements/avatar";
import "./avatar.css";

function AvatarDemo() {
	return (
		<>
			<section>
				<h2>With Image</h2>
				<p class="hint">Image loads successfully, fallback is hidden</p>
				<div class="avatar-row">
					<avatar-root>
						<avatar-image
							src="https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=128&h=128&dpr=2&q=80"
							alt="User avatar"
						/>
						<avatar-fallback>LT</avatar-fallback>
					</avatar-root>
				</div>
			</section>
			<section>
				<h2>With Broken Image (Fallback)</h2>
				<p class="hint">Image fails to load, fallback initials are shown</p>
				<div class="avatar-row">
					<avatar-root>
						<avatar-image src="https://broken-url.invalid/avatar.jpg" alt="User avatar" />
						<avatar-fallback>AB</avatar-fallback>
					</avatar-root>
				</div>
			</section>
			<section>
				<h2>Fallback Only (No Image)</h2>
				<p class="hint">No image provided, just initials</p>
				<div class="avatar-row">
					<avatar-root>
						<avatar-fallback>JD</avatar-fallback>
					</avatar-root>
				</div>
			</section>
			<section>
				<h2>With Delay</h2>
				<p class="hint">Fallback shows after 500ms delay if image fails</p>
				<div class="avatar-row">
					<avatar-root>
						<avatar-image src="https://broken-url.invalid/slow.jpg" alt="User avatar" />
						<avatar-fallback delay={500}>DL</avatar-fallback>
					</avatar-root>
				</div>
			</section>
			<section>
				<h2>Text Content Only</h2>
				<p class="hint">Simple text directly in root (no fallback component)</p>
				<div class="avatar-row">
					<avatar-root>TC</avatar-root>
				</div>
			</section>
			<section>
				<h2>Multiple Sizes</h2>
				<p class="hint">Styled with CSS custom properties</p>
				<div class="avatar-row">
					<avatar-root class="avatar-sm">
						<avatar-image
							src="https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=128&h=128&dpr=2&q=80"
							alt="Small avatar"
						/>
						<avatar-fallback>SM</avatar-fallback>
					</avatar-root>
					<avatar-root>
						<avatar-image
							src="https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=128&h=128&dpr=2&q=80"
							alt="Medium avatar"
						/>
						<avatar-fallback>MD</avatar-fallback>
					</avatar-root>
					<avatar-root class="avatar-lg">
						<avatar-image
							src="https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=128&h=128&dpr=2&q=80"
							alt="Large avatar"
						/>
						<avatar-fallback>LG</avatar-fallback>
					</avatar-root>
				</div>
			</section>
		</>
	);
}

defineComponent("avatar-demo", AvatarDemo);
