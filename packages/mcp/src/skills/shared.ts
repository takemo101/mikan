import {
	homePath,
	isGlobalScope,
	workspacePath,
	writeTextFileAtomic,
} from "../installers/shared.ts";

export type SkillAgent =
	| "pi"
	| "antigravity"
	| "jcode"
	| "claude-code"
	| "opencode"
	| "codex"
	| "copilot-vscode"
	| "copilot-cli";

export type SkillAgentInstallOptions = {
	global?: boolean;
	cwd?: string;
	home?: string;
};

export type SkillScope = "global" | "workspace";

export type SkillAgentInstallResult = {
	agent: SkillAgent;
	path: string;
	scope: SkillScope;
};

export type SkillAgentInstaller = {
	agent: SkillAgent;
	install: (options?: SkillAgentInstallOptions) => SkillAgentInstallResult;
};

/**
 * A thin adapter that encodes only one agent's skill file location. The shared
 * runner writes the same mikan SKILL.md content through every adapter.
 */
export type SkillAgentAdapter = {
	agent: SkillAgent;
	// Resolve the SKILL.md path and reported scope, or throw if the requested
	// scope is unsupported by the agent.
	resolveTarget: (options: SkillAgentInstallOptions) => {
		path: string;
		scope: SkillScope;
	};
};

const skillFrontmatter = `---
name: mikan
description: Use mikan as a local-first Markdown Issue board. Trigger when the user wants to inspect, create, update, move, annotate, or mirror mikan Issues; manage workspace Repository Issues; or decide what to work on next. Use MCP-first with CLI fallback.
---`;

const instructionDocument = `# mikan

Use mikan as this project's local-first Markdown Issue board. Issues live in
\`.mikan/\`; MCP, CLI, TUI, and watch operate on the same files.

## Default workflow

1. Read the board or target Issue first.
2. Check warnings and unmet_dependencies before choosing or changing work.
3. Move substantial work to the board's active work column when starting.
4. Append Reports for findings, validation, blockers, and review results.
5. Move to the done column only after acceptance criteria and validation pass.

Use the board's configured Status columns; defaults are \`active\` for started
work and \`completed\` for done work.

## Tools

Prefer MCP tools:

- Read: \`get_board\`, \`list_issues\`, \`get_issue\`
- Change: \`create_issue\`, \`update_issue\`, \`move_issue\`, \`append_issue\`
- Publish: \`mirror_issue_to_github\`

Use CLI only when MCP is unavailable:

\`\`\`sh
mikan list
mikan show MIK-123
mikan add "Title" --repository backend --affects frontend
mikan update MIK-123 --label automation --depends-on MIK-122
mikan move MIK-123 active --log "Starting implementation"
mikan append MIK-123 --section Reports --source agent --body "Validation passed"
mikan github mirror MIK-123
\`\`\`

Do not edit \`.mikan/**/*.md\` directly unless the user explicitly asks or both
MCP and CLI are unavailable. If a command fails, report the error exactly.

## Workspace mode

If config has top-level \`repositories\`, every Issue needs a primary \`repository\`.
Use \`affects\` only for additional Repositories touched by the Issue; never
repeat the primary \`repository\` in \`affects\`.

Examples:

- MCP: \`create_issue({ title, repository: "backend", affects: ["frontend"] })\`
- CLI: \`mikan add "Title" --repository backend --affects frontend\`

Mirror target rules:

- New Mirrors use \`Issue.repository -> repositories[].github.repo\`.
- Labels and \`affects\` never choose the Mirror target.
- Existing Mirrors keep the stored \`github_issue.repo\`.
- top-level \`github.repo\` is not a workspace fallback.
- \`github.auto_push_mirrors\` only controls \`mikan watch\` auto-push for Issues
  that already have \`github_issue\` frontmatter.

Without top-level \`repositories\`, mikan is in single-project mode: Issues do
not need \`repository\`/\`affects\`, and new Mirrors use top-level \`github.repo\`.

## Boundaries

Dependencies are advisory, not a scheduler or transition lock. GitHub Mirror is one-way publication; Markdown remains the source of truth. Use Issue, not Task or ticket. Avoid profile, role, team, scheduler, and workflow-engine framing.
`;

// The agent-facing mikan skill. The same body is installed for every agent;
// only the target file convention differs. The frontmatter `name`/`description`
// follows the SKILL.md convention shared by agents with first-class Skills.
export const skillDocument = `${skillFrontmatter}\n\n${instructionDocument}`;

/** Resolve a global skills path under the user home directory. */
export function globalSkillPath(
	options: SkillAgentInstallOptions,
	...segments: string[]
): string {
	return homePath(options, ...segments);
}

/** Resolve a workspace-local skills path under the current directory. */
export function workspaceSkillPath(
	options: SkillAgentInstallOptions,
	...segments: string[]
): string {
	return workspacePath(options, ...segments);
}

export { isGlobalScope };

/**
 * Turn a declarative skill adapter into an installer that writes the shared
 * mikan SKILL.md document to the agent's resolved location.
 */
export function createSkillInstaller(
	adapter: SkillAgentAdapter,
): SkillAgentInstaller {
	return {
		agent: adapter.agent,
		install: (options: SkillAgentInstallOptions = {}) => {
			const { path, scope } = adapter.resolveTarget(options);
			writeTextFileAtomic(path, skillDocument);
			return { agent: adapter.agent, path, scope };
		},
	};
}
