import {
	homePath,
	isGlobalScope,
	workspacePath,
	writeTextFileAtomic,
} from "../installers/shared.ts";

// Skill installation is a separate surface from MCP registration: `mikan mcp
// add` registers MCP tools, while `mikan skills add` installs lightweight,
// agent-facing usage guidance. This Module owns the registry and dispatch; the
// per-agent skill file conventions and richer content are layered on top of it.

export type SkillAgent = "claude-code" | "opencode" | "codex";

export type SkillAgentInstallOptions = {
	global?: boolean;
	cwd?: string;
	home?: string;
};

export type SkillScope = "global" | "workspace";

export type SkillAgentInstallResult = {
	agent: SkillAgent;
	path: string;
	scope: SkillScope;
};

export type SkillAgentInstaller = {
	agent: SkillAgent;
	install: (options?: SkillAgentInstallOptions) => SkillAgentInstallResult;
};

// Baseline mikan skill body. Kept intentionally short here; per-agent content
// and conventions are refined by the skill installer adapters.
const skillBody = `# mikan

mikan is a local-first, Markdown-backed Issue board. Use the mikan MCP tools
to read the board and to create, update, move, and append to Issues. Issue
dependencies (depends_on) are advisory read-model data, not scheduling.
`;

function installBaselineSkill(
	agent: SkillAgent,
	options: SkillAgentInstallOptions = {},
): SkillAgentInstallResult {
	const global = isGlobalScope(options);
	const path = global
		? homePath(options, ".mikan", "skills", `${agent}.md`)
		: workspacePath(options, ".mikan", "skills", `${agent}.md`);
	writeTextFileAtomic(path, skillBody);
	return { agent, path, scope: global ? "global" : "workspace" };
}

export const skillAgentInstallers: SkillAgentInstaller[] = [
	{
		agent: "claude-code",
		install: (options) => installBaselineSkill("claude-code", options),
	},
	{
		agent: "opencode",
		install: (options) => installBaselineSkill("opencode", options),
	},
	{
		agent: "codex",
		install: (options) => installBaselineSkill("codex", options),
	},
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
