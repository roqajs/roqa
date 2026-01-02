import {
	getJSXElementName,
	getJSXChildren,
	isJSXElement,
	isJSXText,
	isJSXExpressionContainer,
	extractJSXAttributes,
	isForComponent,
	isShowComponent,
	isJSXFragment,
} from "../parser.js";
import { CONSTANTS, escapeTemplateString, escapeHtml, escapeAttr } from "../utils.js";

/**
 * Template extraction and DOM traversal generation
 *
 * This module converts JSX trees into:
 * 1. Static HTML template strings
 * 2. DOM traversal code (firstChild/nextSibling chains)
 * 3. Binding point metadata for dynamic content
 */

/**
 * Set of SVG element tag names
 */
const SVG_ELEMENTS = new Set([
	"svg",
	"circle",
	"ellipse",
	"line",
	"path",
	"polygon",
	"polyline",
	"rect",
	"g",
	"defs",
	"symbol",
	"use",
	"text",
	"tspan",
	"textPath",
	"image",
	"clipPath",
	"mask",
	"pattern",
	"marker",
	"linearGradient",
	"radialGradient",
	"stop",
	"filter",
	"feBlend",
	"feColorMatrix",
	"feComponentTransfer",
	"feComposite",
	"feConvolveMatrix",
	"feDiffuseLighting",
	"feDisplacementMap",
	"feDistantLight",
	"feDropShadow",
	"feFlood",
	"feFuncA",
	"feFuncB",
	"feFuncG",
	"feFuncR",
	"feGaussianBlur",
	"feImage",
	"feMerge",
	"feMergeNode",
	"feMorphology",
	"feOffset",
	"fePointLight",
	"feSpecularLighting",
	"feSpotLight",
	"feTile",
	"feTurbulence",
	"foreignObject",
	"animate",
	"animateMotion",
	"animateTransform",
	"set",
	"desc",
	"metadata",
	"title",
	"a",
	"switch",
	"view",
]);

/**
 * Check if a tag name is an SVG element
 * @param {string} tagName
 * @returns {boolean}
 */
export function isSvgElement(tagName) {
	return SVG_ELEMENTS.has(tagName);
}

/**
 * Per-file template registry for deduplication
 */
export class TemplateRegistry {
	constructor() {
		this.templates = new Map(); // html -> { id, varName, isSvg }
		this.counter = 0;
	}

	/**
	 * Register a template and return its info
	 * @param {string} html - The HTML string
	 * @param {boolean} isSvg - Whether this is an SVG template
	 * @returns {{ id: number, varName: string, isNew: boolean, isSvg: boolean }}
	 */
	register(html, isSvg = false) {
		const key = isSvg ? `svg:${html}` : html;
		if (this.templates.has(key)) {
			return { ...this.templates.get(key), isNew: false };
		}

		this.counter++;
		const info = {
			id: this.counter,
			varName: `${CONSTANTS.TEMPLATE_PREFIX}${this.counter}`,
			isSvg,
		};
		this.templates.set(key, info);
		return { ...info, isNew: true };
	}

	/**
	 * Get all template declarations
	 * @returns {string[]}
	 */
	getDeclarations() {
		const declarations = [];
		for (const [key, info] of this.templates) {
			const html = info.isSvg ? key.slice(4) : key; // Remove 'svg:' prefix if present
			const templateFn = info.isSvg ? "svgTemplate" : "template";
			declarations.push(`const ${info.varName} = ${templateFn}('${escapeTemplateString(html)}');`);
		}
		return declarations;
	}

	/**
	 * Check if any templates use SVG
	 * @returns {boolean}
	 */
	hasSvgTemplates() {
		for (const info of this.templates.values()) {
			if (info.isSvg) return true;
		}
		return false;
	}
}

/**
 * Type-specific variable name counters
 */
export class VariableNameGenerator {
	constructor() {
		this.counters = new Map();
		this.textNodeCounters = new Map(); // Track text node counts per parent
	}

	/**
	 * Sanitize a tag name to be a valid JavaScript identifier
	 * @param {string} tagName - The HTML tag name (may contain hyphens for custom elements)
	 * @returns {string}
	 */
	sanitizeTagName(tagName) {
		// Replace hyphens with underscores to make valid JS identifiers
		return tagName.replace(/-/g, "_");
	}

