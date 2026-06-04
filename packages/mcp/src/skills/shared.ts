import {
	homePath,
	isGlobalScope,
	workspacePath,
	writeTextFileAtomic,
} from "../installers/shared.ts";

export type SkillAgent = "claude-code" | "opencode" | "codex";

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

// The agent-facing mikan skill. The same document is installed for every agent;
// only the target file convention differs. The frontmatter `name`/`description`
// follow the SKILL.md convention shared by Claude Code, opencode, and Codex.
export const skillDocument = `---
name: mikan
description: mikan is a local-first Issue board for AI-assisted development. Use it to read the board; create, update, move, and append to Issues; and explicitly publish GitHub Mirrors through the mikan MCP tools. Trigger when the user wants to see the board, add or change an Issue, move an Issue to another Status, record a Report or Note, publish a GitHub Mirror, or decide what to work on next.
---

# mikan

mikan is a tiny, local-first, Markdown-backed Issue board. Each Issue has a
stable Issue ID such as \`MIK-001\`, one current Status (the board Column it
lives in), optional Labels, and a body that can hold Reports and Notes.

Drive mikan through its MCP tools rather than editing the Markdown files
directly:

- \`get_board\`, \`list_issues\`, \`get_issue\` — read the board and individual Issues.
- \`create_issue\` — create an Issue (title, optional body, status, labels, depends_on).
- \`update_issue\` — update an Issue's title, labels, dependencies, or body.
- \`move_issue\` — move an Issue to another Status, including \`blocked\` and \`completed\`.
- \`append_issue\` — append a Report (with a source) or a Note to an Issue.
- \`mirror_issue_to_github\` — explicit external-publication operation that creates the GitHub Issue mirror when missing or updates it when it already exists.

GitHub Mirror is one-way: mikan Markdown remains the source of truth, and GitHub
Issues are external mirrors only. Do not import GitHub Issues or treat GitHub as
authoritative.

## Statuses

The standard Statuses are \`backlog\`, \`ready\`, \`active\`, \`blocked\`,
\`completed\`, and \`archived\`. An Issue's Status is the board Column it sits in;
change it with \`move_issue\`.

## Dependencies are advisory

An Issue may declare \`depends_on\` (prerequisite Issue IDs). Read tools also
return \`unmet_dependencies\` and \`dependency_status\` (\`ready\` or \`blocked\`).
These are advisory read-model data to help humans and agents pick an order.
mikan does not schedule, auto-move, or block Issues on dependencies.

## Vocabulary

Use Issue, Issue ID, Status, Column, Label, Report, Note, and Dependency. Avoid
Task, ticket, profile, and role.
`;

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
