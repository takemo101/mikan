import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// Claude Code skills (verified against a real install): each skill is a
// directory with a SKILL.md. Personal/global skills live in ~/.claude/skills/,
// project skills in .claude/skills/.
const claudeCodeAdapter: SkillAgentAdapter = {
	agent: "claude-code",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(
						options,
						".claude",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".claude",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "workspace",
				},
};

export const claudeCodeSkillInstaller = createSkillInstaller(claudeCodeAdapter);
