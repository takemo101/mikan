import {
	createInstaller,
	homePath,
	isGlobalScope,
	type McpAgentAdapter,
	workspacePath,
} from "./shared.ts";

const jcodeAdapter: McpAgentAdapter = {
	agent: "jcode",
	serversKey: "servers",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? { path: homePath(options, ".jcode", "mcp.json"), scope: "global" }
			: {
					path: workspacePath(options, ".jcode", "mcp.json"),
					scope: "workspace",
				},
	buildEntry: (spec) => ({
		command: spec.command,
		args: spec.args,
		env: spec.env,
		shared: true,
	}),
};

export const jcodeInstaller = createInstaller(jcodeAdapter);
