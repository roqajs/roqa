import { defineComponent, cell, get, set } from "roqa";
import "./styles.css";

function TailwindCounter() {
	const count = cell(0);

	const increment = () => set(count, get(count) + 1);
	const decrement = () => set(count, get(count) - 1);
	const reset = () => set(count, 0);

	return (
		<div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
			<div class="bg-white border border-gray-200 rounded-lg shadow-sm p-5 w-full max-w-xs">
				<h1 class="text-base font-semibold text-gray-900 text-center">Roqa + Tailwind</h1>
				<p class="text-xs text-gray-500 text-center mb-4">A reactive counter example</p>

				<div class="border border-gray-200 rounded-md p-4 mb-4 bg-gray-50">
					<p class="text-4xl font-medium text-gray-900 text-center tabular-nums">{get(count)}</p>
				</div>

				<div class="flex items-center gap-1.5">
					<button
						onclick={decrement}
						class="flex-1 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 text-sm font-medium py-1.5 px-2 rounded-md transition-colors duration-150"
					>
						−
					</button>
					<button
						onclick={reset}
						class="flex-1 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 text-sm font-medium py-1.5 px-2 rounded-md transition-colors duration-150"
					>
						Reset
					</button>
					<button
						onclick={increment}
						class="flex-1 bg-gray-900 hover:bg-gray-800 active:bg-gray-700 text-white text-sm font-medium py-1.5 px-2 rounded-md transition-colors duration-150"
					>
						+
					</button>
				</div>
			</div>
		</div>
	);
}

defineComponent("tailwind-counter", TailwindCounter);
