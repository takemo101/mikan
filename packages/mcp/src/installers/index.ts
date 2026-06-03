import { antigravityInstaller } from "./antigravity.ts";
import { claudeCodeInstaller } from "./claude-code.ts";
import { codexInstaller } from "./codex.ts";
import { jcodeInstaller } from "./jcode.ts";
import { opencodeInstaller } from "./opencode.ts";
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
	claudeCodeInstaller,
	opencodeInstaller,
	codexInstaller,
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
