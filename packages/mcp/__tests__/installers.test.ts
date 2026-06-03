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

	test("exposes registry metadata and rejects unsupported agents", () => {
		expect(mcpAgentInstallers.map((installer) => installer.agent)).toEqual([
			"pi",
			"antigravity",
			"jcode",
			"claude-code",
			"opencode",
		]);
		expect(() => installMcpServerForAgent("claude", {})).toThrow(
			"Unsupported MCP agent: claude",
		);
	});

	test("shared server spec honors serverName/command/args/env overrides for every adapter", () => {
		for (const agent of mcpAgentInstallers.map(
			(installer) => installer.agent,
		)) {
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
					agent === "jcode"
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
					// antigravity and jcode include the shared spec env;
					// pi and claude-code use the minimal { command, args } entry.
					if (agent === "antigravity" || agent === "jcode") {
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
