import {
	type BoardGithubIssue,
	findIssueById,
	type IssueMetadata,
	type MutationError,
} from "@mikan/core";
import { resolveGitHubMirrorTarget } from "@mikan/github";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";

// Read-only Issue detail API for `GET /api/issues/:id`.
//
// Each call reloads the current project config from disk and locates the Issue
// (archived included) so detail reads stay live without a watcher or daemon. It
// returns the Issue's Markdown body plus the display metadata the Focused
// Markdown Modal needs, and maps missing/malformed Issues to the same stable
// `{ ok: false, error: { code, message } }` envelope as the Board API with
// user-fixable codes. This module never writes to the project.

// The GitHub Mirror target the detail action confirmation displays before any
// external GitHub work. It is resolved through `@mikan/github`'s
// `resolveGitHubMirrorTarget`, so it follows the exact Mirror target rules and
// never duplicates them: existing Mirrors keep their stored `github_issue.repo`;
// new Mirrors resolve through single-project `github.repo` or, in workspace mode,
// the Issue's primary `repository` to its configured `repositories[].github.repo`.
// Labels and `affects` never choose the target. When the target cannot be
// resolved (missing/unknown config), the failure is surfaced so the confirmation
// can explain why a Mirror is not yet possible rather than silently omitting it.
export type IssueMirrorTarget =
	| { ok: true; repo: string }
	| { ok: false; code: string; message: string };

export type IssueDetailView = {
	id: string;
	title: string;
	status: string;
	path: string;
	labels: string[];
	labelTitles?: Record<string, string>;
	repository?: string;
	repositoryTitle?: string;
	affects?: string[];
	dependsOn?: string[];
	unmetDependencies?: string[];
	dependencyStatus?: "ready" | "blocked";
	githubIssue?: BoardGithubIssue;
	mirrorTarget: IssueMirrorTarget;
	metadata?: IssueMetadata;
	createdAt: string;
	updatedAt: string;
	body: string;
};

export type IssueDetailResponse =
	| { ok: true; issue: IssueDetailView }
	| { ok: false; error: ApiError };

export function loadIssueDetailResponse(
	cwd: string,
	id: string,
): IssueDetailResponse {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const located = findIssueById({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
	});
	if (!located.ok) {
		return { ok: false, error: mapIssueError(located.error) };
	}

	const issue = located.value.issue;
	const labelTitleMap = Object.fromEntries(
		loaded.value.config.labels.map((label) => [label.id, label.title]),
	);
	const repositoryTitleMap = Object.fromEntries(
		(loaded.value.config.repositories ?? []).map((repository) => [
			repository.id,
			repository.title,
		]),
	);
	const labels = issue.labels.map(String);
	const affects = issue.affects.map(String);
	const dependsOn = issue.dependencies.map(String);
	const unmetDependencies = located.value.unmetDependencies.map(String);
	// Resolve the Mirror target through the shared GitHub rules so the detail
	// action can confirm the destination repo without re-deriving it here.
	const resolvedTarget = resolveGitHubMirrorTarget(loaded.value.config, issue);
	const mirrorTarget: IssueMirrorTarget = resolvedTarget.ok
		? { ok: true, repo: resolvedTarget.value }
		: {
				ok: false,
				code: resolvedTarget.error.kind,
				message: resolvedTarget.error.message,
			};

	return {
		ok: true,
		issue: {
			id: String(issue.id),
			title: issue.title,
			status: String(located.value.status),
			path: located.value.path,
			labels,
			...(labels.length > 0
				? {
						labelTitles: Object.fromEntries(
							labels.map((label) => [label, labelTitleMap[label] ?? label]),
						),
					}
				: {}),
			...(issue.repository !== undefined
				? {
						repository: issue.repository,
						repositoryTitle:
							repositoryTitleMap[issue.repository] ?? issue.repository,
					}
				: {}),
			...(affects.length > 0 ? { affects } : {}),
			...(dependsOn.length > 0 ? { dependsOn } : {}),
			...(unmetDependencies.length > 0 ? { unmetDependencies } : {}),
			...(located.value.dependencyStatus
				? { dependencyStatus: located.value.dependencyStatus }
				: {}),
			...(issue.githubIssue
				? {
						githubIssue: {
							repo: issue.githubIssue.repo,
							number: issue.githubIssue.number,
							url: issue.githubIssue.url,
							lastMirroredAt: issue.githubIssue.lastMirroredAt,
						},
					}
				: {}),
			mirrorTarget,
			...(Object.keys(issue.metadata).length > 0
				? { metadata: issue.metadata }
				: {}),
			createdAt: String(issue.createdAt),
			updatedAt: String(issue.updatedAt),
			body: issue.body,
		},
	};
}

// Map the core locate failure to a user-facing code. Missing or malformed
// Issues are user-fixable (check the ID / repair the file); anything unexpected
// collapses to a generic internal_error.
function mapIssueError(error: MutationError): ApiError {
	switch (error.kind) {
		case "not_found":
			return { code: "issue_not_found", message: error.message };
		case "malformed_issue":
			return { code: "malformed_issue", message: error.message };
		case "duplicate_issue_id":
			return { code: "duplicate_issue_id", message: error.message };
		default:
			return { code: "internal_error", message: error.message };
	}
}
