import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// GitHub Copilot CLI reads global instructions from
// ~/.copilot/copilot-instructions.md and repository instructions from
// .github/copilot-instructions.md.
const copilotCliAdapter: SkillAgentAdapter = {
	agent: "copilot-cli",
	format: "instructions",
	writeMode: "managed-block",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(options, ".copilot", "copilot-instructions.md"),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(
						options,
						".github",
						"copilot-instructions.md",
					),
					scope: "workspace",
				},
};

export const copilotCliSkillInstaller = createSkillInstaller(copilotCliAdapter);