	/**
	 * Generate a unique variable name for an element type
	 * @param {string} tagName - The HTML tag name
	 * @returns {string}
	 */
	generate(tagName) {
		const sanitized = this.sanitizeTagName(tagName);
		const current = this.counters.get(sanitized) || 0;
		this.counters.set(sanitized, current + 1);
		return `${sanitized}_${current + 1}`;
	}

	/**
	 * Generate a variable name for a text node
	 * @param {string} parentVarName - The parent element's variable name
	 * @returns {string}
	 */
	generateTextNode(parentVarName) {
		const key = `text_${parentVarName}`;
		const current = this.textNodeCounters.get(key) || 0;
		this.textNodeCounters.set(key, current + 1);
		// First text node: p_1_text, second: p_1_text_2, etc.
		return current === 0 ? `${parentVarName}_text` : `${parentVarName}_text_${current + 1}`;
	}

	/**
	 * Generate a root variable name
	 * @returns {string}
	 */
	generateRoot() {
		const current = this.counters.get(CONSTANTS.ROOT_COUNTER_KEY) || 0;
		this.counters.set(CONSTANTS.ROOT_COUNTER_KEY, current + 1);
		return `${CONSTANTS.ROOT_PREFIX}${current + 1}`;
	}
}

/**
 * Extract template from JSX element
 * @param {import("@babel/types").JSXElement} node - The JSX element
 * @param {TemplateRegistry} registry - Template registry for deduplication
 * @param {VariableNameGenerator} nameGen - Variable name generator
 * @param {boolean} isComponentRoot - If true, traversal uses 'this.firstChild' for root
 * @param {boolean} isFragment - If true, the node is a JSX fragment
 * @param {Set<string>} riftComponentTags - Set of tag names defined via defineComponent (Rift components)
 * @returns {TemplateExtractionResult}
 *
 * @typedef {Object} TemplateExtractionResult
 * @property {string} templateVar - The template variable name
 * @property {string} rootVar - The root element variable name
 * @property {TraversalStep[]} traversal - DOM traversal steps
 * @property {BindingPoint[]} bindings - Dynamic binding points
 * @property {EventBinding[]} events - Event handler bindings
 * @property {ForBlock[]} forBlocks - For loop blocks
 * @property {ShowBlock[]} showBlocks - Show conditional blocks
 */
export function extractTemplate(
	node,
	registry,
	nameGen,
	isComponentRoot = false,
	isFragment = false,
	riftComponentTags = new Set(),
) {
	if (isFragment || isJSXFragment(node)) {
		return extractFragmentTemplate(node, registry, nameGen, isComponentRoot, riftComponentTags);
	}

	const { html, bindings, events, forBlocks, showBlocks, structure, isSvg } = jsxToHtml(
		node,
		nameGen,
		riftComponentTags,
	);

	const templateInfo = registry.register(html, isSvg);
	const rootVar = nameGen.generateRoot();

	// Generate traversal code
	const traversal = generateTraversal(structure, rootVar, isComponentRoot);

	return {
		templateVar: templateInfo.varName,
		rootVar,
		traversal,
		bindings,
		events,
		forBlocks,
		showBlocks,
	};
}

/**
 * Extract template from a JSX fragment (multiple root elements)
 * @param {import("@babel/types").JSXFragment} node - The JSX fragment
 * @param {TemplateRegistry} registry - Template registry for deduplication
 * @param {VariableNameGenerator} nameGen - Variable name generator
 * @param {boolean} isComponentRoot - If true, traversal uses 'this.firstChild' for root
 * @param {Set<string>} riftComponentTags - Set of tag names defined via defineComponent (Rift components)
 * @returns {TemplateExtractionResult}
 */
