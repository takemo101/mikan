import { antigravitySkillInstaller } from "./antigravity.ts";
import { claudeCodeSkillInstaller } from "./claude-code.ts";
import { codexSkillInstaller } from "./codex.ts";
import { copilotCliSkillInstaller } from "./copilot-cli.ts";
import { copilotVscodeSkillInstaller } from "./copilot-vscode.ts";
import { jcodeSkillInstaller } from "./jcode.ts";
import { opencodeSkillInstaller } from "./opencode.ts";
import { piSkillInstaller } from "./pi.ts";
import type {
	SkillAgentInstallOptions,
	SkillAgentInstallResult,
} from "./shared.ts";

// Skill installation is a separate surface from MCP registration: `mikan mcp
// add` registers MCP tools, while `mikan skills add` installs lightweight,
// agent-facing usage guidance. Each agent is a thin adapter over a shared
// mikan SKILL.md document; this Module owns the registry and dispatch.

export type {
	SkillAgent,
	SkillAgentAdapter,
	SkillAgentInstaller,
	SkillAgentInstallOptions,
	SkillAgentInstallResult,
	SkillScope,
} from "./shared.ts";

export const skillAgentInstallers = [
	piSkillInstaller,
	antigravitySkillInstaller,
	jcodeSkillInstaller,
	claudeCodeSkillInstaller,
	opencodeSkillInstaller,
	codexSkillInstaller,
	copilotVscodeSkillInstaller,
	copilotCliSkillInstaller,
];

export function installSkillForAgent(
	agent: string,
	options: SkillAgentInstallOptions = {},
): SkillAgentInstallResult {
	const installer = skillAgentInstallers.find((entry) => entry.agent === agent);
	if (!installer) {
		throw new Error(
			`Unsupported skill agent: ${agent}. Supported agents: ${skillAgentInstallers
				.map((entry) => entry.agent)
				.join(", ")}`,
		);
	}
	return installer.install(options);
}
