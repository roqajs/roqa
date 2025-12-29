import * as d3 from "d3";
import { defineComponent, cell, get, set, bind } from "rift-js";
import "./styles.css";

function App() {
	const data = cell([
		{ label: "A", value: 30 },
		{ label: "B", value: 80 },
		{ label: "C", value: 45 },
		{ label: "D", value: 60 },
		{ label: "E", value: 20 },
		{ label: "F", value: 90 },
	]);

	const width = 500;
	const height = 300;
	const margin = { top: 20, right: 20, bottom: 40, left: 40 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	const colors = d3.schemeTableau10;

	const randomizeData = () => {
		const newData = get(data).map((d) => ({
			...d,
			value: Math.floor(Math.random() * 100) + 10,
		}));
		set(data, newData);
	};

	const addBar = () => {
		const currentData = get(data);
		const nextLabel = String.fromCharCode(65 + currentData.length);
		if (currentData.length < 15) {
			// Create clone of data so <For> re-renders everything
			const newData = structuredClone(currentData);
			newData.push({ label: nextLabel, value: Math.floor(Math.random() * 100) + 10 });
			set(data, newData);
		}
	};

	const removeBar = () => {
		const currentData = get(data);
		if (currentData.length > 1) {
			// Create clone of data so <For> re-renders everything
			const newData = structuredClone(currentData.slice(0, -1));
			set(data, newData);
		}
	};

	const getScales = () => {
		const currentData = get(data);
		const xScale = d3
			.scaleBand()
			.domain(currentData.map((d) => d.label))
			.range([0, innerWidth])
			.padding(0.2);

		const yScale = d3
			.scaleLinear()
			.domain([0, d3.max(currentData, (d) => d.value) || 100])
			.nice()
			.range([innerHeight, 0]);

		return { xScale, yScale };
	};

	this.connected(() => {
		const xAxisGroup = this.querySelector(".x-axis");
		const yAxisGroup = this.querySelector(".y-axis");

		// Declaratively update axes when data changes
		bind(data, () => {
			const { xScale, yScale } = getScales();
			d3.select(xAxisGroup).call(d3.axisBottom(xScale));
			d3.select(yAxisGroup).call(d3.axisLeft(yScale).ticks(5));
		});
	});

	return (
		<>
			<h1>D3.js Bar Chart</h1>
			<div class="chart-container">
				<svg width={width} height={height}>
					<g transform={`translate(${margin.left},${margin.top})`}>
						<g class="bars">
							<For each={data}>
								{(item, index) => {
									const { xScale, yScale } = getScales();
									return (
										<rect
											x={xScale(item.label)}
											y={yScale(item.value)}
											width={xScale.bandwidth()}
											height={innerHeight - yScale(item.value)}
											fill={colors[index % colors.length]}
											rx="4"
										/>
									);
								}}
							</For>
						</g>
						<g class="x-axis" transform={`translate(0,${innerHeight})`}></g>
						<g class="y-axis"></g>
					</g>
				</svg>
			</div>
			<div class="controls">
				<button onclick={randomizeData}>Randomize Data</button>
				<button onclick={addBar}>Add Bar</button>
				<button onclick={removeBar}>Remove Bar</button>
			</div>
		</>
	);
}

defineComponent("data-visualization", App);
