import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// VS Code / GitHub Copilot Chat supports Agent Skills. Personal skills live
// under ~/.copilot/skills/; project skills live under .github/skills/.
const copilotVscodeAdapter: SkillAgentAdapter = {
	agent: "copilot-vscode",
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

export const copilotVscodeSkillInstaller =
	createSkillInstaller(copilotVscodeAdapter);
