declare module "roqa/authoring" {
	type RefConstructors = Record<string, new () => Element>;
	type TemplateRefs<T extends RefConstructors> = {
		[K in keyof T]: InstanceType<T[K]>;
	};

	/**
	 * Compiler-only authoring syntax. The template transform replaces this call
	 * with a clone factory containing direct firstChild/nextSibling traversal.
	 * The authoring implementation fails if it reaches the browser uncompiled.
	 */
	export function template<T extends RefConstructors>(
		html: string,
		refs: T,
	): () => import("roqa").TemplateInstance<TemplateRefs<T>>;
}
