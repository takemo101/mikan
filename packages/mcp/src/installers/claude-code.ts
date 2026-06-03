import {
	createInstaller,
	homePath,
	isGlobalScope,
	type McpAgentAdapter,
	workspacePath,
} from "./shared.ts";

// Claude Code MCP registration conventions (verified against a real install):
// - User (global) scope lives in ~/.claude.json under a top-level `mcpServers`
//   map; a stdio server is stored minimally as { command, args }.
// - Project (workspace) scope is the checked-in `.mcp.json` at the project root,
//   also keyed by `mcpServers`.
const claudeCodeAdapter: McpAgentAdapter = {
	agent: "claude-code",
	serversKey: "mcpServers",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? { path: homePath(options, ".claude.json"), scope: "global" }
			: { path: workspacePath(options, ".mcp.json"), scope: "workspace" },
	buildEntry: (spec) => ({ command: spec.command, args: spec.args }),
};

export const claudeCodeInstaller = createInstaller(claudeCodeAdapter);
