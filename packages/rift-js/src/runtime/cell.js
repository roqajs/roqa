// ============================================
// Ultra-lightweight cell primitives
// ============================================

// Create a cell (reactive value container)
// For values that don't need effects, compiler can inline as just { v }
export const cell = (v) => ({ v, e: [] });

// Get cell value - compiler can inline as s.v in hot paths
export const get = (s) => s.v;

// Put cell value without notification - compiler can inline as s.v = v in hot paths
export const put = (s, v) => {
	s.v = v;
};

// Bind an effect to a cell (for reactive DOM updates)
// Effects are stored in array for fast iteration
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
// Compiler emits this after put() when effects exist
export const notify = (cell) => {
	for (let i = 0; i < cell.e.length; i++) cell.e[i](cell.v);
};
