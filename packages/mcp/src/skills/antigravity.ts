import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// Antigravity exposes Rules rather than SKILL.md. Global rules are one shared
// ~/.gemini/GEMINI.md file, so use a managed block to preserve user content.
// Workspace rules live as Markdown files under .agents/rules/.
const antigravityAdapter: SkillAgentAdapter = {
	agent: "antigravity",
	format: "instructions",
	writeMode: "managed-block",
	resolveTarget: (options) =>
		isGlobalScope(options)
			? {
					path: globalSkillPath(options, ".gemini", "GEMINI.md"),
					scope: "global",
				}
			: {
					path: workspaceSkillPath(options, ".agents", "rules", "mikan.md"),
					scope: "workspace",
				},
};

export const antigravitySkillInstaller =
	createSkillInstaller(antigravityAdapter);
