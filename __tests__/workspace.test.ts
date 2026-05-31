import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const packages = ["core", "project-config", "cli", "mcp", "tui"] as const;

describe("workspace scaffold", () => {
	test("defines the expected Bun workspace and root scripts", () => {
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

		expect(pkg.private).toBe(true);
		expect(pkg.type).toBe("module");
		expect(pkg.workspaces).toEqual(["packages/*"]);
		expect(Object.keys(pkg.scripts)).toEqual(
			expect.arrayContaining(["build", "typecheck", "test", "check", "fix"]),
		);
	});

	test("creates the five v0 packages with source entrypoints", () => {
		for (const name of packages) {
			expect(existsSync(join(root, "packages", name, "package.json"))).toBe(
				true,
			);
			expect(existsSync(join(root, "packages", name, "src", "index.ts"))).toBe(
				true,
			);
		}
	});

	test("keeps core independent from adapter packages", () => {
		const corePkg = JSON.parse(
			readFileSync(join(root, "packages", "core", "package.json"), "utf8"),
		);
		const deps = {
			...(corePkg.dependencies ?? {}),
			...(corePkg.devDependencies ?? {}),
		};

		expect(Object.keys(deps)).not.toContain("mikan");
		expect(Object.keys(deps)).not.toContain("@mikan/project-config");
		expect(Object.keys(deps)).not.toContain("@mikan/mcp");
		expect(Object.keys(deps)).not.toContain("@mikan/tui");
		expect(Object.keys(deps)).not.toContain("@opentui/core");
		expect(Object.keys(deps)).not.toContain("@opentui/react");
	});
});
