import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type McpAgent = "pi" | "antigravity" | "jcode";

export type McpAgentInstallOptions = {
	global?: boolean;
	cwd?: string;
	home?: string;
	serverName?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
};

export type McpAgentInstallResult = {
	agent: McpAgent;
	path: string;
	serverName: string;
	scope: "global" | "cli-global" | "workspace";
};

export type McpAgentInstaller = {
	agent: McpAgent;
	install: (options?: McpAgentInstallOptions) => McpAgentInstallResult;
};

type JsonObject = Record<string, unknown>;

const defaultServerName = "mikan";
const defaultCommand = "mikan";
const defaultArgs = ["mcp"];

export const mcpAgentInstallers: McpAgentInstaller[] = [
	{ agent: "pi", install: installPiMcpServer },
	{ agent: "antigravity", install: installAntigravityMcpServer },
	{ agent: "jcode", install: installJcodeMcpServer },
];

export function installMcpServerForAgent(
	agent: string,
	options: McpAgentInstallOptions = {},
): McpAgentInstallResult {
	const installer = mcpAgentInstallers.find((entry) => entry.agent === agent);
	if (!installer) {
		throw new Error(
			`Unsupported MCP agent: ${agent}. Supported agents: ${mcpAgentInstallers
				.map((entry) => entry.agent)
				.join(", ")}`,
		);
	}
	return installer.install(options);
}

function installPiMcpServer(
	options: McpAgentInstallOptions = {},
): McpAgentInstallResult {
	const global = options.global !== false;
	const path = global
		? join(options.home ?? homedir(), ".config", "mcp", "mcp.json")
		: resolve(options.cwd ?? process.cwd(), ".mcp.json");
	const config = readJsonObject(path);
	const servers = objectProperty(config, "mcpServers");
	const serverName = options.serverName ?? defaultServerName;
	servers[serverName] = {
		command: options.command ?? defaultCommand,
		args: options.args ?? defaultArgs,
	};
	config.mcpServers = servers;
	writeJsonObject(path, config);
	return {
		agent: "pi",
		path,
		serverName,
		scope: global ? "global" : "workspace",
	};
}

function installAntigravityMcpServer(
	options: McpAgentInstallOptions = {},
): McpAgentInstallResult {
	const global = options.global !== false;
	const path = global
		? join(
				options.home ?? homedir(),
				".gemini",
				"antigravity-cli",
				"mcp_config.json",
			)
		: resolve(options.cwd ?? process.cwd(), ".agents", "mcp_config.json");
	const config = readJsonObject(path);
	const servers = objectProperty(config, "mcpServers");
	const serverName = options.serverName ?? defaultServerName;
	servers[serverName] = {
		command: options.command ?? defaultCommand,
		args: options.args ?? defaultArgs,
		env: options.env ?? {},
	};
	config.mcpServers = servers;
	writeJsonObject(path, config);
	return {
		agent: "antigravity",
		path,
		serverName,
		scope: global ? "cli-global" : "workspace",
	};
}

function installJcodeMcpServer(
	options: McpAgentInstallOptions = {},
): McpAgentInstallResult {
	const global = options.global !== false;
	const path = global
		? join(options.home ?? homedir(), ".jcode", "mcp.json")
		: resolve(options.cwd ?? process.cwd(), ".jcode", "mcp.json");
	const config = readJsonObject(path);
	const servers = objectProperty(config, "servers");
	const serverName = options.serverName ?? defaultServerName;
	servers[serverName] = {
		command: options.command ?? defaultCommand,
		args: options.args ?? defaultArgs,
		env: options.env ?? {},
		shared: true,
	};
	config.servers = servers;
	writeJsonObject(path, config);
	return {
		agent: "jcode",
		path,
		serverName,
		scope: global ? "global" : "workspace",
	};
}

function readJsonObject(path: string): JsonObject {
	if (!existsSync(path)) return {};
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	return parsed as JsonObject;
}

function writeJsonObject(path: string, config: JsonObject): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmpPath = `${path}.${process.pid}.tmp`;
	const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
	writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	chmodSync(tmpPath, mode);
	renameSync(tmpPath, path);
}

function objectProperty(config: JsonObject, key: string): JsonObject {
	const value = config[key];
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as JsonObject;
}
