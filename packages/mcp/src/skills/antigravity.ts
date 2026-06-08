import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// Antigravity supports Agent Skills as directories containing SKILL.md.
// CLI-global skills live under ~/.gemini/antigravity-cli/skills/; workspace
// skills live under .agents/skills/.
const antigravityAdapter: SkillAgentAdapter = {
	agent: "antigravity",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(
						options,
						".gemini",
						"antigravity-cli",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".agents",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "workspace",
				},
};

export const antigravitySkillInstaller =
	createSkillInstaller(antigravityAdapter);
