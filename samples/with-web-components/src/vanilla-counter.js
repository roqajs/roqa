class VanillaCounter extends HTMLElement {
  constructor() {
    super();
    this.count = 0;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <button id="increment">Increment</button>
      <span id="value">${this.count}</span>
      <style>
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
      </style>
    `;
  }

  connectedCallback() {
    this.shadowRoot.getElementById('increment').addEventListener('click', () => {
      this.count++;
      this.shadowRoot.getElementById('value').textContent = this.count;
    });
  }

  disconnectedCallback() {
    this.shadowRoot.getElementById('increment').removeEventListener('click');
  }
}

customElements.define('vanilla-counter', VanillaCounter);