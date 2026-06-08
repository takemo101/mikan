import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// GitHub Copilot CLI supports Agent Skills. Personal skills live under
// ~/.copilot/skills/; project skills live under .github/skills/.
const copilotCliAdapter: SkillAgentAdapter = {
	agent: "copilot-cli",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(
						options,
						".copilot",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".github",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "workspace",
				},
};

export const copilotCliSkillInstaller = createSkillInstaller(copilotCliAdapter);
