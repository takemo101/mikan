import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// jcode loads SKILL.md directories from ~/.jcode/skills/ and .jcode/skills/.
const jcodeAdapter: SkillAgentAdapter = {
	agent: "jcode",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(
						options,
						".jcode",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".jcode",
						"skills",
						"mikan",
						"SKILL.md",
					),
					scope: "workspace",
				},
};

export const jcodeSkillInstaller = createSkillInstaller(jcodeAdapter);
