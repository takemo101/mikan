#!/usr/bin/env bun

import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const browserArgs = Bun.argv.slice(2);

async function run(command: string[]): Promise<void> {
	const child = Bun.spawn(command, {
		cwd: repoRoot,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await child.exited;
	if (exitCode !== 0) process.exit(exitCode);
}

await run(["bun", "run", "--cwd", "packages/cli", "build:dist"]);
await run(["bun", "packages/cli/dist/bin.js", "browser", ...browserArgs]);
