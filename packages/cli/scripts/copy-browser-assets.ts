#!/usr/bin/env bun
// Copies the Vite-built Browser app shell into the published CLI dist so that
// `mikan browser` can serve it from dist/browser/ at runtime. Run from
// packages/cli build:dist after the bundle is produced. The generated dist
// (including dist/browser/) stays git-ignored; it is only built for packaging.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "browser", "dist");
const destination = join(here, "..", "dist", "browser");

if (!existsSync(source)) {
	console.error(
		`Browser assets not found at ${source}. Run \`bun run --filter @mikan/browser build:assets\` first.`,
	);
	process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log(`Copied browser assets to ${destination}`);
