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

import { mkdtempSync } from "node:fs";

async function cli(cwd: string, argv: string[]) {
	return runCli(argv, { cwd, now: () => new Date("2026-05-30T00:00:00Z") });
}

describe("CLI read path", () => {
	test("package metadata targets scoped npm dist bin", () => {
		expect(packageJson.name).toBe("@takemo101/mikan");
		expect(packageJson.version).toBe("0.0.3");
		expect(packageJson.private).toBe(false);
		expect(packageJson.bin).toEqual({ mikan: "dist/bin.js" });
		expect(packageJson.repository).toEqual({
			type: "git",
			url: "https://github.com/takemo101/mikan",
		});
		expect(packageJson.files).toEqual(["dist"]);
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
			{ files: Array<{ path: string }>; name: string; version: string },
		];
		const packedFiles = packed.files.map((file) => file.path);

		expect(help.exitCode).toBe(0);
		expect(help.stdout.toString()).toContain("mikan — local-first Issue board");
		expect(existsSync(join(import.meta.dir, "..", "dist", "bin.js"))).toBe(
			true,
		);
		expect(packed.name).toBe("@takemo101/mikan");
		expect(packed.version).toBe("0.0.3");
		expect(packedFiles).toContain("dist/bin.js");
		expect(packedFiles).toContain("package.json");
		expect(packedFiles).toContain("README.md");
		expect(packedFiles).not.toContain("src/bin.ts");
	});

	test("shows global and command help", async () => {
		const cwd = tempProject();

		const globalHelp = await cli(cwd, ["--help"]);
		const addHelp = await cli(cwd, ["add", "--help"]);
		const helpAdd = await cli(cwd, ["help", "add"]);
		const mcpHelp = await cli(cwd, ["help", "mcp"]);
		const skillsHelp = await cli(cwd, ["help", "skills"]);

		expect(globalHelp.exitCode).toBe(0);
		expect(globalHelp.stdout).toContain("mikan — local-first Issue board");
		expect(globalHelp.stdout).toContain("Usage:");
		expect(globalHelp.stdout).toContain("Commands:");
		expect(globalHelp.stdout).toContain(
			"skills    Install agent-facing mikan usage guidance",
		);
		expect(addHelp.exitCode).toBe(0);
		expect(addHelp.stdout).toContain("Usage:\n  mikan add <title>");
		expect(addHelp.stdout).toContain("-s, --status <status>");
		expect(addHelp.stdout).toContain("--depends-on <issue-id>");
		expect(helpAdd.stdout).toBe(addHelp.stdout);
		expect(mcpHelp.exitCode).toBe(0);
		expect(mcpHelp.stdout).toContain(
			"Agent to configure: pi, antigravity, jcode, claude-code, opencode, codex",
		);
		expect(mcpHelp.stdout).toContain("codex registers in global");
		expect(mcpHelp.stdout).toContain("mikan mcp llms [--full]");
		expect(mcpHelp.stdout).toContain("incur-backed discovery");
		expect(skillsHelp.exitCode).toBe(0);
		expect(skillsHelp.stdout).toContain(
			"Usage:\n  mikan skills add --agent <agent> [--no-global]",
		);
		expect(skillsHelp.stdout).toContain(
			"Agent to install the mikan skill for: claude-code, opencode, codex",
		);
		expect(skillsHelp.stdout).toContain("never changes MCP config");
		expect(skillsHelp.stdout).toContain(
			"codex installs the skill globally only",
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
			const codexWorkspace = await runCli(
				["skills", "add", "--agent", "codex", "--no-global"],
				{ cwd, home },
			);
			const missingAgent = await runCli(["skills", "add"], { cwd, home });
			const unsupported = await runCli(["skills", "add", "--agent", "pi"], {
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
			expect(codexWorkspace.exitCode).toBe(1);
			expect(codexWorkspace.stderr).toContain("Codex skills are global-only");
			expect(missingAgent.exitCode).toBe(1);
			expect(missingAgent.stderr).toContain(
				"Usage: mikan skills add --agent <agent>",
			);
			expect(unsupported.exitCode).toBe(1);
			expect(unsupported.stderr).toContain(
				"Unsupported skill agent: pi. Supported agents: claude-code, opencode, codex",
			);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("show returns clear not-found error", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["show", "MIK-404"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Issue not found");
	});
});
