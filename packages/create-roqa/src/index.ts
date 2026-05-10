#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HELP_FLAGS = new Set(["-h", "--help"]);
const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../template");

main();

function main(): void {
	const args = process.argv.slice(2);
	if (args.some((arg) => HELP_FLAGS.has(arg))) {
		printHelp();
		return;
	}

	const requestedDir = args[0] ?? "roqa-frontend";
	const targetDir = resolve(process.cwd(), requestedDir);
	const projectName = basename(targetDir);
	const packageName = toPackageName(projectName);

	ensureTargetDir(targetDir);
	copyTemplate(targetDir);
	replaceTemplateTokens(targetDir, {
		"%PROJECT_NAME%": projectName,
		"%PACKAGE_NAME%": packageName,
	});

	console.log(`Created ${projectName} in ${targetDir}`);
	console.log("");
	console.log("Next steps:");
	console.log(`  cd ${relativeDisplayPath(targetDir)}`);
	console.log("  npm install");
	console.log("  npm test");
	console.log("  npx tsc --noEmit");
	console.log("");
	console.log("The scaffold includes AGENTS.md, an agent skill, and reference .roqa fixtures.");
}

function printHelp(): void {
	console.log("Usage: create-roqa [directory]");
	console.log("");
	console.log("Scaffold a Roqa frontend-author package.");
}

function ensureTargetDir(targetDir: string): void {
	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
		return;
	}

	const entries = readdirSync(targetDir);
	if (entries.length > 0) {
		console.error(`Target directory is not empty: ${targetDir}`);
		process.exit(1);
	}
}

function copyTemplate(targetDir: string): void {
	cpSync(TEMPLATE_DIR, targetDir, { recursive: true });
}

function replaceTemplateTokens(rootDir: string, replacements: Record<string, string>): void {
	for (const filePath of walkFiles(rootDir)) {
		const source = readFileSync(filePath, "utf8");
		let next = source;

		for (const [token, value] of Object.entries(replacements)) {
			next = next.replaceAll(token, value);
		}

		if (next !== source) {
			writeFileSync(filePath, next);
		}
	}
}

function *walkFiles(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const entryPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield *walkFiles(entryPath);
			continue;
		}

		yield entryPath;
	}
}

function toPackageName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "roqa-frontend";
}

function relativeDisplayPath(targetDir: string): string {
	if (targetDir === process.cwd()) {
		return ".";
	}

	if (dirname(targetDir) === process.cwd()) {
		return basename(targetDir);
	}

	return targetDir;
}