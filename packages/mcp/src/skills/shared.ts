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

mikan is a local-first Markdown Issue board. Issues live under \`.mikan/\`; MCP,
CLI, TUI, and watch operate on the same files.

## MCP-first

Use MCP tools before shell commands or file edits:

- \`get_board\`, \`list_issues\`, \`get_issue\` — read Issues and scanner warnings.
- \`create_issue\` — create an Issue.
- \`update_issue\` — update title, Labels, Dependencies, body, metadata, Repository fields.
- \`move_issue\` — move Status.
- \`append_issue\` — append a Report or Note.
- \`mirror_issue_to_github\` — explicitly create or update a GitHub Mirror.

Read before changing an existing Issue. Do not edit \`.mikan/**/*.md\` directly
unless the user explicitly asks or both MCP and CLI are unusable.

## CLI fallback

When MCP tools are unavailable, run \`mikan\` CLI commands from the project root:

\`\`\`sh
mikan list
mikan list --status ready
mikan show MIK-123
mikan add "Issue title" --status backlog --label automation
mikan update MIK-123 --title "New title"
mikan update MIK-123 --label automation --depends-on MIK-122
mikan move MIK-123 active --log "Starting implementation"
mikan append MIK-123 --section Reports --source agent --body "Finding text"
mikan append MIK-123 --section Notes --body "Note text"
mikan github mirror MIK-123
\`\`\`

CLI fallback rules:

- Run \`mikan show <id>\` before changing an existing Issue.
- Use repeated \`--label\`, \`--depends-on\`, and \`--affects\` flags for multiple values.
- Keep Status values aligned with the project's configured Columns.
- If a command fails, report the error exactly; do not hand-edit around it.

## Single-project mode

Without top-level \`repositories\` config, mikan is in single-project mode.
Issues do not need \`repository\` or \`affects\`. GitHub Mirrors use top-level
\`github.repo\`.

## Workspace mode

A project with top-level \`repositories\` config is in workspace mode. One parent
\`.mikan\` board coordinates several local repositories while Issue files and IDs
stay in the parent board.

Workspace Issue rules:

- A primary \`repository\` is required for every Issue.
- \`affects\` is context only; it must not repeat the primary \`repository\`.
- Create with MCP: \`create_issue({ title, repository: "backend", affects: ["frontend"] })\`.
- Update with MCP: \`update_issue({ id: "MIK-123", repository: "frontend", affects: ["backend"] })\`.
- CLI fallback: \`mikan add "Workspace Issue" --repository backend --affects frontend\`.
- CLI fallback: \`mikan update MIK-123 --repository frontend --affects backend\`.

Workspace GitHub Mirror rules:

- New Mirrors resolve from the Issue's \`repository\` to \`repositories[].github.repo\`.
- Labels and \`affects\` never choose the Mirror target.
- Existing Mirrors keep the stored \`github_issue.repo\`.
- top-level \`github.repo\` is not required and is not a workspace fallback.
- \`github.auto_push_mirrors\` is workspace-wide; it only controls \`mikan watch\`
  auto-push for Issues that already have \`github_issue\` frontmatter.

## Dependencies and vocabulary

Dependencies are advisory. Use \`depends_on\`, \`unmet_dependencies\`, and
\`dependency_status\` to explain ordering; do not treat them as a scheduler or
transition blocker.

GitHub Mirror is one-way publication. Local Markdown remains authoritative;
GitHub Issues are external mirrors only. Do not import GitHub Issues or treat
GitHub as source of truth.

Use Issue, Issue ID, Status, Column, Label, Report, Note, Dependency, Repository,
and GitHub Mirror. Avoid Task, ticket, profile, role, team, or scheduler framing.
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
