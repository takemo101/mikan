import type { BoardIssue, BoardSnapshot, BoardWarning } from "./board-scan.ts";
import type { IssueMetadata } from "./issue-markdown.ts";

// Shared, TUI-neutral board read model.
//
// `BoardViewModel` is the presentation-neutral projection of a Board Snapshot
// plus the configured Labels and Repositories. Both the TUI and the Browser
// adapter build their own surface-specific view models on top of it (the TUI
// layers selection/viewport state; the Browser serves it over `/api/board`).
//
// It carries display semantics only — Columns, Cards, labels, warnings,
// Repository fields, GitHub Mirror metadata, Issue Metadata, and dependency
// readiness — and never any disk, config-loading, or terminal concerns, so it
// keeps `core` free of UI dependencies.

export type BoardGithubIssue = {
	repo: string;
	number: number;
	url: string;
	lastMirroredAt: string;
};

export type BoardCardView = {
	id: string;
	title: string;
	labels: string[];
	status: string;
	path: string;
	dependsOn?: string[];
	unmetDependencies?: string[];
	dependencyStatus?: "ready" | "blocked";
	metadata?: IssueMetadata;
	githubIssue?: BoardGithubIssue;
	repository?: string;
	affects?: string[];
};

export type BoardColumnView = {
	id: string;
	title: string;
	cards: BoardCardView[];
};

export type BoardWarningView = {
	text: string;
	kind: string;
	message: string;
	issueId?: string;
	path?: string;
};

export type BoardLabelView = {
	id: string;
	title: string;
};

export type BoardRepositoryView = {
	id: string;
	title: string;
};

export type BoardViewModel = {
	columns: BoardColumnView[];
	warnings: string[];
	warningDetails?: BoardWarningView[];
	labels?: BoardLabelView[];
	labelTitles?: Record<string, string>;
	githubRepo?: string;
	repositories?: BoardRepositoryView[];
	repositoryTitles?: Record<string, string>;
	repositoryGithubRepos?: Record<string, string>;
};

export function buildBoardViewModel(
	board: BoardSnapshot,
	labels: { id: string; title: string }[] = [],
	githubRepo?: string,
	repositories?: { id: string; title: string; github?: { repo?: string } }[],
): BoardViewModel {
	const workspaceMode = repositories !== undefined && repositories.length > 0;
	const repositoryGithubRepos = Object.fromEntries(
		(repositories ?? []).flatMap((repository) =>
			repository.github?.repo
				? [[repository.id, repository.github.repo] as const]
				: [],
		),
	);
	return {
		columns: board.columns.map((column) => ({
			id: column.id,
			title: column.title,
			cards: column.issues.map(formatCard),
		})),
		warnings: board.warnings.map(formatWarning),
		...(board.warnings.length > 0
			? { warningDetails: board.warnings.map(formatWarningView) }
			: {}),
		labels: labels.map((label) => ({ id: label.id, title: label.title })),
		labelTitles: Object.fromEntries(
			labels.map((label) => [label.id, label.title]),
		),
		githubRepo,
		...(workspaceMode
			? {
					repositories: repositories.map((repository) => ({
						id: repository.id,
						title: repository.title,
					})),
					repositoryTitles: Object.fromEntries(
						repositories.map((repository) => [repository.id, repository.title]),
					),
					...(Object.keys(repositoryGithubRepos).length > 0
						? { repositoryGithubRepos }
						: {}),
				}
			: {}),
	};
}

export function formatWarning(warning: BoardWarning): string {
	return `${warning.kind}: ${warning.message}`;
}

function formatWarningView(warning: BoardWarning): BoardWarningView {
	return {
		text: formatWarning(warning),
		kind: warning.kind,
		message: warning.message,
		issueId: warning.issueId,
		path: warning.path,
	};
}

function formatCard(issue: BoardIssue): BoardCardView {
	return {
		id: String(issue.issue.id),
		title: issue.issue.title,
		labels: issue.issue.labels.map(String),
		status: String(issue.status),
		path: issue.path,
		dependsOn: issue.issue.dependencies.map(String),
		unmetDependencies: issue.unmetDependencies.map(String),
		dependencyStatus: issue.dependencyStatus,
		metadata: issue.issue.metadata,
		...(issue.issue.repository !== undefined
			? { repository: issue.issue.repository }
			: {}),
		...(issue.issue.affects.length > 0
			? { affects: issue.issue.affects.map(String) }
			: {}),
		...(issue.issue.githubIssue
			? {
					githubIssue: {
						repo: issue.issue.githubIssue.repo,
						number: issue.issue.githubIssue.number,
						url: issue.issue.githubIssue.url,
						lastMirroredAt: issue.issue.githubIssue.lastMirroredAt,
					},
				}
			: {}),
	};
}
