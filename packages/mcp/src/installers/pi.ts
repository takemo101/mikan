import {
	createInstaller,
	homePath,
	isGlobalScope,
	type McpAgentAdapter,
	workspacePath,
} from "./shared.ts";

const piAdapter: McpAgentAdapter = {
	agent: "pi",
	serversKey: "mcpServers",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: homePath(options, ".config", "mcp", "mcp.json"),
					scope: "global",
				}
			: { path: workspacePath(options, ".mcp.json"), scope: "workspace" },
	buildEntry: (spec) => ({ command: spec.command, args: spec.args }),
};

export const piInstaller = createInstaller(piAdapter);
