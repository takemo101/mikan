import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// opencode skills (verified against a real install + the opencode binary):
// global skills live in ~/.config/opencode/skills/, project skills in
// .opencode/skills/, each as a directory with a SKILL.md.
const opencodeAdapter: SkillAgentAdapter = {
	agent: "opencode",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(
						options,
						".config",
						"opencode",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".opencode",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "workspace",
				},
};

export const opencodeSkillInstaller = createSkillInstaller(opencodeAdapter);
