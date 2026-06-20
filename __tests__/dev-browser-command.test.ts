import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import rootPackageJson from "../package.json" with { type: "json" };

describe("browser dev command", () => {
	const scriptPath = join(import.meta.dir, "..", "scripts", "dev-browser.ts");

	test("root package exposes a browser:dev one-command flow", () => {
		expect(rootPackageJson.scripts).toHaveProperty(
			"browser:dev",
			"bun run ./scripts/dev-browser.ts",
		);
		expect(existsSync(scriptPath)).toBe(true);

		const script = readFileSync(scriptPath, "utf8");
		expect(script).toContain("build:dist");
		expect(script).toContain("packages/cli/dist/bin.js");
		expect(script).toContain("browser");
	});

	test("justfile exposes the browser dev flow", () => {
		const justfile = readFileSync(
			join(import.meta.dir, "..", "justfile"),
			"utf8",
		);

		expect(justfile).toContain("browser-dev *args:");
		expect(justfile).toContain("bun run browser:dev -- {{args}}");
	});
});
