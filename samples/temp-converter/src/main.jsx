import { defineComponent, cell, get, set } from 'rift-js';
import './styles.css';

function TempConverter() {
	const celsius = cell(0);
	const fahrenheit = cell(32);

	const setFromC = (e) => {
		const c = parseFloat(e.target.value) || 0;
		set(celsius, c);
		set(fahrenheit, (c * 9 / 5 + 32).toFixed(1));
	};

	const setFromF = (e) => {
		const f = parseFloat(e.target.value) || 0;
		set(fahrenheit, f);
		set(celsius, ((f - 32) * 5 / 9).toFixed(1));
	};

	return (
		<>
			<input type="number" oninput={setFromC} value={get(celsius)} />
			°C =
			<input type="number" oninput={setFromF} value={get(fahrenheit)} /> °F
		</>
	);
}

defineComponent('temp-converter', TempConverter);
