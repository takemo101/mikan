import {
	createSkillInstaller,
	globalSkillPath,
	isGlobalScope,
	type SkillAgentAdapter,
} from "./shared.ts";

// Codex skills (verified against a real install): global skills live in
// ~/.codex/skills/ as a directory with a SKILL.md. Codex has no verified
// project-local skill convention, so workspace scope is rejected clearly
// rather than writing a file Codex would ignore.
const codexAdapter: SkillAgentAdapter = {
	agent: "codex",
	resolveTarget: (options) => {
		if (!isGlobalScope(options)) {
			throw new Error(
				"Codex skills are global-only; Codex has no workspace-local skill " +
					"directory. Re-run `mikan skills add --agent codex` without " +
					"--no-global to install into ~/.codex/skills/.",
			);
		}
		return {
			path: globalSkillPath(options, ".codex", "skills", "mikan", "SKILL.md"),
			scope: "global",
		};
	},
};

export const codexSkillInstaller = createSkillInstaller(codexAdapter);
