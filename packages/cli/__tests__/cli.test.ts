import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import packageJson from "../package.json" with { type: "json" };
import { runCli, runInteractiveCommand } from "../src/index.ts";

function tempProject(): string {
	return mkdtempSync(join(tmpdir(), "mikan-cli-"));
}

function enableWorkspaceMode(cwd: string): void {
	writeFileSync(
		join(cwd, ".mikan", "config.yaml"),
		`project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: backlog\n      title: Backlog\nrepositories:\n  - id: backend\n    title: Backend\n    path: ./backend\n    github:\n      repo: org/backend\n  - id: frontend\n    title: Frontend\n    path: ./frontend\n    github:\n      repo: org/frontend\n  - id: infra\n    title: Infra\n    path: ./infra\n    github:\n      repo: org/infra\n`,
	);
}

import { mkdtempSync } from "node:fs";

async function cli(
	cwd: string,
	argv: string[],
	options: Parameters<typeof runCli>[1] = {},
) {
	return runCli(argv, {
		cwd,
		now: () => new Date("2026-05-30T00:00:00Z"),
		...options,
	});
}

describe("CLI read path", () => {
	test("package metadata targets scoped npm dist bin", () => {
		expect(packageJson.name).toBe("@takemo101/mikan");
		expect(packageJson.version).toBe("0.0.14");
		expect(packageJson.private).toBe(false);
		expect(packageJson.bin).toEqual({ mikan: "dist/bin.js" });
		expect(packageJson.repository).toEqual({
			type: "git",
			url: "https://github.com/takemo101/mikan",
		});
		expect(packageJson.files).toEqual(["dist"]);
		expect(packageJson).not.toHaveProperty("dependencies");
		expect(packageJson.optionalDependencies).toMatchObject({
			"@opentui/core-darwin-arm64": "0.3.0",
			"@opentui/core-darwin-x64": "0.3.0",
			"@opentui/core-linux-arm64": "0.3.0",
			"@opentui/core-linux-x64": "0.3.0",
			"@opentui/core-win32-arm64": "0.3.0",
			"@opentui/core-win32-x64": "0.3.0",
		});
	});

	test("builds and packs the distributable CLI bin", async () => {
		rmSync(join(import.meta.dir, "..", "dist"), {
			force: true,
			recursive: true,
		});

		await $`bun run --cwd ${join(import.meta.dir, "..")} build:dist`.quiet();
		const help =
			await $`bun ${join(import.meta.dir, "..", "dist", "bin.js")} --help`.quiet();
		const pack =
			await $`npm pack --dry-run --json ${join(import.meta.dir, "..")}`.quiet();
		const [packed] = JSON.parse(pack.stdout.toString()) as [
			{
				files: Array<{ path: string }>;
				name: string;
				version: string;
			},
		];
		const packedFiles = packed.files.map((file) => file.path);

		expect(help.exitCode).toBe(0);
		expect(help.stdout.toString()).toContain("mikan — local-first Issue board");
		expect(existsSync(join(import.meta.dir, "..", "dist", "bin.js"))).toBe(
			true,
		);
		expect(packed.name).toBe("@takemo101/mikan");
		expect(packed.version).toBe("0.0.14");
		expect(packedFiles).toContain("dist/bin.js");
		expect(packedFiles).toContain("package.json");
		expect(packedFiles).toContain("README.md");
		expect(packedFiles).not.toContain("src/bin.ts");
		// Browser app shell is built and copied under dist/browser/ so the
		// published CLI can serve it at runtime (MIK-150).
		expect(
			existsSync(join(import.meta.dir, "..", "dist", "browser", "index.html")),
		).toBe(true);
		expect(packedFiles).toContain("dist/browser/index.html");
		expect(packedFiles.some((file) => file.startsWith("dist/browser/"))).toBe(
			true,
		);
	}, 120_000);

	test("shows global and command help", async () => {
		const cwd = tempProject();

		const globalHelp = await cli(cwd, ["--help"]);
		const version = await cli(cwd, ["--version"]);
		const shortVersion = await cli(cwd, ["-v"]);
		const addHelp = await cli(cwd, ["add", "--help"]);
		const helpAdd = await cli(cwd, ["help", "add"]);
		const mcpHelp = await cli(cwd, ["help", "mcp"]);
		const skillsHelp = await cli(cwd, ["help", "skills"]);

		expect(globalHelp.exitCode).toBe(0);
		expect(globalHelp.stdout).toContain("mikan — local-first Issue board");
		expect(globalHelp.stdout).toContain("Usage:");
		expect(globalHelp.stdout).toContain("Commands:");
		expect(globalHelp.stdout).toContain("-v, --version");
		expect(globalHelp.stdout).toContain(
			"skills    Install agent-facing mikan usage guidance",
		);
		expect(version).toMatchObject({ exitCode: 0, stdout: "0.0.14\n" });
		expect(shortVersion).toMatchObject({ exitCode: 0, stdout: "0.0.14\n" });
		expect(addHelp.exitCode).toBe(0);
		expect(addHelp.stdout).toContain("Usage:\n  mikan add <title>");
		expect(addHelp.stdout).toContain("-s, --status <status>");
		expect(addHelp.stdout).toContain("--depends-on <issue-id>");
		expect(helpAdd.stdout).toBe(addHelp.stdout);
		expect(mcpHelp.exitCode).toBe(0);
		expect(mcpHelp.stdout).toContain(
			"Agent to configure: pi, antigravity, jcode, claude-code, opencode, codex, copilot-vscode, copilot-cli",
		);
		expect(mcpHelp.stdout).toContain("codex and copilot-cli register globally");
		expect(mcpHelp.stdout).toContain("copilot-vscode writes workspace");
		expect(mcpHelp.stdout).toContain("mikan mcp llms [--full]");
		expect(mcpHelp.stdout).toContain("incur-backed discovery");
		const githubHelp = await cli(cwd, ["help", "github"]);

		expect(githubHelp.exitCode).toBe(0);
		expect(githubHelp.stdout).toContain("mikan github mirror <issue-id>");
		expect(githubHelp.stdout).toContain("mikan github mirror <issue-id>");
		expect(githubHelp.stdout).not.toContain("mikan github push");
		expect(githubHelp.stdout).toContain("gh auth login");
		expect(skillsHelp.exitCode).toBe(0);
		expect(skillsHelp.stdout).toContain(
			"Usage:\n  mikan skills add --agent <agent> [--no-global]",
		);
		expect(skillsHelp.stdout).toContain(
			"Agent to install guidance for: pi, antigravity, jcode, claude-code, opencode, codex, copilot-vscode, copilot-cli",
		);
		expect(skillsHelp.stdout).toContain("never changes MCP config");
		expect(skillsHelp.stdout).toContain(
			"codex installs the skill globally only",
		);
		expect(skillsHelp.stdout).toContain(
			"global install targets the Antigravity CLI path",
		);
	});

	test("supports short options and equals syntax", async () => {
		const cwd = tempProject();

		const init = await cli(cwd, ["init", "-k", "MIK", "--name=mikan"]);
		const add = await cli(cwd, [
			"add",
			"First issue",
			"-s",
			"ready",
			"-l",
			"automation",
		]);
		const list = await cli(cwd, ["list", "-s=ready"]);
		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"-t",
			"Updated issue",
			"-l",
			"herdr",
		]);
		const move = await cli(cwd, ["move", "MIK-001", "completed", "-l=Done"]);
		const append = await cli(cwd, [
			"append",
			"MIK-001",
			"-S",
			"Notes",
			"-b",
			"Remember this",
		]);
		const show = await cli(cwd, ["show", "MIK-001"]);

		expect(init.exitCode).toBe(0);
		expect(add.exitCode).toBe(0);
		expect(list.stdout).toContain("MIK-001 First issue [automation]");
		expect(update.exitCode).toBe(0);
		expect(move.exitCode).toBe(0);
		expect(append.exitCode).toBe(0);
		expect(show.stdout).toContain("title: Updated issue");
		expect(show.stdout).toContain("- herdr");
		expect(show.stdout).toContain("Done");
		expect(show.stdout).toContain("Remember this");
	});

	test("add and update write Issue Metadata", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);

		const add = await cli(cwd, [
			"add",
			"Metadata issue",
			"--metadata",
			JSON.stringify({
				agent_hint: "frontend",
				browser_required: true,
				context_files: ["packages/tui/src/index.ts"],
			}),
		]);
		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"--metadata",
			JSON.stringify({ agent_hint: "backend" }),
		]);
		const show = await cli(cwd, ["show", "MIK-001"]);
		const list = await cli(cwd, ["list"]);

		expect(add.exitCode).toBe(0);
		expect(update.exitCode).toBe(0);
		expect(show.stdout).toContain("metadata:");
		expect(show.stdout).toContain("agent_hint: backend");
		expect(show.stdout).not.toContain("browser_required");
		expect(list.stdout).not.toContain("agent_hint");
	});

	test("add and update reject malformed Issue Metadata", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);

		const invalidJson = await cli(cwd, [
			"add",
			"Bad",
			"--metadata",
			"not-json",
		]);
		const nonObject = await cli(cwd, ["update", "MIK-001", "--metadata", "[]"]);

		expect(invalidJson.exitCode).toBe(1);
		expect(invalidJson.stderr).toContain("metadata must be a JSON object");
		expect(nonObject.exitCode).toBe(1);
		expect(nonObject.stderr).toContain("metadata must be an object");
	});

	test("add and update write Issue dependencies", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);
		await cli(cwd, ["add", "Foundation"]);

		const add = await cli(cwd, ["add", "Dependent", "--depends-on", "MIK-001"]);
		const update = await cli(cwd, [
			"update",
			"MIK-002",
			"--depends-on",
			"MIK-001",
			"--depends-on",
			"MIK-003",
		]);
		const show = await cli(cwd, ["show", "MIK-002"]);

		expect(add.exitCode).toBe(0);
		expect(update.exitCode).toBe(0);
		expect(show.stdout).toContain("depends_on:");
		expect(show.stdout).toContain("- MIK-001");
		expect(show.stdout).toContain("- MIK-003");
	});

	test("returns clear parse errors for unknown options and missing values", async () => {
		const cwd = tempProject();

		const unknown = await cli(cwd, ["list", "--wat"]);
		const missing = await cli(cwd, ["add", "Title", "--status"]);

		expect(unknown.exitCode).toBe(1);
		expect(unknown.stderr).toContain("Unknown option: --wat");
		expect(unknown.stderr).toContain("Run `mikan help list`");
		expect(missing.exitCode).toBe(1);
		expect(missing.stderr).toContain("Missing value for --status");
		expect(missing.stderr).toContain("Run `mikan help add`");
	});

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

	test("list and show include dependency read model fields", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "Prerequisite"]);
		await cli(cwd, ["add", "Dependent", "--depends-on", "MIK-001"]);

		const list = await cli(cwd, ["list"]);
		const show = await cli(cwd, ["show", "MIK-002"]);

		expect(list.exitCode).toBe(0);
		expect(list.stdout).toContain("depends_on=MIK-001");
		expect(list.stdout).toContain("unmet_dependencies=MIK-001");
		expect(list.stdout).toContain("dependency_status=blocked");
		expect(show.exitCode).toBe(0);
		expect(show.stdout).toStartWith("---\n");
		expect(show.stdout).toContain("id: MIK-002");
		expect(show.stderr).toContain("Dependency Status: blocked");
		expect(show.stderr).toContain("Depends On: MIK-001");
		expect(show.stderr).toContain("Unmet Dependencies: MIK-001");
	});

	test("list includes hook failure warnings", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);
		writeFileSync(
			join(cwd, ".mikan", ".state", "hook-log.ndjson"),
			`${JSON.stringify({
				issue_id: "MIK-001",
				from_status: "backlog",
				to_status: "ready",
				command: "false",
				exit_code: 1,
				error: "nope",
			})}\n`,
		);

		const result = await cli(cwd, ["list"]);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toContain("hook_failure");
		expect(result.stderr).toContain("MIK-001");
		expect(result.stderr).toContain("nope");
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

	test("add and update reject duplicate Labels", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First", "--label", "automation"]);

		const add = await cli(cwd, [
			"add",
			"Duplicate labels",
			"--label",
			"automation",
			"--label",
			"automation",
		]);
		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"--label",
			"automation",
			"--label",
			"automation",
		]);

		expect(add.exitCode).toBe(1);
		expect(add.stderr).toContain("Duplicate Label: automation");
		expect(update.exitCode).toBe(1);
		expect(update.stderr).toContain("Duplicate Label: automation");
	});

	test("add and update reject malformed Dependencies", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);

		const add = await cli(cwd, [
			"add",
			"Bad dependency",
			"--depends-on",
			"bad-slug",
		]);
		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"--depends-on",
			"bad-slug",
		]);

		expect(add.exitCode).toBe(1);
		expect(add.stderr).toContain("id must look like MIK-001: bad-slug");
		expect(update.exitCode).toBe(1);
		expect(update.stderr).toContain("id must look like MIK-001: bad-slug");
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

	test("tui command advertises OpenTUI startup", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["tui"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("OpenTUI board");
	});

	test("tui startup checks config before launching", async () => {
		const cwd = tempProject();
		let launched = false;

		const missing = await runInteractiveCommand(["tui"], {
			cwd,
			launchTui: async () => {
				launched = true;
			},
		});
		await cli(cwd, ["init"]);
		const present = await runInteractiveCommand(["tui"], {
			cwd,
			launchTui: async () => {
				launched = true;
			},
		});

		expect(missing).toEqual({
			exitCode: 1,
			stdout: "",
			stderr: "Could not find .mikan/config.yaml\n",
		});
		expect(present).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(launched).toBe(true);
	});

	test("tui defaults to auto columns", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["tui"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("OpenTUI board");
	});

	test("tui accepts --columns auto and numeric 2..5", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		for (const value of ["auto", "2", "3", "4", "5"]) {
			const result = await cli(cwd, ["tui", "--columns", value]);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("OpenTUI board");
			expect(result.stderr).toBe("");
		}

		const inline = await cli(cwd, ["tui", "--columns=4"]);
		expect(inline.exitCode).toBe(0);
		expect(inline.stdout).toContain("OpenTUI board");
	});

	test("tui rejects invalid --columns values and points to help", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		for (const value of [
			"1",
			"6",
			"9",
			"wide",
			"2.5",
			"2.0",
			" 2",
			"0x2",
			"3e0",
		]) {
			const result = await cli(cwd, ["tui", "--columns", value]);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(`Invalid --columns value: ${value}`);
			expect(result.stderr).toContain("mikan help tui");
		}
	});

	test("tui interactive launch rejects invalid --columns before launching", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		let launched = false;

		const result = await runInteractiveCommand(["tui", "--columns", "9"], {
			cwd,
			launchTui: async () => {
				launched = true;
			},
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid --columns value: 9");
		expect(result.stderr).toContain("mikan help tui");
		expect(launched).toBe(false);
	});

	test("tui interactive launch accepts valid --columns", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		let launched = false;

		const result = await runInteractiveCommand(["tui", "--columns", "3"], {
			cwd,
			launchTui: async () => {
				launched = true;
			},
		});

		expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(launched).toBe(true);
	});

	test("tui interactive launch forwards the parsed --columns to the callback", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		const forwarded: unknown[] = [];

		const fixed = await runInteractiveCommand(["tui", "--columns", "5"], {
			cwd,
			launchTui: async (launchOptions) => {
				forwarded.push(launchOptions.columns);
			},
		});
		const auto = await runInteractiveCommand(["tui"], {
			cwd,
			launchTui: async (launchOptions) => {
				forwarded.push(launchOptions.columns);
			},
		});

		expect(fixed).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(auto).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(forwarded).toEqual([5, "auto"]);
	});

	test("tui help documents the --columns option", async () => {
		const result = await cli(tempProject(), ["help", "tui"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("--columns");
		expect(result.stdout).toContain("auto");
		expect(result.stdout).toContain("mikan tui --columns 3");
	});

	test("browser command advertises startup", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["browser"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Starting mikan browser");
	});

	test("browser appears in global help and documents its options", async () => {
		const cwd = tempProject();

		const globalHelp = await cli(cwd, ["--help"]);
		const browserHelp = await cli(cwd, ["help", "browser"]);
		const flagHelp = await cli(cwd, ["browser", "--help"]);

		expect(globalHelp.stdout).toContain("browser");
		expect(browserHelp.exitCode).toBe(0);
		expect(browserHelp.stdout).toContain("--port");
		expect(browserHelp.stdout).toContain("--no-open");
		expect(browserHelp.stdout).toContain("127.0.0.1");
		expect(browserHelp.stdout).toContain("mikan browser --port 4321");
		expect(flagHelp.stdout).toContain("--no-open");
	});

	test("browser accepts a valid --port and rejects invalid ones", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const valid = await cli(cwd, ["browser", "--port", "4321"]);
		expect(valid.exitCode).toBe(0);
		expect(valid.stdout).toContain("Starting mikan browser");

		for (const value of ["0", "70000", "80.0", "abc", "8e1", "0x50"]) {
			const result = await cli(cwd, ["browser", "--port", value]);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain(`Invalid --port value: ${value}`);
			expect(result.stderr).toContain("mikan help browser");
		}
	});

	test("browser startup checks config before launching", async () => {
		const cwd = tempProject();
		let launched = false;

		const missing = await runInteractiveCommand(["browser"], {
			cwd,
			launchBrowser: async () => {
				launched = true;
			},
		});
		await cli(cwd, ["init"]);
		const present = await runInteractiveCommand(["browser"], {
			cwd,
			launchBrowser: async () => {
				launched = true;
			},
		});

		expect(missing).toEqual({
			exitCode: 1,
			stdout: "",
			stderr: "Could not find .mikan/config.yaml\n",
		});
		expect(present).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(launched).toBe(true);
	});

	test("browser interactive launch rejects invalid --port before launching", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		let launched = false;

		const result = await runInteractiveCommand(["browser", "--port", "0"], {
			cwd,
			launchBrowser: async () => {
				launched = true;
			},
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Invalid --port value: 0");
		expect(result.stderr).toContain("mikan help browser");
		expect(launched).toBe(false);
	});

	test("browser forwards parsed --port and open flag to the launcher", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		const forwarded: Array<{ port: number | undefined; open: boolean }> = [];
		const capture = async (launchOptions: {
			port: number | undefined;
			open: boolean;
		}) => {
			forwarded.push(launchOptions);
		};

		const withPort = await runInteractiveCommand(
			["browser", "--port", "4321"],
			{ cwd, launchBrowser: capture },
		);
		const noOpen = await runInteractiveCommand(["browser", "--no-open"], {
			cwd,
			launchBrowser: capture,
		});
		const auto = await runInteractiveCommand(["browser"], {
			cwd,
			launchBrowser: capture,
		});

		expect(withPort).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(noOpen).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(auto).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(forwarded).toEqual([
			{ port: 4321, open: true },
			{ port: undefined, open: false },
			{ port: undefined, open: true },
		]);
	});

	test("mcp command advertises stdio server startup", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["mcp"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("MCP server on stdio");
	});

	test("mcp add registers supported agents and rejects unsupported agents", async () => {
		const cwd = tempProject();
		const home = mkdtempSync(join(tmpdir(), "mikan-cli-mcp-home-"));
		try {
			const pi = await runCli(["mcp", "add", "--agent", "pi"], {
				cwd,
				home,
			});
			const antigravity = await runCli(
				["mcp", "add", "--agent=antigravity", "--no-global"],
				{ cwd, home },
			);
			const jcode = await runCli(["mcp", "add", "-a", "jcode"], {
				cwd,
				home,
			});
			const claudeCode = await runCli(
				["mcp", "add", "--agent", "claude-code"],
				{
					cwd,
					home,
				},
			);
			const opencode = await runCli(
				["mcp", "add", "--agent", "opencode", "--no-global"],
				{ cwd, home },
			);
			const codex = await runCli(["mcp", "add", "--agent", "codex"], {
				cwd,
				home,
			});
			const codexWorkspace = await runCli(
				["mcp", "add", "--agent", "codex", "--no-global"],
				{ cwd, home },
			);
			const unsupported = await runCli(["mcp", "add", "--agent", "claude"], {
				cwd,
				home,
			});

			expect(pi.exitCode).toBe(0);
			expect(pi.stdout).toContain("Registered MCP server 'mikan' for pi");
			expect(antigravity.exitCode).toBe(0);
			expect(antigravity.stdout).toContain("for antigravity (workspace)");
			expect(jcode.exitCode).toBe(0);
			expect(jcode.stdout).toContain("Registered MCP server 'mikan' for jcode");
			expect(claudeCode.exitCode).toBe(0);
			expect(claudeCode.stdout).toContain(
				"Registered MCP server 'mikan' for claude-code",
			);
			expect(opencode.exitCode).toBe(0);
			expect(opencode.stdout).toContain(
				"Registered MCP server 'mikan' for opencode",
			);
			expect(codex.exitCode).toBe(0);
			expect(codex.stdout).toContain("Registered MCP server 'mikan' for codex");
			expect(codexWorkspace.exitCode).toBe(1);
			expect(codexWorkspace.stderr).toContain(
				"Codex MCP configuration is global-only",
			);
			expect(unsupported.exitCode).toBe(1);
			expect(unsupported.stderr).toContain("Unsupported MCP agent: claude");
			expect(
				JSON.parse(
					readFileSync(join(home, ".config", "mcp", "mcp.json"), "utf8"),
				).mcpServers.mikan.command,
			).toBe("mikan");
			expect(
				JSON.parse(
					readFileSync(join(cwd, ".agents", "mcp_config.json"), "utf8"),
				).mcpServers.mikan.args,
			).toEqual(["mcp"]);
			expect(
				JSON.parse(readFileSync(join(home, ".jcode", "mcp.json"), "utf8"))
					.servers.mikan.shared,
			).toBe(true);
			expect(
				JSON.parse(readFileSync(join(home, ".claude.json"), "utf8")).mcpServers
					.mikan,
			).toEqual({ command: "mikan", args: ["mcp"] });
			expect(
				JSON.parse(readFileSync(join(cwd, "opencode.json"), "utf8")).mcp.mikan,
			).toEqual({
				type: "local",
				command: ["mikan", "mcp"],
				enabled: true,
				environment: {},
			});
			const codexToml = readFileSync(
				join(home, ".codex", "config.toml"),
				"utf8",
			);
			expect(codexToml).toContain("[mcp_servers.mikan]");
			expect(codexToml).toContain('command = "mikan"');
			expect(codexToml).toContain('args = ["mcp"]');
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("interactive mcp add registers config instead of launching server", async () => {
		const cwd = tempProject();
		const home = mkdtempSync(join(tmpdir(), "mikan-cli-mcp-interactive-home-"));
		let launched = false;
		try {
			const result = await runInteractiveCommand(
				["mcp", "add", "--agent", "pi"],
				{
					cwd,
					home,
					launchMcp: async () => {
						launched = true;
					},
				},
			);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Registered MCP server 'mikan' for pi");
			expect(launched).toBe(false);
			expect(
				JSON.parse(
					readFileSync(join(home, ".config", "mcp", "mcp.json"), "utf8"),
				).mcpServers.mikan.args,
			).toEqual(["mcp"]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("mcp llms prints the incur manifest without starting the server", async () => {
		const cwd = tempProject();
		let launched = false;

		const manifest = await runInteractiveCommand(["mcp", "llms"], {
			cwd,
			launchMcp: async () => {
				launched = true;
			},
		});
		const full = await runInteractiveCommand(["mcp", "llms", "--full"], {
			cwd,
		});
		// Requesting installation through the discovery path fails clearly and
		// points to the native installer.
		const installAttempt = await runInteractiveCommand(
			["mcp", "llms", "--agent", "claude-code"],
			{ cwd },
		);

		// Discovery prints the incur manifest and never starts the stdio server.
		expect(launched).toBe(false);
		expect(manifest.exitCode).toBe(0);
		expect(manifest.stdout).toContain("get_board");
		expect(manifest.stdout).toContain("create_issue");
		expect(manifest.stdout).toContain("append_issue");
		expect(full.exitCode).toBe(0);
		expect(full.stdout.length).toBeGreaterThan(manifest.stdout.length);
		expect(installAttempt.exitCode).toBe(1);
		expect(installAttempt.stderr).toContain("mikan mcp add --agent <agent>");
	});

	test("skills add installs guidance and rejects unsupported agents", async () => {
		const cwd = tempProject();
		const home = mkdtempSync(join(tmpdir(), "mikan-cli-skills-home-"));
		try {
			// Long flag, short flag, and --no-global all parse.
			const claudeCode = await runCli(
				["skills", "add", "--agent", "claude-code"],
				{ cwd, home },
			);
			const opencodeWorkspace = await runCli(
				["skills", "add", "-a", "opencode", "--no-global"],
				{ cwd, home },
			);
			const codex = await runCli(["skills", "add", "--agent", "codex"], {
				cwd,
				home,
			});
			const pi = await runCli(["skills", "add", "--agent", "pi"], {
				cwd,
				home,
			});
			const antigravityWorkspace = await runCli(
				["skills", "add", "--agent", "antigravity", "--no-global"],
				{ cwd, home },
			);
			const copilotCli = await runCli(
				["skills", "add", "--agent", "copilot-cli"],
				{ cwd, home },
			);
			const copilotVscodeWorkspace = await runCli(
				["skills", "add", "--agent", "copilot-vscode", "--no-global"],
				{ cwd, home },
			);
			const copilotVscodeGlobal = await runCli(
				["skills", "add", "--agent", "copilot-vscode"],
				{ cwd, home },
			);
			const codexWorkspace = await runCli(
				["skills", "add", "--agent", "codex", "--no-global"],
				{ cwd, home },
			);
			const missingAgent = await runCli(["skills", "add"], { cwd, home });
			const unsupported = await runCli(["skills", "add", "--agent", "cursor"], {
				cwd,
				home,
			});

			// claude-code global installs into ~/.claude/skills/mikan/SKILL.md.
			expect(claudeCode.exitCode).toBe(0);
			expect(claudeCode.stdout).toContain(
				"Installed mikan skill for claude-code (global)",
			);
			expect(
				readFileSync(
					join(home, ".claude", "skills", "mikan", "SKILL.md"),
					"utf8",
				),
			).toContain("name: mikan");
			// opencode workspace installs into .opencode/skills/mikan/SKILL.md.
			expect(opencodeWorkspace.exitCode).toBe(0);
			expect(opencodeWorkspace.stdout).toContain(
				"Installed mikan skill for opencode (workspace)",
			);
			expect(
				existsSync(join(cwd, ".opencode", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			// codex installs globally; --no-global is rejected clearly.
			expect(codex.exitCode).toBe(0);
			expect(codex.stdout).toContain(
				"Installed mikan skill for codex (global)",
			);
			expect(
				existsSync(join(home, ".codex", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			// New skill targets mirror the MCP target registry.
			expect(pi.exitCode).toBe(0);
			expect(
				existsSync(join(home, ".pi", "agent", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			expect(antigravityWorkspace.exitCode).toBe(0);
			expect(
				existsSync(join(cwd, ".agents", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			expect(copilotCli.exitCode).toBe(0);
			expect(
				existsSync(join(home, ".copilot", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			expect(copilotVscodeWorkspace.exitCode).toBe(0);
			expect(
				existsSync(join(cwd, ".github", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			expect(copilotVscodeGlobal.exitCode).toBe(0);
			expect(
				existsSync(join(home, ".copilot", "skills", "mikan", "SKILL.md")),
			).toBe(true);
			expect(codexWorkspace.exitCode).toBe(1);
			expect(codexWorkspace.stderr).toContain("Codex skills are global-only");
			expect(missingAgent.exitCode).toBe(1);
			expect(missingAgent.stderr).toContain(
				"Usage: mikan skills add --agent <agent>",
			);
			expect(unsupported.exitCode).toBe(1);
			expect(unsupported.stderr).toContain(
				"Unsupported skill agent: cursor. Supported agents: pi, antigravity, jcode, claude-code, opencode, codex, copilot-vscode, copilot-cli",
			);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("github mirror creates or updates a GitHub Mirror", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "Mirror me", "--status", "ready"]);
		let calledWith: string | undefined;
		const mirrorResult = {
			ok: true as const,
			value: {
				issue_id: "MIK-001",
				action: "created" as const,
				github_issue: {
					repo: "takemo101/mikan",
					number: 123,
					url: "https://github.com/takemo101/mikan/issues/123",
				},
				warnings: ["label skipped"],
			},
		};

		const result = await cli(cwd, ["github", "mirror", "MIK-001"], {
			githubMirror: {
				mirrorIssueToGitHub: async (options) => {
					calledWith = options.id;
					return mirrorResult;
				},
			},
		});

		expect(result.exitCode).toBe(0);
		expect(calledWith).toBe("MIK-001");
		expect(result.stdout).toContain(
			"MIK-001 mirrored to https://github.com/takemo101/mikan/issues/123",
		);
		expect(result.stderr).toContain("warning: label skipped");
	});

	test("github mirror is the only GitHub command and updates existing mirrors", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		let calledWith: string | undefined;
		const result = await cli(cwd, ["github", "mirror", "MIK-001"], {
			githubMirror: {
				mirrorIssueToGitHub: async (options) => {
					calledWith = options.id;
					return {
						ok: true as const,
						value: {
							issue_id: options.id,
							action: "updated" as const,
							github_issue: {
								repo: "takemo101/mikan",
								number: 123,
								url: "https://github.com/takemo101/mikan/issues/123",
							},
							warnings: [],
						},
					};
				},
			},
		});
		const removedPush = await cli(cwd, ["github", "push", "MIK-001"]);
		const removedPushAll = await cli(cwd, ["github", "push", "--all"]);

		expect(result.exitCode).toBe(0);
		expect(calledWith).toBe("MIK-001");
		expect(result.stdout).toContain("MIK-001 mirrored to https://github.com");
		expect(removedPush.exitCode).toBe(1);
		expect(removedPush.stderr).toContain(
			"Usage: mikan github mirror <issue-id>",
		);
		expect(removedPushAll.exitCode).toBe(1);
		expect(removedPushAll.stderr).toContain("Unknown option: --all");
	});

	test("github commands return clear errors", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		const missingId = await cli(cwd, ["github", "mirror"]);
		const removedPush = await cli(cwd, ["github", "push"]);
		const operationError = await cli(cwd, ["github", "mirror", "MIK-001"], {
			githubMirror: {
				mirrorIssueToGitHub: async () => ({
					ok: false as const,
					error: {
						kind: "missing_config" as const,
						message: "Set github.repo in .mikan/config.yaml",
					},
				}),
			},
		});

		expect(missingId.exitCode).toBe(1);
		expect(missingId.stderr).toContain("Usage: mikan github mirror <issue-id>");
		expect(removedPush.exitCode).toBe(1);
		expect(removedPush.stderr).toContain(
			"Usage: mikan github mirror <issue-id>",
		);
		expect(operationError.exitCode).toBe(1);
		expect(operationError.stderr).toContain("Set github.repo");
	});

	test("show returns clear not-found error", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["show", "MIK-404"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Issue not found");
	});

	test("add writes repository and ordered affects in workspace mode", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);
		enableWorkspaceMode(cwd);

		const add = await cli(cwd, [
			"add",
			"Cross-cut change",
			"-r",
			"backend",
			"--affects",
			"frontend",
			"--affects",
			"infra",
		]);
		const show = await cli(cwd, ["show", "MIK-001"]);

		expect(add.exitCode).toBe(0);
		expect(show.stdout).toContain("repository: backend");
		expect(show.stdout).toContain("affects:");
		expect(show.stdout).toContain("- frontend");
		expect(show.stdout).toContain("- infra");
		expect(show.stdout.indexOf("- frontend")).toBeLessThan(
			show.stdout.indexOf("- infra"),
		);
	});

	test("update replaces repository and preserves omitted affects", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);
		enableWorkspaceMode(cwd);
		await cli(cwd, ["add", "Issue", "-r", "backend", "--affects", "infra"]);

		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"--repository",
			"frontend",
		]);
		const show = await cli(cwd, ["show", "MIK-001"]);

		expect(update.exitCode).toBe(0);
		expect(show.stdout).toContain("repository: frontend");
		expect(show.stdout).toContain("- infra");
	});

	test("update replaces affected repositories", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);
		enableWorkspaceMode(cwd);
		await cli(cwd, ["add", "Issue", "-r", "backend", "--affects", "infra"]);

		const update = await cli(cwd, [
			"update",
			"MIK-001",
			"--affects",
			"frontend",
			"--affects",
			"infra",
		]);
		const show = await cli(cwd, ["show", "MIK-001"]);

		expect(update.exitCode).toBe(0);
		expect(show.stdout).toContain("repository: backend");
		expect(show.stdout).toContain("- frontend");
		expect(show.stdout).toContain("- infra");
	});

	test("add in workspace mode fails clearly without repository", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);
		enableWorkspaceMode(cwd);

		const add = await cli(cwd, ["add", "No repo"]);

		expect(add.exitCode).toBe(1);
		expect(add.stderr).toContain("Missing repository");
		expect(add.stderr).toContain(
			"Configured repositories: backend, frontend, infra",
		);
	});

	test("add rejects unknown repository with configured ids", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init", "--key", "MIK", "--name", "mikan"]);
		enableWorkspaceMode(cwd);

		const add = await cli(cwd, ["add", "Bad", "-r", "nope"]);

		expect(add.exitCode).toBe(1);
		expect(add.stderr).toContain("Unknown repository: nope");
		expect(add.stderr).toContain(
			"Configured repositories: backend, frontend, infra",
		);
	});

	test("add and update help document repository options", async () => {
		const cwd = tempProject();

		const addHelp = await cli(cwd, ["help", "add"]);
		const updateHelp = await cli(cwd, ["help", "update"]);

		expect(addHelp.stdout).toContain("-r, --repository <repository-id>");
		expect(addHelp.stdout).toContain("--affects <repository-id>");
		expect(updateHelp.stdout).toContain("-r, --repository <repository-id>");
		expect(updateHelp.stdout).toContain("--affects <repository-id>");
		expect(updateHelp.stdout).toContain(
			"Omitting --repository or --affects preserves existing values.",
		);
	});
});