function extractFragmentTemplate(
	node,
	registry,
	nameGen,
	isComponentRoot,
	riftComponentTags = new Set(),
) {
	const bindings = [];
	const events = [];
	const forBlocks = [];
	const showBlocks = [];
	const structures = [];
	let html = "";

	// Process each child of the fragment as a root element
	const children = node.children || [];
	let childIndex = 0;

	for (const child of children) {
		if (isJSXText(child)) {
			// Normalize whitespace, preserve spaces between sibling elements
			const text = child.value.replace(/\s+/g, " ");
			if (text && text !== " ") {
				// Non-whitespace text between fragment children - add to HTML
				// (Single space-only text nodes between block elements can be dropped)
				html += escapeHtml(text);
				// Track static text nodes for proper sibling traversal
				structures.push({
					varName: null,
					tagName: "__static_text__",
					children: [],
					textNodes: [],
					isStaticText: true,
				});
			}
		} else if (isJSXElement(child)) {
			const childPath = [childIndex];
			// Check if this child is an SVG element (for fragment children)
			const childTagName = getJSXElementName(child);
			const childInSvg = isSvgElement(childTagName);
			const childResult = processElement(
				child,
				nameGen,
				bindings,
				events,
				forBlocks,
				showBlocks,
				childPath,
				riftComponentTags,
				childInSvg,
			);
			html += childResult.html;
			structures.push(childResult.structure);
			childIndex++;
		} else if (isJSXExpressionContainer(child)) {
			// Dynamic expression at fragment level
			html += "<!---->";
			const textVarName = nameGen.generateTextNode("fragment");
			bindings.push({
				type: "text",
				varName: null, // No parent element for fragment-level expressions
				textVarName,
				expression: child.expression,
				path: [childIndex],
				childIndex: structures.length,
				staticPrefix: "",
				usesMarker: true,
				isFragmentChild: true,
			});
			// Add a pseudo-structure entry for traversal
			structures.push({
				varName: textVarName,
				tagName: "__text__",
				children: [],
				textNodes: [],
				isTextMarker: true,
			});
			childIndex++;
		}
	}

	const templateInfo = registry.register(html);
	const rootVar = nameGen.generateRoot();

	// Generate traversal for fragments (multiple roots as siblings)
	const traversal = generateFragmentTraversal(structures, rootVar, isComponentRoot);

	return {
		templateVar: templateInfo.varName,
		rootVar,
		traversal,
		bindings,
		events,
		forBlocks,
		showBlocks,
	};
}

/**
 * Generate DOM traversal for fragment (multiple root elements as siblings)
 * @param {ElementStructure[]} structures - Array of root element structures
 * @param {string} rootVar - The root variable name
 * @param {boolean} isComponentRoot - If true, use 'this.firstChild' for first root
 * @returns {TraversalStep[]}
 */
function generateFragmentTraversal(structures, rootVar, isComponentRoot) {
	const steps = [];

	let prevVar = null;
	let pendingNextSiblingCount = 0; // Track static text nodes that need to be skipped

	for (let i = 0; i < structures.length; i++) {
		const structure = structures[i];

		if (structure.isStaticText) {
			// Static text node - just count it for sibling traversal
			pendingNextSiblingCount++;
			continue;
		}

		if (structure.isTextMarker) {
			// This is a dynamic text marker - handle it specially
			const markerVarName = `${structure.varName}_marker`;
			if (prevVar === null) {
				steps.push({
					varName: markerVarName,
					code: isComponentRoot ? "this.firstChild" : `${rootVar}.firstChild`,
					isMarker: true,
					textVarName: structure.varName,
				});
			} else {
				// Chain nextSibling calls for any static text nodes we skipped
				let code = `${prevVar}.nextSibling`;
				for (let j = 0; j < pendingNextSiblingCount; j++) {
					code += ".nextSibling";
				}
				steps.push({
					varName: markerVarName,
					code,
					isMarker: true,
					textVarName: structure.varName,
				});
			}
			prevVar = structure.varName; // Use the text node for next traversal
			pendingNextSiblingCount = 0;
		} else {
			// Regular element
			if (prevVar === null) {
				steps.push({
					varName: structure.varName,
					code: isComponentRoot ? "this.firstChild" : `${rootVar}.firstChild`,
				});
			} else {
				// Chain nextSibling calls for any static text nodes we skipped
				let code = `${prevVar}.nextSibling`;
				for (let j = 0; j < pendingNextSiblingCount; j++) {
					code += ".nextSibling";
				}
				steps.push({
					varName: structure.varName,
					code,
				});
			}
			prevVar = structure.varName;
			pendingNextSiblingCount = 0;

			// Recurse into this element's children
			generateChildTraversal(structure, steps);
		}
	}

	return steps;
}

