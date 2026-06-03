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

	test("exposes registry metadata and rejects unsupported agents", () => {
		expect(mcpAgentInstallers.map((installer) => installer.agent)).toEqual([
			"pi",
			"antigravity",
			"jcode",
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
				const serversKey = agent === "jcode" ? "servers" : "mcpServers";
				const entry = config[serversKey]["mikan-dev"];

				expect(result.serverName).toBe("mikan-dev");
				expect(entry.command).toBe("bun");
				expect(entry.args).toEqual(["run", "mcp"]);
				// pi omits env; antigravity and jcode include the shared spec env.
				if (agent === "pi") {
					expect(entry.env).toBeUndefined();
				} else {
					expect(entry.env).toEqual({ MIKAN_ENV: "test" });
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
