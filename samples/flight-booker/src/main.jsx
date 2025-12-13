import { defineComponent, cell, get, set } from 'rift-js';
import './styles.css';

function pad(n, s = String(n)) {
	return s.length < 2 ? `0${s}` : s;
}

function dateToString(date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function stringToDate(str) {
	const [y, m, d] = str.split('-');
	return new Date(+y, m - 1, +d);
}

function FlightBooker() {
	const today = dateToString(new Date());

	const destination = cell('El Dorado');
	const tripType = cell('one-way');
	const departDate = cell(today);
	const returnDate = cell(today);
	const returnDateDisabled = cell(true);
	const bookDisabled = cell(false);
	const showDateError = cell(false);
	const showDestinationError = cell(false);

	const isRoundTrip = () => get(tripType) === 'round-trip';
	const hasDestination = () => get(destination) !== '';
	const canBook = () =>
		!isRoundTrip() || stringToDate(get(returnDate)) >= stringToDate(get(departDate));

	const updateDestination = (e) => {
		set(destination, e.target.value);
		checkForErrors();
	};

	const updateTripType = (e) => {
		set(tripType, e.target.value);
		checkForErrors();
	};

	const updateDepartDate = (e) => {
		set(departDate, e.target.value);
		checkForErrors();
	};

	const updateReturnDate = (e) => {
		set(returnDate, e.target.value);
		checkForErrors();
	};

	const checkForErrors = () => {
		set(returnDateDisabled, !isRoundTrip());
		set(bookDisabled, !canBook() || !hasDestination());
		set(showDateError, !canBook());
		set(showDestinationError, !hasDestination());
	};

	const bookTrip = () => {
		const message = isRoundTrip()
			? `You booked a round-trip to ${get(destination)} leaving on ${get(
					departDate
			  )} and returning on ${get(returnDate)}.`
			: `You booked a one-way flight to ${get(destination)} leaving on ${get(departDate)}.`;
		alert(message);
	};

	return (
		<>
			<input
				type="text"
				oninput={updateDestination}
				value={get(destination)}
				placeholder="Destination"
			/>
			<select onchange={updateTripType} value={get(tripType)}>
				<option value="one-way">One-way</option>
				<option value="round-trip">Round-trip</option>
			</select>
			<input type="date" onchange={updateDepartDate} value={get(departDate)} />
			<input
				type="date"
				onchange={updateReturnDate}
				value={get(returnDate)}
				disabled={get(returnDateDisabled)}
			/>
			<button onclick={bookTrip} disabled={get(bookDisabled)}>
				Book
			</button>
			<p class={get(showDateError) ? 'error visible' : 'error'}>
				Return date must be after departure date.
			</p>
			<p class={get(showDestinationError) ? 'error visible' : 'error'}>
				Please choose a destination.
			</p>
		</>
	);
}

defineComponent('flight-booker', FlightBooker);
