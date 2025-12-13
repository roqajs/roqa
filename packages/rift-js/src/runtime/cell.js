// ============================================
// Ultra-lightweight cell primitives
// ============================================

// Create a cell (reactive value container)
// Compiler will inline as just { v: v, e: [] }
export const cell = (v) => ({ v, e: [] });

// Get cell value
// Compiler can inline as s.v
export const get = (s) => s.v;

// Set cell value without notification
// Compiler will inline as s.v = v
export const put = (s, v) => {
	s.v = v;
};

// Bind an effect to a cell (for reactive DOM updates)
// Returns an unsubscribe function for cleanup
export const bind = (cell, fn) => {
	cell.e.push(fn);
	return () => {
		const idx = cell.e.indexOf(fn);
		if (idx > -1) cell.e.splice(idx, 1);
	};
};

// Alternative: explicit unbind primitive
// More efficient when you already have references and want to avoid closure allocation
export const unbind = (cell, fn) => {
	if (cell.e) {
		const idx = cell.e.indexOf(fn);
		if (idx > -1) cell.e.splice(idx, 1);
	}
};

// Notify all effects bound to a cell
export const notify = (cell) => {
	for (let i = 0; i < cell.e.length; i++) cell.e[i](cell.v);
};
