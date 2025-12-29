import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";

function SliderMath() {
	const a = cell(1);
	const b = cell(2);

	const setFromA = (e: Event) => {
		const val = parseInt((e.target as HTMLInputElement).value, 10) || 0;
		set(a, val);
	};

	const setFromB = (e: Event) => {
		const val = parseInt((e.target as HTMLInputElement).value, 10) || 0;
		set(b, val);
	};

	return (
		<>
			<label>
				<input type="number" value={get(a)} min="0" max="10" oninput={setFromA} />
				<input type="range" value={get(a)} min="0" max="10" oninput={setFromA} />
			</label>
			<label>
				<input type="number" value={get(b)} min="0" max="10" oninput={setFromB} />
				<input type="range" value={get(b)} min="0" max="10" oninput={setFromB} />
			</label>
			<p>
				{get(a)} + {get(b)} = {get(a) + get(b)}
			</p>
		</>
	);
}

defineComponent("slider-math", SliderMath);
