import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// Pi supports Agent Skills as directories containing SKILL.md. Personal skills
// live under ~/.pi/agent/skills/; project skills live under .pi/skills/.
const piAdapter: SkillAgentAdapter = {
	agent: "pi",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(
						options,
						".pi",
						"agent",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".pi",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "workspace",
				},
};

export const piSkillInstaller = createSkillInstaller(piAdapter);
