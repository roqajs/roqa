import type { Plugin } from 'vite';

declare module 'rift-vite-plugin' {
	export function rift(): Plugin;
}