/**
 * Convert JSX to HTML string and collect dynamic parts
 * @param {import("@babel/types").JSXElement} node
 * @param {VariableNameGenerator} nameGen
 * @param {Set<string>} riftComponentTags - Set of tag names defined via defineComponent (Rift components)
 * @returns {{ html: string, bindings: BindingPoint[], events: EventBinding[], forBlocks: ForBlock[], showBlocks: ShowBlock[], structure: ElementStructure, isSvg: boolean }}
 */
function jsxToHtml(node, nameGen, riftComponentTags = new Set()) {
	const bindings = [];
	const events = [];
	const forBlocks = [];
	const showBlocks = [];

	// Check if root element is an SVG element
	const rootTagName = getJSXElementName(node);
	const isSvg = isSvgElement(rootTagName);

	const { html, structure } = processElement(
		node,
		nameGen,
		bindings,
		events,
		forBlocks,
		showBlocks,
		[],
		riftComponentTags,
		isSvg,
	);

	return { html, bindings, events, forBlocks, showBlocks, structure, isSvg };
}

/**
 * @typedef {Object} ElementStructure
 * @property {string} varName - Variable name for this element
 * @property {string} tagName - HTML tag name
 * @property {ElementStructure[]} children - Child element structures
 * @property {boolean} hasTextChild - Whether this element has a text child needing a variable
 * @property {string|null} textVarName - Variable name for the text node if present
 * @property {TextNodeInfo[]} textNodes - Info about text nodes for traversal
 */

/**
 * @typedef {Object} TextNodeInfo
 * @property {string} varName - Variable name for the text node
 * @property {number} childIndex - The index of this text node among all child nodes
 * @property {boolean} isDynamic - Whether this is a dynamic expression placeholder
 */

/**
 * Process a JSX element into HTML and structure
 * @param {import("@babel/types").JSXElement} node
 * @param {VariableNameGenerator} nameGen
 * @param {BindingPoint[]} bindings
 * @param {EventBinding[]} events
 * @param {ForBlock[]} forBlocks
 * @param {ShowBlock[]} showBlocks
 * @param {number[]} path - Current path in the tree (for binding locations)
 * @param {Set<string>} riftComponentTags - Set of tag names defined via defineComponent (Rift components)
 * @param {boolean} inSvg - Whether we're inside an SVG context
 * @returns {{ html: string, structure: ElementStructure }}
 */
