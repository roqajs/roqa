import { defineComponent, cell, get, set, type RiftElement, Show } from "rift-js";
import "./elements/switch";
import "./elements/avatar";
import "./main.css";

type Demo = "avatar" | "switch";

function App(this: RiftElement) {
	const activeDemo = cell<Demo>("avatar");

	const selectDemo = (demo: Demo) => {
		set(activeDemo, demo);
	};

	return (
		<>
			<header>
				<h1>Rift Elements</h1>
			</header>
			<div class="app-layout">
				<aside class="sidebar">
					<h2>Components</h2>
					<nav>
						<button
							class="nav-item"
							data-active={get(activeDemo) === "avatar" ? "true" : "false"}
							onclick={() => selectDemo("avatar")}
						>
							Avatar
						</button>
						<button
							class="nav-item"
							data-active={get(activeDemo) === "switch" ? "true" : "false"}
							onclick={() => selectDemo("switch")}
						>
							Switch
						</button>
					</nav>
				</aside>
				<main class="content">
					<Show when={get(activeDemo) === "avatar"}>
						<avatar-demo></avatar-demo>
					</Show>
					<Show when={get(activeDemo) === "switch"}>
						<switch-demo></switch-demo>
					</Show>
				</main>
			</div>
		</>
	);
}

defineComponent("rift-elements", App);
