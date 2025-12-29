import { defineComponent, cell, get, set } from "rift-js";
import "./styles.css";

function StopWatch() {
	const isRunning = cell(false);
	const time = cell(Number(0).toFixed(2));
	let intervalId = null;

	const toggle = () => {
		if (get(isRunning)) {
			// Stop the stopwatch
			clearInterval(intervalId);
			intervalId = null;
			set(isRunning, false);
		} else {
			// Start the stopwatch
			const startTime = Date.now() - get(time) * 1000;
			intervalId = setInterval(() => {
				const elapsed = (Date.now() - startTime) / 1000;
				set(time, elapsed.toFixed(2));
			}, 10);
			set(isRunning, true);
		}
	};

	const reset = () => {
		if (get(isRunning)) {
			clearInterval(intervalId);
			intervalId = null;
			set(isRunning, false);
		}
		set(time, Number(0).toFixed(2));
	};

	return (
		<>
			<p>{get(time)}</p>
			<button onclick={toggle}>{get(isRunning) ? "Stop" : "Start"}</button>
			<button onclick={reset}>Reset</button>
		</>
	);
}

defineComponent("stop-watch", StopWatch);
