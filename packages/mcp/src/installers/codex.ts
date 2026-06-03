import {
	buildServerSpec,
	homePath,
	isGlobalScope,
	type McpAgentInstaller,
	type McpAgentInstallOptions,
	type McpAgentInstallResult,
	type McpServerSpec,
	readTextFile,
	resolveServerName,
	writeTextFileAtomic,
} from "./shared.ts";

// Codex MCP registration conventions (verified against a real install):
// - Codex config is TOML at ~/.codex/config.toml (relocatable via CODEX_HOME).
// - Each MCP server is a [mcp_servers.<name>] table with command/args (/env).
// - Codex MCP config is global-only: `codex mcp add` exposes no scope/project
//   flag, so there is no workspace-local file. We reject --no-global clearly
//   rather than invent a project-scoped path.

function tomlBasicString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function tomlKey(key: string): string {
	return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlBasicString(key);
}

function tableHeader(serverName: string): string {
	return `[mcp_servers.${tomlKey(serverName)}]`;
}

function regexEscape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Detect a server already defined via the non-canonical parent-table or dotted
// forms (`[mcp_servers]` with `<name> = {...}`, or `mcp_servers.<name>...`).
// upsertServerTable only matches the canonical `[mcp_servers.<name>]` header, so
// appending our table next to one of these forms would emit a duplicate key and
// invalid TOML. We fail clearly instead of corrupting the file.
function hasParentFormDefinition(
	existing: string,
	serverName: string,
): boolean {
	const name = regexEscape(serverName);
	if (new RegExp(`^\\s*mcp_servers\\s*\\.\\s*${name}\\b`, "m").test(existing)) {
		return true;
	}
	const assignment = new RegExp(`^\\s*${name}\\s*[.=]`);
	let inParentTable = false;
	for (const line of existing.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("[")) {
			inParentTable = trimmed === "[mcp_servers]";
			continue;
		}
		if (inParentTable && assignment.test(line)) return true;
	}
	return false;
}

function renderServerTable(serverName: string, spec: McpServerSpec): string {
	const lines = [tableHeader(serverName)];
	lines.push(`command = ${tomlBasicString(spec.command)}`);
	lines.push(`args = [${spec.args.map(tomlBasicString).join(", ")}]`);
	const envEntries = Object.entries(spec.env);
	if (envEntries.length > 0) {
		const inline = envEntries
			.map(([key, value]) => `${tomlKey(key)} = ${tomlBasicString(value)}`)
			.join(", ");
		lines.push(`env = { ${inline} }`);
	}
	return lines.join("\n");
}

// Replace an existing [mcp_servers.<name>] table in place, or append a new one,
// leaving all other TOML content (including comments) untouched.
function upsertServerTable(
	existing: string,
	serverName: string,
	tableText: string,
): string {
	const header = tableHeader(serverName);
	const lines = existing.split("\n");
	const startIdx = lines.findIndex((line) => line.trim() === header);
	if (startIdx === -1) {
		const trimmed = existing.replace(/\s*$/, "");
		return trimmed.length > 0
			? `${trimmed}\n\n${tableText}\n`
			: `${tableText}\n`;
	}
	let endIdx = lines.length;
	for (let i = startIdx + 1; i < lines.length; i++) {
		if ((lines[i] ?? "").trim().startsWith("[")) {
			endIdx = i;
			break;
		}
	}
	const merged = [
		...lines.slice(0, startIdx),
		...tableText.split("\n"),
		...lines.slice(endIdx),
	];
	const result = merged.join("\n");
	return result.endsWith("\n") ? result : `${result}\n`;
}

function installCodexMcpServer(
	options: McpAgentInstallOptions = {},
): McpAgentInstallResult {
	if (!isGlobalScope(options)) {
		throw new Error(
			"Codex MCP configuration is global-only; it has no workspace-local " +
				"scope. Re-run `mikan mcp add --agent codex` without --no-global to " +
				"register the server in ~/.codex/config.toml.",
		);
	}
	const path = homePath(options, ".codex", "config.toml");
	const serverName = resolveServerName(options);
	const spec = buildServerSpec(options);
	const existing = readTextFile(path);
	const hasCanonicalTable = existing
		.split("\n")
		.some((line) => line.trim() === tableHeader(serverName));
	if (!hasCanonicalTable && hasParentFormDefinition(existing, serverName)) {
		throw new Error(
			`mikan found an existing '${serverName}' MCP server in ${path} defined ` +
				"under a [mcp_servers] table form it cannot safely merge. Edit that " +
				"entry manually or use `codex mcp add` instead.",
		);
	}
	const table = renderServerTable(serverName, spec);
	writeTextFileAtomic(path, upsertServerTable(existing, serverName, table));
	return { agent: "codex", path, serverName, scope: "global" };
}

export const codexInstaller: McpAgentInstaller = {
	agent: "codex",
	install: installCodexMcpServer,
};