function processElement(
	node,
	nameGen,
	bindings,
	events,
	forBlocks,
	showBlocks,
	path,
	riftComponentTags = new Set(),
	inSvg = false,
) {
	const tagName = getJSXElementName(node);
	const varName = nameGen.generate(tagName);
	const attrs = extractJSXAttributes(node.openingElement);

	// Check if this is a custom element (has hyphen in name - web component standard)
	const isCustomElement = tagName.includes("-");

	// Check if this is a Rift-defined custom element (registered via defineComponent)
	// Only Rift components get special prop handling; external custom elements are left alone
	const isRiftComponent = riftComponentTags.has(tagName);

	// Check if we're entering or already in SVG context
	const isInSvgContext = inSvg || isSvgElement(tagName);

	let html = `<${tagName}`;
	const structure = {
		varName,
		tagName,
		children: [],
		hasTextChild: false,
		textVarName: null,
		textNodes: [], // Track all text nodes that need variables
	};

	// Process attributes
	for (const [name, value] of attrs) {
		if (name === "...") {
			// Spread attributes - skip for now (could add runtime handling)
			continue;
		}

		// Check for event handlers (onclick, oninput, etc.)
		if (name.startsWith("on")) {
			const eventName = name.slice(2).toLowerCase();
			events.push({
				varName,
				eventName,
				handler: value, // JSXExpressionContainer or null
				path: [...path],
			});
			continue;
		}

		// Handle attribute values
		if (value === null) {
			// Boolean attribute: <button disabled>
			html += ` ${name}`;
		} else if (value.type === "StringLiteral") {
			// Static string: class="foo"
			// Always include static attributes in the HTML template
			// This ensures getAttribute() works for all elements including custom elements
			html += ` ${name}="${escapeAttr(value.value)}"`;
		} else if (value.type === "JSXExpressionContainer") {
			// Dynamic expression: class={expr}
			// Add placeholder for static attributes, bind for dynamic
			if (name === "class" || name === "className") {
				// For class bindings, we'll handle at runtime
				bindings.push({
					type: "attribute",
					varName,
					attrName: "className",
					expression: value.expression,
					path: [...path],
					isSvg: isInSvgContext,
				});
			} else if (isRiftComponent) {
				// For Rift-defined custom elements, use setProp() to pass data
				bindings.push({
					type: "prop",
					varName,
					propName: name,
					expression: value.expression,
					path: [...path],
				});
			} else if (isCustomElement) {
				// For other custom elements (third-party web components),
				// set properties directly on the element before it connects
				bindings.push({
					type: "prop",
					varName,
					propName: name,
					expression: value.expression,
					path: [...path],
					isThirdParty: true, // Mark as third-party (no WeakMap, direct property)
				});
			} else {
				bindings.push({
					type: "attribute",
					varName,
					attrName: name,
					expression: value.expression,
					path: [...path],
					isSvg: isInSvgContext,
				});
			}
		}
	}

	html += ">";

	// Process children - first pass to collect all content parts
	const children = getJSXChildren(node);
	const contentParts = []; // Array of { type: 'static'|'dynamic', value: string|expression }
	let hasDynamicContent = false;

	for (const child of children) {
		if (isJSXText(child)) {
			// Static text - normalize whitespace but preserve spaces between elements
			const text = child.value.replace(/\s+/g, " ");
			if (text) {
				contentParts.push({ type: "static", value: text });
			}
		} else if (isJSXExpressionContainer(child)) {
			// Check if expression is a static string literal (e.g., {" "} from formatters)
			if (child.expression.type === "StringLiteral") {
				// Treat string literals as static text
				contentParts.push({ type: "static", value: child.expression.value });
			} else {
				hasDynamicContent = true;
				contentParts.push({ type: "dynamic", expression: child.expression });
			}
		} else if (isJSXElement(child)) {
			// Element child - flush content parts and process element
			if (contentParts.length > 0) {
				// If we have mixed content before an element, handle it
				if (hasDynamicContent) {
					// Add space placeholder for dynamic content
					html += " ";
					const textVarName = nameGen.generateTextNode(varName);
					structure.hasTextChild = true;
					structure.textVarName = textVarName;
					structure.textNodes.push({
						varName: textVarName,
						childIndex: 0,
						isDynamic: true,
					});
					bindings.push({
						type: "text",
						varName,
						textVarName,
						contentParts: [...contentParts],
						path: [...path],
					});
				} else {
					// All static - just add to HTML (preserve whitespace between elements)
					for (const part of contentParts) {
						html += escapeHtml(part.value);
					}
				}
				contentParts.length = 0;
				hasDynamicContent = false;
			}

			// Check if it's a <For> component
			if (isForComponent(child)) {
				forBlocks.push({
					containerVarName: varName,
					node: child,
					path: [...path, structure.children.length],
				});
			} else if (isShowComponent(child)) {
				// Check if it's a <Show> component
				showBlocks.push({
					containerVarName: varName,
					node: child,
					path: [...path, structure.children.length],
				});
			} else {
				// Regular child element
				const childResult = processElement(
					child,
					nameGen,
					bindings,
					events,
					forBlocks,
					showBlocks,
					[...path, structure.children.length],
					riftComponentTags,
					isInSvgContext,
				);
				html += childResult.html;
				structure.children.push(childResult.structure);
			}
		}
	}

	// Handle remaining content parts after processing all children
	if (contentParts.length > 0) {
		if (hasDynamicContent) {
			// Element has dynamic content - use space placeholder
			html += " ";
			const textVarName = nameGen.generateTextNode(varName);
			structure.hasTextChild = true;
			structure.textVarName = textVarName;
			structure.textNodes.push({
				varName: textVarName,
				childIndex: structure.children.length,
				isDynamic: true,
			});
			bindings.push({
				type: "text",
				varName,
				textVarName,
				contentParts: [...contentParts],
				path: [...path],
			});
		} else {
			// All static content - join and trim only leading/trailing whitespace
			const staticContent = contentParts.map((p) => p.value).join("");
			// Only trim if this is trailing content (after last element)
			// We need to preserve internal spacing but can trim the end
			const trimmedContent = structure.children.length > 0 ? staticContent : staticContent.trim();
			if (trimmedContent) {
				html += escapeHtml(trimmedContent);
			}
		}
	}

	// Self-closing tags
	const voidElements = new Set([
		"area",
		"base",
		"br",
		"col",
		"embed",
		"hr",
		"img",
		"input",
		"link",
		"meta",
		"param",
		"source",
		"track",
		"wbr",
	]);

	if (!voidElements.has(tagName)) {
		html += `</${tagName}>`;
	}

	return { html, structure };
}

