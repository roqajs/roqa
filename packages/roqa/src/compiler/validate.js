/** @typedef {import("./types.d.ts").ComponentIR} ComponentIR */
/** @typedef {import("./types.d.ts").Diagnostic} Diagnostic */
/** @typedef {import("./types.d.ts").ExprIR} ExprIR */
/** @typedef {import("./types.d.ts").NodeIR} NodeIR */

/**
 * Validate a ComponentIR for structural correctness.
 * @param {ComponentIR} mir
 * @returns {Diagnostic[]}
 */
export function validate(mir) {
	/** @type {Diagnostic[]} */
	const diagnostics = [];
	const component = mir.tagName;

	// Version check
	if (mir.version !== 1) {
		diagnostics.push({
			code: "invalid-version",
			severity: "error",
			message: `Expected MIR version 1, got ${mir.version}`,
			component,
		});
	}

	// Tag name validation
	if (!mir.tagName || !mir.tagName.includes("-") || mir.tagName !== mir.tagName.toLowerCase()) {
		diagnostics.push({
			code: "invalid-tag-name",
			severity: "error",
			message: `Tag name "${mir.tagName}" is not a valid custom element name (must contain hyphen, be lowercase)`,
			component,
		});
	}

	// Collect declared names
	const stateNames = new Set(mir.state.map((s) => s.name));
	const actionNames = new Set(mir.actions.map((a) => a.name));
	const propNames = new Set(mir.props.map((p) => p.name));
	const computedNames = new Set(
		mir.state.filter((s) => s.kind === "computed").map((s) => s.name),
	);

	// Duplicate name checks
	checkDuplicates(mir.state.map((s) => s.name), "state", component, diagnostics);
	checkDuplicates(mir.actions.map((a) => a.name), "action", component, diagnostics);
	checkDuplicates(mir.props.map((p) => p.name), "prop", component, diagnostics);
	checkDuplicates(mir.attrs.map((a) => a.name), "attr", component, diagnostics);
	checkDuplicates(mir.emits.map((e) => e.name), "emit", component, diagnostics);

	// Walk all expressions to check refs
	const allCellNames = new Set([...stateNames]);

	/**
	 * @param {ExprIR} expr
	 * @param {string[]} path
	 */
	function validateExpr(expr, path) {
		if (!expr || typeof expr !== "object") return;

		switch (expr.kind) {
			case "state-read":
				if (!allCellNames.has(expr.name)) {
					diagnostics.push({
						code: "dangling-cell-ref",
						severity: "error",
						message: `State read "${expr.name}" references undeclared state`,
						component,
						path,
					});
				}
				break;
			case "state-write":
				if (!allCellNames.has(expr.name)) {
					diagnostics.push({
						code: "dangling-cell-ref",
						severity: "error",
						message: `State write "${expr.name}" references undeclared state`,
						component,
						path,
					});
				}
				validateExpr(expr.value, [...path, "value"]);
				break;
			case "computed-read":
				if (!computedNames.has(expr.name)) {
					diagnostics.push({
						code: "dangling-computed-ref",
						severity: "error",
						message: `Computed read "${expr.name}" references undeclared computed`,
						component,
						path,
					});
				}
				break;
			case "action-call":
				if (!actionNames.has(expr.name)) {
					diagnostics.push({
						code: "dangling-action-ref",
						severity: "error",
						message: `Action call "${expr.name}" references undeclared action`,
						component,
						path,
					});
				}
				for (let i = 0; i < expr.args.length; i++) {
					validateExpr(expr.args[i], [...path, "args", String(i)]);
				}
				break;
			case "binary":
				validateExpr(expr.left, [...path, "left"]);
				validateExpr(expr.right, [...path, "right"]);
				break;
			case "unary":
				validateExpr(expr.operand, [...path, "operand"]);
				break;
			case "conditional":
				validateExpr(expr.test, [...path, "test"]);
				validateExpr(expr.consequent, [...path, "consequent"]);
				validateExpr(expr.alternate, [...path, "alternate"]);
				break;
			case "member":
				validateExpr(expr.object, [...path, "object"]);
				break;
			case "index":
				validateExpr(expr.object, [...path, "object"]);
				validateExpr(expr.index, [...path, "index"]);
				break;
			case "call":
				validateExpr(expr.callee, [...path, "callee"]);
				for (let i = 0; i < expr.args.length; i++) {
					validateExpr(expr.args[i], [...path, "args", String(i)]);
				}
				break;
			case "method-call":
				validateExpr(expr.object, [...path, "object"]);
				for (let i = 0; i < expr.args.length; i++) {
					validateExpr(expr.args[i], [...path, "args", String(i)]);
				}
				break;
			case "block":
				for (let i = 0; i < expr.body.length; i++) {
					validateExpr(expr.body[i], [...path, "body", String(i)]);
				}
				break;
			case "closure":
				validateExpr(expr.body, [...path, "body"]);
				break;
			case "collection-op":
				if (!allCellNames.has(expr.name)) {
					diagnostics.push({
						code: "dangling-cell-ref",
						severity: "error",
						message: `Collection op references undeclared state "${expr.name}"`,
						component,
						path,
					});
				}
				for (let i = 0; i < expr.args.length; i++) {
					validateExpr(expr.args[i], [...path, "args", String(i)]);
				}
				break;
			case "spread":
				validateExpr(expr.argument, [...path, "argument"]);
				break;
			case "template-literal":
				for (let i = 0; i < expr.parts.length; i++) {
					const part = expr.parts[i];
					if (typeof part !== "string") {
						validateExpr(part, [...path, "parts", String(i)]);
					}
				}
				break;
			case "object":
				for (let i = 0; i < expr.properties.length; i++) {
					const prop = expr.properties[i];
					if (prop.kind === "property") {
						validateExpr(prop.value, [...path, "properties", String(i), "value"]);
					} else if (prop.kind === "spread") {
						validateExpr(prop.argument, [...path, "properties", String(i), "argument"]);
					}
				}
				break;
			case "array":
				for (let i = 0; i < expr.elements.length; i++) {
					validateExpr(expr.elements[i], [...path, "elements", String(i)]);
				}
				break;
			case "assign":
				validateExpr(expr.target, [...path, "target"]);
				validateExpr(expr.value, [...path, "value"]);
				break;
			case "update":
				validateExpr(expr.target, [...path, "target"]);
				break;
			case "emit":
				if (expr.detail) {
					validateExpr(expr.detail, [...path, "detail"]);
				}
				break;
			// Leaf nodes that need no further validation
			case "literal":
			case "prop-read":
			case "attr-read":
			case "param-read":
			case "item-field-read":
			case "imported-ref":
			case "external-ref":
			case "opaque":
				break;
		}
	}

	/**
	 * @param {NodeIR[]} nodes
	 * @param {string[]} path
	 */
	function validateNodes(nodes, path) {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			const nodePath = [...path, String(i)];
			switch (node.kind) {
				case "element":
					for (const [key, val] of Object.entries(node.attributes)) {
						validateExpr(val, [...nodePath, "attributes", key]);
					}
					for (let j = 0; j < node.events.length; j++) {
						validateExpr(node.events[j].handler, [...nodePath, "events", String(j), "handler"]);
					}
					if (node.classes && node.classes.kind === "class-list") {
						for (let j = 0; j < node.classes.items.length; j++) {
							const item = node.classes.items[j];
							if (typeof item !== "string") {
								validateExpr(item.condition, [...nodePath, "classes", "items", String(j), "condition"]);
							}
						}
					}
					validateNodes(node.children, [...nodePath, "children"]);
					break;
				case "reactive-text":
					validateExpr(node.source, [...nodePath, "source"]);
					break;
				case "show":
					if (node.condition.kind !== "cell-ref") {
						diagnostics.push({
							code: "invalid-show-condition",
							severity: "error",
							message: `ShowIR condition must be a cell-ref`,
							component,
							path: nodePath,
						});
					} else if (!allCellNames.has(node.condition.name)) {
						diagnostics.push({
							code: "dangling-cell-ref",
							severity: "error",
							message: `Show condition references undeclared state "${node.condition.name}"`,
							component,
							path: nodePath,
						});
					}
					validateNodes(node.render, [...nodePath, "render"]);
					if (node.fallback) {
						validateNodes(node.fallback, [...nodePath, "fallback"]);
					}
					break;
				case "each":
					if (node.source.kind !== "cell-ref") {
						diagnostics.push({
							code: "invalid-each-source",
							severity: "error",
							message: `EachIR source must be a cell-ref`,
							component,
							path: nodePath,
						});
					} else if (!allCellNames.has(node.source.name)) {
						diagnostics.push({
							code: "dangling-cell-ref",
							severity: "error",
							message: `Each source references undeclared state "${node.source.name}"`,
							component,
							path: nodePath,
						});
					}
					validateNodes(node.render, [...nodePath, "render"]);
					break;
			}
		}
	}

	// Validate action bodies
	for (let i = 0; i < mir.actions.length; i++) {
		validateExpr(mir.actions[i].body, ["actions", String(i), "body"]);
	}

	// Validate computed bodies
	for (let i = 0; i < mir.state.length; i++) {
		if (mir.state[i].kind === "computed") {
			validateExpr(/** @type {import("./types.d.ts").StateComputedIR} */ (mir.state[i]).body, ["state", String(i), "body"]);
		}
	}

	// Validate lifecycle
	if (mir.lifecycle.onConnect) {
		validateExpr(mir.lifecycle.onConnect, ["lifecycle", "onConnect"]);
	}
	if (mir.lifecycle.onDisconnect) {
		validateExpr(mir.lifecycle.onDisconnect, ["lifecycle", "onDisconnect"]);
	}

	// Validate render tree
	validateNodes(mir.render, ["render"]);

	return diagnostics;
}

/**
 * @param {string[]} names
 * @param {string} category
 * @param {string} component
 * @param {Diagnostic[]} diagnostics
 */
function checkDuplicates(names, category, component, diagnostics) {
	const seen = new Set();
	for (const name of names) {
		if (seen.has(name)) {
			diagnostics.push({
				code: "duplicate-name",
				severity: "error",
				message: `Duplicate ${category} name "${name}"`,
				component,
			});
		}
		seen.add(name);
	}
}
