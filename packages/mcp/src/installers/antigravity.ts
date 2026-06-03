import {
	createInstaller,
	homePath,
	isGlobalScope,
	type McpAgentAdapter,
	workspacePath,
} from "./shared.ts";

const antigravityAdapter: McpAgentAdapter = {
	agent: "antigravity",
	serversKey: "mcpServers",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: homePath(
						options,
						".gemini",
						"antigravity-cli",
						"mcp_config.json",
					),
					scope: "cli-global",
				}
			: {
					path: workspacePath(options, ".agents", "mcp_config.json"),
					scope: "workspace",
				},
	buildEntry: (spec) => ({
		command: spec.command,
		args: spec.args,
		env: spec.env,
	}),
};

export const antigravityInstaller = createInstaller(antigravityAdapter);
