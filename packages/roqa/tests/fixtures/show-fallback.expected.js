import { defineComponent, delegate, showBlock, template } from "roqa";

const $tmpl_1 = template("<div></div>");
const $tmpl_2 = template("<p>Welcome back!</p>");
const $tmpl_3 = template("<button>Log in</button>");

defineComponent("auth-gate", function AuthGate() {
	const loggedIn = { v: false, e: [] };

	let loggedIn_showBlock;
	let loggedIn_fallbackBlock;

	const login = () => {
		loggedIn.v = true;
		loggedIn_showBlock.update();
		loggedIn_fallbackBlock.update();
	};

	this.connected(() => {
		const $root_1 = $tmpl_1();
		this.appendChild($root_1);

		const div_1 = this.firstChild;

		loggedIn_showBlock = showBlock(div_1, loggedIn, (anchor) => {
			const p_1 = $tmpl_2().firstChild;
			anchor.before(p_1);
			return { start: p_1, end: p_1 };
		});

		loggedIn_fallbackBlock = showBlock(div_1, () => !loggedIn.v, (anchor) => {
			const button_1 = $tmpl_3().firstChild;

			button_1.__click = login;

			anchor.before(button_1);
			return { start: button_1, end: button_1 };
		}, [loggedIn]);
	});
});

delegate(["click"]);
