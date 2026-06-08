import {
	createInstaller,
	isGlobalScope,
	type JsonObject,
	type McpAgentAdapter,
	workspacePath,
} from "./shared.ts";

// VS Code / GitHub Copilot Chat MCP registration conventions:
// - Workspace scope lives in .vscode/mcp.json under a top-level `servers` map.
// - A local MCP server is a stdio entry with { type: "stdio", command, args }.
// - User/profile configuration paths vary by VS Code profile/environment, so
//   global scope is rejected until an exact, verified path can be encoded.
const copilotVscodeAdapter: McpAgentAdapter = {
	agent: "copilot-vscode",
	serversKey: "servers",
	resolveTarget: (options) => {
		if (isGlobalScope(options)) {
			throw new Error(
				"VS Code user-profile MCP configuration path is not verified; " +
					"re-run `mikan mcp add --agent copilot-vscode --no-global` " +
					"to register mikan in .vscode/mcp.json for this workspace.",
			);
		}
		return {
			path: workspacePath(options, ".vscode", "mcp.json"),
			scope: "workspace",
		};
	},
	buildEntry: (spec) => {
		const entry: JsonObject = {
			type: "stdio",
			command: spec.command,
			args: spec.args,
		};
		if (Object.keys(spec.env).length > 0) entry.env = spec.env;
		return entry;
	},
};

export const copilotVscodeInstaller = createInstaller(copilotVscodeAdapter);
