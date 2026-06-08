import {
	createSkillInstaller,
	isGlobalScope,
	type SkillAgentAdapter,
	workspaceSkillPath,
} from "./shared.ts";

// VS Code / GitHub Copilot Chat reliably discovers repository-wide custom
// instructions from .github/copilot-instructions.md. A stable personal file
// path is not verified, so global scope is rejected instead of guessing.
const copilotVscodeAdapter: SkillAgentAdapter = {
	agent: "copilot-vscode",
	format: "instructions",
	writeMode: "managed-block",
	resolveTarget: (options) => {
		if (isGlobalScope(options)) {
			throw new Error(
				"VS Code personal Copilot instructions path is not verified; " +
					"re-run `mikan skills add --agent copilot-vscode --no-global` " +
					"to install repository instructions into .github/copilot-instructions.md.",
			);
		}
		return {
			path: workspaceSkillPath(options, ".github", "copilot-instructions.md"),
			scope: "workspace",
		};
	},
};

export const copilotVscodeSkillInstaller =
	createSkillInstaller(copilotVscodeAdapter);
