export function compile(code: string, filename: string): { code: string; map: any };
export function parse(code: string, filename: string): any;
export function validateNoCustomComponents(ast: any): void;
export function generateOutput(
	code: string,
	ast: any,
	filename: string,
): { code: string; map: any };
export function inlineGetCalls(code: string, filename: string): { code: string; map: any };
