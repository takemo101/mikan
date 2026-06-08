import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMcpServerForAgent, mcpAgentInstallers } from "../src/index.ts";

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("MCP agent installers", () => {
	test("registers mikan for pi in global and workspace config", () => {
		const home = tempDir("mikan-pi-home-");
		const cwd = tempDir("mikan-pi-cwd-");
		try {
			const global = installMcpServerForAgent("pi", { home });
			const workspace = installMcpServerForAgent("pi", {
				cwd,
				global: false,
			});
			const globalConfig = JSON.parse(readFileSync(global.path, "utf8"));
			const workspaceConfig = JSON.parse(readFileSync(workspace.path, "utf8"));

			expect(global.path).toBe(join(home, ".config", "mcp", "mcp.json"));
			expect(workspace.path).toBe(join(cwd, ".mcp.json"));
			expect(globalConfig.mcpServers.mikan).toEqual({
				command: "mikan",
				args: ["mcp"],
			});
			expect(workspaceConfig.mcpServers.mikan.command).toBe("mikan");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("registers mikan for antigravity and preserves existing entries and mode", () => {
		const home = tempDir("mikan-agy-home-");
		try {
			const configDir = join(home, ".gemini", "antigravity-cli");
			const configPath = join(configDir, "mcp_config.json");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				configPath,
				JSON.stringify({
					mcpServers: {
						existing: { command: "node", args: ["x.js"], env: {} },
					},
				}),
			);
			chmodSync(configPath, 0o640);

			const result = installMcpServerForAgent("antigravity", { home });
			const config = JSON.parse(readFileSync(configPath, "utf8"));

			expect(result.path).toBe(configPath);
			expect(result.scope).toBe("cli-global");
			expect(config.mcpServers.existing.command).toBe("node");
			expect(config.mcpServers.mikan).toEqual({
				command: "mikan",
				args: ["mcp"],
				env: {},
			});
			expect(statSync(configPath).mode & 0o777).toBe(0o640);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("registers mikan for antigravity workspace config", () => {
		const cwd = tempDir("mikan-agy-cwd-");
		try {
			const result = installMcpServerForAgent("antigravity", {
				cwd,
				global: false,
			});
			const config = JSON.parse(readFileSync(result.path, "utf8"));

			expect(result.path).toBe(join(cwd, ".agents", "mcp_config.json"));
			expect(result.scope).toBe("workspace");
			expect(config.mcpServers.mikan.args).toEqual(["mcp"]);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("registers mikan for jcode in global and workspace config", () => {
		const home = tempDir("mikan-jcode-home-");
		const cwd = tempDir("mikan-jcode-cwd-");
		try {
			const global = installMcpServerForAgent("jcode", { home });
			const workspace = installMcpServerForAgent("jcode", {
				cwd,
				global: false,
			});
			const globalConfig = JSON.parse(readFileSync(global.path, "utf8"));
			const workspaceConfig = JSON.parse(readFileSync(workspace.path, "utf8"));

			expect(global.path).toBe(join(home, ".jcode", "mcp.json"));
			expect(workspace.path).toBe(join(cwd, ".jcode", "mcp.json"));
			expect(globalConfig.servers.mikan).toEqual({
				command: "mikan",
				args: ["mcp"],
				env: {},
				shared: true,
			});
			expect(workspaceConfig.servers.mikan.command).toBe("mikan");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("registers mikan for claude-code in user (global) and project config", () => {
		const home = tempDir("mikan-cc-home-");
		const cwd = tempDir("mikan-cc-cwd-");
		try {
			// Pre-seed a realistic ~/.claude.json so the merge must preserve
			// unrelated Claude Code state and existing MCP servers.
			const userConfig = join(home, ".claude.json");
			writeFileSync(
				userConfig,
				JSON.stringify({
					numStartups: 3,
					mcpServers: { other: { command: "x", args: ["--mcp"] } },
				}),
			);

			const global = installMcpServerForAgent("claude-code", { home });
			const workspace = installMcpServerForAgent("claude-code", {
				cwd,
				global: false,
			});
			const globalConfig = JSON.parse(readFileSync(global.path, "utf8"));
			const workspaceConfig = JSON.parse(readFileSync(workspace.path, "utf8"));

			expect(global.path).toBe(userConfig);
			expect(global.scope).toBe("global");
			expect(workspace.path).toBe(join(cwd, ".mcp.json"));
			expect(workspace.scope).toBe("workspace");
			// User scope: minimal { command, args } entry, no env or type field.
			expect(globalConfig.mcpServers.mikan).toEqual({
				command: "mikan",
				args: ["mcp"],
			});
			// Unrelated state and other servers are preserved.
			expect(globalConfig.numStartups).toBe(3);
			expect(globalConfig.mcpServers.other.command).toBe("x");
			// Project scope: the checked-in .mcp.json mcpServers map.
			expect(workspaceConfig.mcpServers.mikan).toEqual({
				command: "mikan",
				args: ["mcp"],
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("registers mikan for opencode in global and project config", () => {
		const home = tempDir("mikan-oc-home-");
		const cwd = tempDir("mikan-oc-cwd-");
		try {
			// Pre-seed a realistic global opencode.json so the merge must preserve
			// unrelated config and existing MCP servers under the `mcp` key.
			const configDir = join(home, ".config", "opencode");
			const configPath = join(configDir, "opencode.json");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				configPath,
				JSON.stringify({
					model: "openai/gpt-5.5",
					mcp: {
						other: {
							type: "local",
							command: ["other", "--mcp"],
							enabled: true,
						},
					},
				}),
			);

			const global = installMcpServerForAgent("opencode", { home });
			const workspace = installMcpServerForAgent("opencode", {
				cwd,
				global: false,
			});
			const globalConfig = JSON.parse(readFileSync(global.path, "utf8"));
			const workspaceConfig = JSON.parse(readFileSync(workspace.path, "utf8"));

			expect(global.path).toBe(configPath);
			expect(global.scope).toBe("global");
			expect(workspace.path).toBe(join(cwd, "opencode.json"));
			expect(workspace.scope).toBe("workspace");
			// Verified opencode local stdio format: type local + command array +
			// enabled + environment, all under the `mcp` key.
			expect(globalConfig.mcp.mikan).toEqual({
				type: "local",
				command: ["mikan", "mcp"],
				enabled: true,
				environment: {},
			});
			// Unrelated config and other servers are preserved.
			expect(globalConfig.model).toBe("openai/gpt-5.5");
			expect(globalConfig.mcp.other.command).toEqual(["other", "--mcp"]);
			expect(workspaceConfig.mcp.mikan.command).toEqual(["mikan", "mcp"]);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("registers mikan for codex in the global TOML config", () => {
		const home = tempDir("mikan-codex-home-");
		try {
			const result = installMcpServerForAgent("codex", { home });
			const text = readFileSync(result.path, "utf8");

			expect(result.path).toBe(join(home, ".codex", "config.toml"));
			expect(result.scope).toBe("global");
			// Verified Codex format: a [mcp_servers.<name>] table with command/args.
			expect(text).toContain("[mcp_servers.mikan]");
			expect(text).toContain('command = "mikan"');
			expect(text).toContain('args = ["mcp"]');
			// No env line when env is empty (matches the real cuekit entry).
			expect(text).not.toContain("env =");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("codex upserts its table, preserving other tables and comments", () => {
		const home = tempDir("mikan-codex-merge-home-");
		try {
			const configDir = join(home, ".codex");
			const configPath = join(configDir, "config.toml");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				configPath,
				[
					"# Codex configuration",
					'[projects."/Users/me/work"]',
					'trust_level = "trusted"',
					"",
					"[mcp_servers.other]",
					'command = "other"',
					'args = [ "--mcp" ]',
					"",
				].join("\n"),
			);
			chmodSync(configPath, 0o640);

			// First install appends the mikan table.
			installMcpServerForAgent("codex", { home });
			// Second install updates in place rather than duplicating.
			const result = installMcpServerForAgent("codex", {
				home,
				command: "bun",
				args: ["run", "mcp"],
			});
			const text = readFileSync(result.path, "utf8");

			// Unrelated content and comments are preserved.
			expect(text).toContain("# Codex configuration");
			expect(text).toContain('[projects."/Users/me/work"]');
			expect(text).toContain("[mcp_servers.other]");
			// Exactly one mikan table, reflecting the latest command/args.
			expect(text.match(/\[mcp_servers\.mikan\]/g)?.length).toBe(1);
			expect(text).toContain('command = "bun"');
			expect(text).toContain('args = ["run", "mcp"]');
			// File mode is preserved through the atomic write.
			expect(statSync(configPath).mode & 0o777).toBe(0o640);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("codex writes an env inline table when env overrides are provided", () => {
		const home = tempDir("mikan-codex-env-home-");
		try {
			const result = installMcpServerForAgent("codex", {
				home,
				env: { MIKAN_ENV: "test" },
			});
			const text = readFileSync(result.path, "utf8");
			expect(text).toContain('env = { MIKAN_ENV = "test" }');
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("codex rejects workspace-local scope with a clear error", () => {
		const home = tempDir("mikan-codex-ws-home-");
		const cwd = tempDir("mikan-codex-ws-cwd-");
		try {
			expect(() =>
				installMcpServerForAgent("codex", { home, cwd, global: false }),
			).toThrow("Codex MCP configuration is global-only");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("codex fails clearly on an unmergeable parent-table mikan definition", () => {
		const home = tempDir("mikan-codex-conflict-home-");
		try {
			const configDir = join(home, ".codex");
			const configPath = join(configDir, "config.toml");
			mkdirSync(configDir, { recursive: true });
			const original = [
				"[mcp_servers]",
				'mikan = { command = "old", args = ["old"] }',
				"",
			].join("\n");
			writeFileSync(configPath, original);

			expect(() => installMcpServerForAgent("codex", { home })).toThrow(
				"cannot safely merge",
			);
			// The file is left untouched rather than corrupted into invalid TOML.
			expect(readFileSync(configPath, "utf8")).toBe(original);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("codex appends safely beside an unrelated [mcp_servers] parent table", () => {
		const home = tempDir("mikan-codex-parent-home-");
		try {
			const configDir = join(home, ".codex");
			const configPath = join(configDir, "config.toml");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				configPath,
				[
					"[mcp_servers]",
					'other = { command = "other", args = ["--mcp"] }',
					"",
				].join("\n"),
			);

			const result = installMcpServerForAgent("codex", { home });
			const text = readFileSync(result.path, "utf8");
			// Only a mikan definition lives under a different key, so appending the
			// canonical table is valid TOML and must not be rejected.
			expect(text).toContain("[mcp_servers.mikan]");
			expect(text).toContain("other = {");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("registers mikan for GitHub Copilot in VS Code workspace config", () => {
		const cwd = tempDir("mikan-copilot-vscode-cwd-");
		try {
			const configDir = join(cwd, ".vscode");
			const configPath = join(configDir, "mcp.json");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				configPath,
				JSON.stringify({
					servers: {
						existing: { type: "stdio", command: "node", args: ["x.js"] },
					},
				}),
			);
			chmodSync(configPath, 0o640);

			const result = installMcpServerForAgent("copilot-vscode", {
				cwd,
				global: false,
			});
			const config = JSON.parse(readFileSync(result.path, "utf8"));

			expect(result.path).toBe(configPath);
			expect(result.scope).toBe("workspace");
			expect(config.servers.existing.command).toBe("node");
			expect(config.servers.mikan).toEqual({
				type: "stdio",
				command: "mikan",
				args: ["mcp"],
			});
			expect(statSync(configPath).mode & 0o777).toBe(0o640);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("copilot-vscode rejects unverified global scope with a clear error", () => {
		const home = tempDir("mikan-copilot-vscode-home-");
		try {
			expect(() =>
				installMcpServerForAgent("copilot-vscode", { home }),
			).toThrow("VS Code user-profile MCP configuration path is not verified");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("registers mikan for GitHub Copilot CLI in the global config", () => {
		const home = tempDir("mikan-copilot-cli-home-");
		try {
			const configDir = join(home, ".copilot");
			const configPath = join(configDir, "mcp-config.json");
			mkdirSync(configDir, { recursive: true });
			writeFileSync(
				configPath,
				JSON.stringify({
					mcpServers: {
						existing: {
							type: "local",
							command: "node",
							args: ["x.js"],
							env: {},
							tools: ["*"],
						},
					},
				}),
			);

			const result = installMcpServerForAgent("copilot-cli", { home });
			const config = JSON.parse(readFileSync(result.path, "utf8"));

			expect(result.path).toBe(configPath);
			expect(result.scope).toBe("global");
			expect(config.mcpServers.existing.command).toBe("node");
			expect(config.mcpServers.mikan).toEqual({
				type: "local",
				command: "mikan",
				args: ["mcp"],
				env: {},
				tools: ["*"],
			});
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("copilot-cli rejects workspace-local scope with a clear error", () => {
		const home = tempDir("mikan-copilot-cli-ws-home-");
		const cwd = tempDir("mikan-copilot-cli-ws-cwd-");
		try {
			expect(() =>
				installMcpServerForAgent("copilot-cli", { home, cwd, global: false }),
			).toThrow("GitHub Copilot CLI MCP configuration is global-only");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("exposes registry metadata and rejects unsupported agents", () => {
		expect(mcpAgentInstallers.map((installer) => installer.agent)).toEqual([
			"pi",
			"antigravity",
			"jcode",
			"claude-code",
			"opencode",
			"codex",
			"copilot-vscode",
			"copilot-cli",
		]);
		expect(() => installMcpServerForAgent("claude", {})).toThrow(
			"Unsupported MCP agent: claude",
		);
	});

	test("shared server spec honors serverName/command/args/env overrides for every adapter", () => {
		// codex and copilot-cli are global-only; their overrides are covered in their own tests.
		for (const agent of mcpAgentInstallers
			.map((installer) => installer.agent)
			.filter((agent) => agent !== "codex" && agent !== "copilot-cli")) {
			const cwd = tempDir(`mikan-${agent}-override-`);
			try {
				const result = installMcpServerForAgent(agent, {
					cwd,
					global: false,
					serverName: "mikan-dev",
					command: "bun",
					args: ["run", "mcp"],
					env: { MIKAN_ENV: "test" },
				});
				const config = JSON.parse(readFileSync(result.path, "utf8"));
				const serversKey =
					agent === "jcode" || agent === "copilot-vscode"
						? "servers"
						: agent === "opencode"
							? "mcp"
							: "mcpServers";
				const entry = config[serversKey]["mikan-dev"];

				expect(result.serverName).toBe("mikan-dev");
				if (agent === "opencode") {
					// opencode combines command + args into a single command array
					// and stores env under `environment`.
					expect(entry.command).toEqual(["bun", "run", "mcp"]);
					expect(entry.environment).toEqual({ MIKAN_ENV: "test" });
				} else {
					expect(entry.command).toBe("bun");
					expect(entry.args).toEqual(["run", "mcp"]);
					// antigravity, jcode, and copilot-vscode include env when provided;
					// pi and claude-code use the minimal { command, args } entry.
					if (
						agent === "antigravity" ||
						agent === "jcode" ||
						agent === "copilot-vscode"
					) {
						expect(entry.env).toEqual({ MIKAN_ENV: "test" });
					} else {
						expect(entry.env).toBeUndefined();
					}
				}
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		}
	});

	test("every adapter reuses the shared JSON helpers to preserve entries and mode", () => {
		// Antigravity is covered above; assert pi and jcode share the same
		// read/merge/write behavior rather than duplicating JSON I/O.
		const cases = [
			{ agent: "pi", file: ".mcp.json", serversKey: "mcpServers" },
			{
				agent: "jcode",
				file: join(".jcode", "mcp.json"),
				serversKey: "servers",
			},
		] as const;
		for (const { agent, file, serversKey } of cases) {
			const cwd = tempDir(`mikan-${agent}-merge-`);
			try {
				const configPath = join(cwd, file);
				mkdirSync(join(configPath, ".."), { recursive: true });
				writeFileSync(
					configPath,
					JSON.stringify({
						[serversKey]: {
							existing: { command: "node", args: ["x.js"] },
						},
					}),
				);
				chmodSync(configPath, 0o640);

				const result = installMcpServerForAgent(agent, {
					cwd,
					global: false,
				});
				const config = JSON.parse(readFileSync(result.path, "utf8"));

				expect(result.path).toBe(configPath);
				expect(config[serversKey].existing.command).toBe("node");
				expect(config[serversKey].mikan.command).toBe("mikan");
				expect(statSync(configPath).mode & 0o777).toBe(0o640);
			} finally {
				rmSync(cwd, { recursive: true, force: true });
			}
		}
	});
});
