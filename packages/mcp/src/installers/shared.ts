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

export type McpAgent = "pi" | "antigravity" | "jcode" | "claude-code";

export type McpAgentInstallOptions = {
	global?: boolean;
	cwd?: string;
	home?: string;
	serverName?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
};

export type McpInstallScope = "global" | "cli-global" | "workspace";

export type McpAgentInstallResult = {
	agent: McpAgent;
	path: string;
	serverName: string;
	scope: McpInstallScope;
};

export type McpAgentInstaller = {
	agent: McpAgent;
	install: (options?: McpAgentInstallOptions) => McpAgentInstallResult;
};

export type JsonObject = Record<string, unknown>;

/** The default mikan stdio MCP server spec shared by every agent adapter. */
export type McpServerSpec = {
	command: string;
	args: string[];
	env: Record<string, string>;
};

/**
 * A thin adapter that encodes only one agent's config path/schema differences.
 * Shared helpers own JSON reading/writing and server spec construction.
 */
export type McpAgentAdapter = {
	agent: McpAgent;
	/** The config key under which server entries are stored. */
	serversKey: string;
	/** Resolve the config file path and reported scope from install options. */
	resolveTarget: (options: McpAgentInstallOptions) => {
		path: string;
		scope: McpInstallScope;
	};
	/** Build the agent-specific server entry from the shared server spec. */
	buildEntry: (spec: McpServerSpec) => JsonObject;
};

const defaultServerName = "mikan";
const defaultCommand = "mikan";
const defaultArgs = ["mcp"];

/** Global is the default scope unless the caller passes `global: false`. */
export function isGlobalScope(options: McpAgentInstallOptions): boolean {
	return options.global !== false;
}

/** Resolve a path under the workspace (cwd) for workspace-local scope. */
export function workspacePath(
	options: McpAgentInstallOptions,
	...segments: string[]
): string {
	return resolve(options.cwd ?? process.cwd(), ...segments);
}

/** Resolve a path under the user home directory for global scope. */
export function homePath(
	options: McpAgentInstallOptions,
	...segments: string[]
): string {
	return join(options.home ?? homedir(), ...segments);
}

export function resolveServerName(options: McpAgentInstallOptions): string {
	return options.serverName ?? defaultServerName;
}

export function buildServerSpec(
	options: McpAgentInstallOptions,
): McpServerSpec {
	return {
		command: options.command ?? defaultCommand,
		// Copy so the shared default array is never aliased into a written entry.
		args: options.args ?? [...defaultArgs],
		env: options.env ?? {},
	};
}

/**
 * Turn a declarative adapter into a full installer. The runner owns the shared
 * read/merge/write flow so each agent Module only encodes its differences.
 */
export function createInstaller(adapter: McpAgentAdapter): McpAgentInstaller {
	return {
		agent: adapter.agent,
		install: (options: McpAgentInstallOptions = {}) => {
			const { path, scope } = adapter.resolveTarget(options);
			const serverName = resolveServerName(options);
			const spec = buildServerSpec(options);
			const config = readJsonObject(path);
			const servers = objectProperty(config, adapter.serversKey);
			servers[serverName] = adapter.buildEntry(spec);
			config[adapter.serversKey] = servers;
			writeJsonObject(path, config);
			return { agent: adapter.agent, path, serverName, scope };
		},
	};
}

export function readJsonObject(path: string): JsonObject {
	if (!existsSync(path)) return {};
	const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	return parsed as JsonObject;
}

export function writeJsonObject(path: string, config: JsonObject): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmpPath = `${path}.${process.pid}.tmp`;
	const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o600;
	writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	chmodSync(tmpPath, mode);
	renameSync(tmpPath, path);
}

export function objectProperty(config: JsonObject, key: string): JsonObject {
	const value = config[key];
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as JsonObject;
}
