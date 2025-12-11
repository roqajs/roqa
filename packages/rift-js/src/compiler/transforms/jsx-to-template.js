import {
  getJSXElementName,
  getJSXChildren,
  isJSXElement,
  isJSXText,
  isJSXExpressionContainer,
  extractJSXAttributes,
  isForComponent,
} from "../parser.js";

/**
 * Template extraction and DOM traversal generation
 *
 * This module converts JSX trees into:
 * 1. Static HTML template strings
 * 2. DOM traversal code (firstChild/nextSibling chains)
 * 3. Binding point metadata for dynamic content
 */

/**
 * Per-file template registry for deduplication
 */
export class TemplateRegistry {
  constructor() {
    this.templates = new Map(); // html -> { id, varName }
    this.counter = 0;
  }

  /**
   * Register a template and return its info
   * @param {string} html - The HTML string
   * @returns {{ id: number, varName: string, isNew: boolean }}
   */
  register(html) {
    if (this.templates.has(html)) {
      return { ...this.templates.get(html), isNew: false };
    }

    this.counter++;
    const info = {
      id: this.counter,
      varName: `$tmpl_${this.counter}`,
    };
    this.templates.set(html, info);
    return { ...info, isNew: true };
  }

  /**
   * Get all template declarations
   * @returns {string[]}
   */
  getDeclarations() {
    const declarations = [];
    for (const [html, info] of this.templates) {
      declarations.push(`const ${info.varName} = template('${escapeTemplateString(html)}');`);
    }
    return declarations;
  }
}

/**
 * Escape single quotes and backslashes in template strings
 */
function escapeTemplateString(str) {
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Type-specific variable name counters
 */
export class VariableNameGenerator {
  constructor() {
    this.counters = new Map();
  }

  /**
   * Generate a unique variable name for an element type
   * @param {string} tagName - The HTML tag name
   * @returns {string}
   */
  generate(tagName) {
    const current = this.counters.get(tagName) || 0;
    this.counters.set(tagName, current + 1);
    return `${tagName}_${current + 1}`;
  }

  /**
   * Generate a variable name for a text node
   * @param {string} parentVarName - The parent element's variable name
   * @returns {string}
   */
  generateTextNode(parentVarName) {
    return `${parentVarName}_text`;
  }

  /**
   * Generate a root variable name
   * @returns {string}
   */
  generateRoot() {
    const current = this.counters.get("$root") || 0;
    this.counters.set("$root", current + 1);
    return `$root_${current + 1}`;
  }
}

/**
 * Extract template from JSX element
 * @param {import("@babel/types").JSXElement} node - The JSX element
 * @param {TemplateRegistry} registry - Template registry for deduplication
 * @param {VariableNameGenerator} nameGen - Variable name generator
 * @param {boolean} isComponentRoot - If true, traversal uses 'this.firstChild' for root
 * @returns {TemplateExtractionResult}
 *
 * @typedef {Object} TemplateExtractionResult
 * @property {string} templateVar - The template variable name
 * @property {string} rootVar - The root element variable name
 * @property {TraversalStep[]} traversal - DOM traversal steps
 * @property {BindingPoint[]} bindings - Dynamic binding points
 * @property {EventBinding[]} events - Event handler bindings
 * @property {ForBlock[]} forBlocks - For loop blocks
 */
export function extractTemplate(node, registry, nameGen, isComponentRoot = false) {
  const { html, bindings, events, forBlocks, structure } = jsxToHtml(node, nameGen);

  const templateInfo = registry.register(html);
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
  };
}

/**
 * Convert JSX to HTML string and collect dynamic parts
 * @param {import("@babel/types").JSXElement} node
 * @param {VariableNameGenerator} nameGen
 * @returns {{ html: string, bindings: BindingPoint[], events: EventBinding[], forBlocks: ForBlock[], structure: ElementStructure }}
 */
