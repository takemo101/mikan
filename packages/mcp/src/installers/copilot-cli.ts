import {
	createInstaller,
	homePath,
	isGlobalScope,
	type McpAgentAdapter,
} from "./shared.ts";

// GitHub Copilot CLI MCP registration conventions:
// - Configuration is global at ~/.copilot/mcp-config.json.
// - Servers live under a top-level `mcpServers` map.
// - A local stdio server uses { type: "local", command, args, env, tools }.
const copilotCliAdapter: McpAgentAdapter = {
	agent: "copilot-cli",
	serversKey: "mcpServers",
	resolveTarget: (options) => {
		if (!isGlobalScope(options)) {
			throw new Error(
				"GitHub Copilot CLI MCP configuration is global-only; it has no " +
					"verified workspace-local scope. Re-run `mikan mcp add --agent " +
					"copilot-cli` without --no-global to register the server in " +
					"~/.copilot/mcp-config.json.",
			);
		}
		return {
			path: homePath(options, ".copilot", "mcp-config.json"),
			scope: "global",
		};
	},
	buildEntry: (spec) => ({
		type: "local",
		command: spec.command,
		args: spec.args,
		env: spec.env,
		tools: ["*"],
	}),
};

export const copilotCliInstaller = createInstaller(copilotCliAdapter);
