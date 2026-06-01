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

	test("has a public launch README with install and quickstart", () => {
		const readme = readFileSync(join(root, "README.md"), "utf8");

		expect(readme).toContain("npm install -g @takemo101/mikan");
		expect(readme).toContain("mikan init");
		expect(readme).toContain("mikan tui");
		expect(readme).toContain("mikan mcp");
		expect(readme).toContain("Limitations");
	});

	test("defines a Trusted Publishing npm release workflow", () => {
		const workflow = readFileSync(
			join(root, ".github", "workflows", "publish.yml"),
			"utf8",
		);

		expect(workflow).toContain("name: Publish to npm");
		expect(workflow).toContain("tags:");
		expect(workflow).toContain("- 'v*'");
		expect(workflow).toContain("workflow_dispatch:");
		expect(workflow).toContain("id-token: write");
		expect(workflow).toContain("oven-sh/setup-bun@v2");
		expect(workflow).toContain("bun install --frozen-lockfile");
		expect(workflow).toContain("bun run build");
		expect(workflow).toContain(
			"'pack', '--dry-run', '--json', './packages/cli'",
		);
		expect(workflow).toContain("@opentui/core-${" + "platform}-${" + "arch}");
		expect(workflow).toContain("npm pack ./packages/cli --pack-destination");
		expect(workflow).toContain("npm publish --provenance --access public");
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
