import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/index.ts";

function tempProject(): string {
	return mkdtempSync(join(tmpdir(), "mikan-cli-"));
}

import { mkdtempSync } from "node:fs";

async function cli(cwd: string, argv: string[]) {
	return runCli(argv, { cwd, now: () => new Date("2026-05-30T00:00:00Z") });
}

describe("CLI read path", () => {
	test("init creates project files", async () => {
		const cwd = tempProject();

		const result = await cli(cwd, ["init"]);

		expect(result.exitCode).toBe(0);
		expect(existsSync(join(cwd, ".mikan", "config.yaml"))).toBe(true);
		expect(existsSync(join(cwd, ".mikan", "backlog"))).toBe(true);
		expect(existsSync(join(cwd, ".mikan", ".state"))).toBe(true);
		expect(existsSync(join(cwd, ".mikan", "templates", "issue.md"))).toBe(true);
	});

	test("init rejects invalid project keys", async () => {
		const cwd = tempProject();

		const result = await cli(cwd, ["init", "--key", "bad"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("project key");
		expect(existsSync(join(cwd, ".mikan", "config.yaml"))).toBe(false);
	});

	test("add, list, and show an Issue", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);

		const add = await cli(cwd, [
			"add",
			"First issue",
			"--status",
			"ready",
			"--label",
			"automation",
		]);
		const list = await cli(cwd, ["list"]);
		const filtered = await cli(cwd, ["list", "--status", "ready"]);
		const show = await cli(cwd, ["show", "MIK-001"]);

		expect(add.exitCode).toBe(0);
		expect(add.stdout).toContain("MIK-001");
		expect(existsSync(join(cwd, ".mikan", "ready", "MIK-001.md"))).toBe(true);
		expect(list.stdout).toContain("Ready");
		expect(list.stdout).toContain("MIK-001 First issue [automation]");
		expect(filtered.stdout).toContain("Ready");
		expect(show.stdout).toContain("id: MIK-001");
		expect(show.stdout).toContain("# First issue");
	});

	test("list includes warnings", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		mkdirSync(join(cwd, ".mikan", "custom"));
		writeFileSync(join(cwd, ".mikan", "custom", "MIK-100.md"), "# ignored\n");
		writeFileSync(
			join(cwd, ".mikan", "backlog", "BAD.md"),
			"---\nid: [\n---\n",
		);

		const result = await cli(cwd, ["list"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toContain("unknown_directory");
		expect(result.stderr).toContain("malformed_issue");
	});

	test("add rejects unknown labels and statuses", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const unknownLabel = await cli(cwd, ["add", "Bad", "--label", "missing"]);
		const unknownStatus = await cli(cwd, ["add", "Bad", "--status", "missing"]);

		expect(unknownLabel.exitCode).toBe(1);
		expect(unknownLabel.stderr).toContain("Unknown label");
		expect(unknownStatus.exitCode).toBe(1);
		expect(unknownStatus.stderr).toContain("Unknown Status");
	});

	test("add rejects duplicate IDs before creating the next Issue", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		writeFileSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: One\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# One\n`,
		);
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Duplicate\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Duplicate\n`,
		);

		const result = await cli(cwd, ["add", "Next"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Duplicate Issue ID");
		expect(existsSync(join(cwd, ".mikan", "backlog", "MIK-002.md"))).toBe(
			false,
		);
	});

	test("update, move, and append mutate Issues", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First", "--label", "automation"]);

		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"--title",
			"Updated",
			"--label",
			"herdr",
		]);
		const body = await cli(cwd, [
			"update",
			"MIK-001",
			"--body",
			"# Body only\n",
		]);
		const move = await cli(cwd, [
			"move",
			"MIK-001",
			"completed",
			"--log",
			"Done",
		]);
		const report = await cli(cwd, [
			"append",
			"MIK-001",
			"--section",
			"Reports",
			"--source",
			"docs-scout",
			"--body",
			"Looks good",
		]);
		const note = await cli(cwd, [
			"append",
			"MIK-001",
			"--section",
			"Notes",
			"--body",
			"Remember this",
		]);
		const show = await cli(cwd, ["show", "MIK-001"]);

		expect(update.exitCode).toBe(0);
		expect(body.exitCode).toBe(0);
		expect(move.exitCode).toBe(0);
		expect(report.exitCode).toBe(0);
		expect(note.exitCode).toBe(0);
		expect(existsSync(join(cwd, ".mikan", "completed", "MIK-001.md"))).toBe(
			true,
		);
		expect(show.stdout).toContain("title: Updated");
		expect(show.stdout).toContain("- herdr");
		expect(show.stdout).toContain("Done");
		expect(show.stdout).toContain("2026-05-30T00:00:00Z (docs-scout)");
		expect(show.stdout).toContain("## Notes\n\nRemember this");
		expect(show.stdout).not.toContain("2026-05-30T00:00:00Z\n\nRemember this");
	});

	test("mutation commands return clear errors", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);

		expect(
			(await cli(cwd, ["update", "MIK-404", "--title", "Nope"])).stderr,
		).toContain("Issue not found");
		expect((await cli(cwd, ["move", "MIK-001", "missing"])).stderr).toContain(
			"Unknown Status",
		);
		expect(
			(await cli(cwd, ["update", "MIK-001", "--label", "missing"])).stderr,
		).toContain("Unknown label");
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			readFileSync(join(cwd, ".mikan", "backlog", "MIK-001.md"), "utf8"),
		);
		expect(
			(await cli(cwd, ["update", "MIK-001", "--label", "missing"])).stderr,
		).toContain("Duplicate Issue ID");
		writeFileSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			"---\nid: [\n---\n",
		);
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"---\nid: [\n---\n",
		);
		expect(
			(
				await cli(cwd, [
					"append",
					"MIK-001",
					"--section",
					"Notes",
					"--body",
					"Nope",
				])
			).stderr,
		).toContain("Flow sequence");
	});

	test("mcp command advertises stdio server startup", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["mcp"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("MCP server on stdio");
	});

	test("show returns clear not-found error", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["show", "MIK-404"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Issue not found");
	});
});
