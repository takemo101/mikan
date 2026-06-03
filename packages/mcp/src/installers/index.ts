import { antigravityInstaller } from "./antigravity.ts";
import { jcodeInstaller } from "./jcode.ts";
import { piInstaller } from "./pi.ts";
import type {
	McpAgentInstaller,
	McpAgentInstallOptions,
	McpAgentInstallResult,
} from "./shared.ts";

export type {
	McpAgent,
	McpAgentAdapter,
	McpAgentInstaller,
	McpAgentInstallOptions,
	McpAgentInstallResult,
	McpInstallScope,
	McpServerSpec,
} from "./shared.ts";

export const mcpAgentInstallers: McpAgentInstaller[] = [
	piInstaller,
	antigravityInstaller,
	jcodeInstaller,
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
