import { html, css, LitElement } from 'lit';

export class LitWebComponent extends LitElement {
	static styles = css`
		button {
			font-size: 16px;
			padding: 8px 12px;
			margin-right: 10px;
			border: 2px solid #ccc;
			border-radius: 4px;
			background-color: #f9f9f9;
			cursor: pointer;
		}
		span {
			font-size: 16px;
			font-weight: bold;
		}
	`;

	static properties = {
		count: { type: Number },
		incrementAmount: { type: Number, attribute: 'increment-amount' },
	};

	constructor() {
		super();
		this.count = 0;
		this.incrementAmount = 1;
	}

	render() {
		return html`<button @click=${() => (this.count += this.incrementAmount)}>Increment</button
			><span>${this.count}</span>`;
	}
}
customElements.define('lit-counter', LitWebComponent);
