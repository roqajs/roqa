import { defineComponent, cell, get, set } from 'rift-js';
import './styles.css';

function App() {
	let count = cell(0);

	const increment = () => {
		set(count, get(count) + 1);
	};

	return (
		<>
			<h1>Hello Rift</h1>
			<button onclick={increment}>Count is {get(count)}</button>
		</>
	);
}

defineComponent('rift-app', App);
