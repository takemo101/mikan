import {
	createInstaller,
	homePath,
	isGlobalScope,
	type McpAgentAdapter,
	workspacePath,
} from "./shared.ts";

// opencode MCP registration conventions (verified against a real install):
// - Servers live under a top-level `mcp` key (not `mcpServers`).
// - A local (stdio) server uses { type: "local", command: [cmd, ...args],
//   enabled: true, environment: {} } — command and args are a single array.
// - Global config is ~/.config/opencode/opencode.json; project scope is the
//   checked-in opencode.json at the project root.
const opencodeAdapter: McpAgentAdapter = {
	agent: "opencode",
	serversKey: "mcp",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: homePath(options, ".config", "opencode", "opencode.json"),
					scope: "global",
				}
			: {
					path: workspacePath(options, "opencode.json"),
					scope: "workspace",
				},
	buildEntry: (spec) => ({
		type: "local",
		command: [spec.command, ...spec.args],
		enabled: true,
		environment: spec.env,
	}),
};

export const opencodeInstaller = createInstaller(opencodeAdapter);