function jsxToHtml(node, nameGen) {
  const bindings = [];
  const events = [];
  const forBlocks = [];

  const { html, structure } = processElement(node, nameGen, bindings, events, forBlocks, []);

  return { html, bindings, events, forBlocks, structure };
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
 * @param {number[]} path - Current path in the tree (for binding locations)
 * @returns {{ html: string, structure: ElementStructure }}
 */
function processElement(node, nameGen, bindings, events, forBlocks, path) {
  const tagName = getJSXElementName(node);
  const varName = nameGen.generate(tagName);
  const attrs = extractJSXAttributes(node.openingElement);

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
        });
      } else {
        bindings.push({
          type: "attribute",
          varName,
          attrName: name,
          expression: value.expression,
          path: [...path],
        });
      }
    }
  }

  html += ">";

  // Process children
  const children = getJSXChildren(node);
  let childIndex = 0; // Index among element children
  let textNodeIndex = 0; // Index among ALL child nodes (including text nodes)
  let pendingStaticText = ""; // Accumulate static text before dynamic expressions

  for (const child of children) {
    const childPath = [...path, childIndex];

    if (isJSXText(child)) {
      // Static text - accumulate it (may precede a dynamic expression)
      // Normalize whitespace: collapse multiple spaces/newlines but preserve single spaces
      const text = child.value.replace(/\s+/g, " ");
      // Only trim if this is standalone text (not preceding a dynamic expression)
      // We'll handle trimming when we know the context
      if (text && text !== " ") {
        pendingStaticText += text;
      }
    } else if (isJSXExpressionContainer(child)) {
      // Dynamic expression: {expr}
      // If there's pending static text, it becomes a prefix for this expression
      // Trim leading whitespace but preserve trailing space before the expression
      const staticPrefix = pendingStaticText.trimStart();
      pendingStaticText = ""; // Reset
      
      // Add combined content to HTML (static prefix + placeholder for dynamic)
      // Don't add extra space if prefix already ends with space
      const htmlContent = staticPrefix ? escapeHtml(staticPrefix) : "";
      html += htmlContent + " "; // Space placeholder for dynamic part
      
      const textVarName = nameGen.generateTextNode(varName);
      structure.hasTextChild = true;
      structure.textVarName = textVarName;
      
      // Track this text node's position
      structure.textNodes.push({
        varName: textVarName,
        childIndex: textNodeIndex,
        isDynamic: true,
      });

      bindings.push({
        type: "text",
        varName,
        textVarName,
        expression: child.expression,
        path: childPath,
        childIndex: textNodeIndex,
        staticPrefix, // Include the static text prefix
      });
      
      textNodeIndex++; // The combined text creates one text node
    } else if (isJSXElement(child)) {
      // Flush any pending static text before element
      if (pendingStaticText && pendingStaticText.trim()) {
        html += escapeHtml(pendingStaticText.trim());
        pendingStaticText = "";
        textNodeIndex++;
      } else {
        pendingStaticText = "";
      }
      // Check if it's a <For> component
      if (isForComponent(child)) {
        // Add anchor point in HTML
        forBlocks.push({
          containerVarName: varName,
          node: child,
          path: childPath,
        });
        // Don't add anything to HTML - for_block creates its own anchor
      } else {
        // Regular child element
        const childResult = processElement(child, nameGen, bindings, events, forBlocks, childPath);
        html += childResult.html;
        structure.children.push(childResult.structure);
        textNodeIndex++; // Element children also count as child nodes
      }
      childIndex++;
    }
  }

  // Flush any remaining static text (trim for standalone text at end)
  if (pendingStaticText && pendingStaticText.trim()) {
    html += escapeHtml(pendingStaticText.trim());
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
  // For nested templates (like inside for_block), we use the rootVar
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

  // Process text nodes that need variables (dynamic expressions)
  for (const textNode of textNodes) {
    if (textNode.isDynamic) {
      // When there's mixed content (static + dynamic), it becomes ONE text node
      // Always use firstChild since the combined text is the first (and only) text child
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
      if (textNodes.length > 0) {
        // There's a text node before this element, use nextSibling from it
        const lastTextNode = textNodes[textNodes.length - 1];
        steps.push({
          varName: child.varName,
          code: `${lastTextNode.varName}.nextSibling`,
        });
      } else {
        // No text nodes, use firstChild
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
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape attribute values
 */
function escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