/**
 * Generate DOM traversal code from element structure
 * @param {ElementStructure} structure
 * @param {string} rootVar
 * @param {boolean} isComponentRoot - If true, use 'this.firstChild' for root element
 * @returns {TraversalStep[]}
 *
 * @typedef {Object} TraversalStep
 * @property {string} varName - Variable being declared
 * @property {string} code - The traversal code (e.g., "rootVar.firstChild")
 */
function generateTraversal(structure, rootVar, isComponentRoot = false) {
	const steps = [];

	// First step: get root element
	// For component roots, we use 'this.firstChild' because the DocumentFragment
	// becomes empty after appendChild
	// For nested templates (like inside forBlock), we use the rootVar
	steps.push({
		varName: structure.varName,
		code: isComponentRoot ? "this.firstChild" : `${rootVar}.firstChild`,
	});

	// Generate traversal for text nodes and children
	generateChildTraversal(structure, steps);

	return steps;
}

/**
 * Recursively generate traversal for children
 */
function generateChildTraversal(structure, steps) {
	const { varName, children, textNodes } = structure;

	// Process text nodes that come BEFORE any child elements first
	// These can use firstChild traversal and don't depend on element variables
	for (let i = 0; i < textNodes.length; i++) {
		const textNode = textNodes[i];
		if (textNode.isDynamic && textNode.childIndex === 0) {
			// Text is the first child - access it directly
			steps.push({
				varName: textNode.varName,
				code: `${varName}.firstChild`,
			});
		}
	}

	// Process child elements
	let prevVar = null;
	let elementIndex = 0;

	for (const child of children) {
		if (elementIndex === 0) {
			// First element child
			if (textNodes.length > 0 && textNodes[0].childIndex === 0) {
				// There's a text node before this element, use nextSibling from it
				steps.push({
					varName: child.varName,
					code: `${textNodes[0].varName}.nextSibling`,
				});
			} else {
				// No text nodes before, use firstChild
				steps.push({
					varName: child.varName,
					code: `${varName}.firstChild`,
				});
			}
		} else {
			// Subsequent children: use nextSibling from previous element
			steps.push({
				varName: child.varName,
				code: `${prevVar}.nextSibling`,
			});
		}

		prevVar = child.varName;
		elementIndex++;

		// Recurse into this child
		generateChildTraversal(child, steps);
	}

	// Process text nodes that come AFTER child elements
	// These need to reference the previous element variable, which is now declared
	for (let i = 0; i < textNodes.length; i++) {
		const textNode = textNodes[i];
		if (textNode.isDynamic && textNode.childIndex > 0) {
			// Text comes after elements - traverse from last element before it
			const prevChild = children[textNode.childIndex - 1];
			if (prevChild) {
				steps.push({
					varName: textNode.varName,
					code: `${prevChild.varName}.nextSibling`,
				});
			} else {
				// Fallback - traverse from parent
				let traversal = `${varName}.firstChild`;
				for (let j = 0; j < textNode.childIndex; j++) {
					traversal += ".nextSibling";
				}
				steps.push({
					varName: textNode.varName,
					code: traversal,
				});
			}
		}
	}
}
