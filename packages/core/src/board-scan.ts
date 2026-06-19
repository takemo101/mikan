import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { type DependencyStatus, deriveDependencyState } from "./dependency.ts";
import { type ParsedIssue, parseIssueMarkdown } from "./issue-markdown.ts";
import {
	type IssueId,
	parseStatusId,
	type Result,
	type StatusId,
} from "./primitives.ts";

export type ColumnConfig = { id: string; title: string };
export type LabelConfig = { id: string; title: string };
export type RepositoryRef = {
	id: string;
	path?: string;
	github?: { repo?: string };
};
export type BoardConfig = {
	board: { columns: ColumnConfig[] };
	labels: LabelConfig[];
	repositories?: RepositoryRef[];
};

export type BoardIssue = {
	issue: ParsedIssue;
	status: StatusId;
	path: string;
	unmetDependencies: IssueId[];
	dependencyStatus: DependencyStatus;
};

export type BoardColumn = ColumnConfig & { issues: BoardIssue[] };

export type BoardWarning = {
	kind:
		| "duplicate_issue_id"
		| "unknown_label"
		| "unknown_directory"
		| "malformed_issue"
		| "missing_repository"
		| "unknown_repository"
		| "unknown_affects"
		| "affects_includes_primary"
		| "mirror_repo_mismatch"
		| "missing_repository_path"
		| "hook_failure"
		| "dependency_missing"
		| "dependency_incomplete"
		| "dependency_archived"
		| "dependency_self"
		| "dependency_cycle";
	message: string;
	path?: string;
	issueId?: string;
};

export type BoardSnapshot = {
	columns: BoardColumn[];
	warnings: BoardWarning[];
};

export type ScanBoardOptions = {
	projectRoot: string;
	config: BoardConfig;
	includeArchived?: boolean;
};

export type MutationError = {
	kind:
		| "lock_held"
		| "io_error"
		| "not_found"
		| "unknown_status"
		| "unknown_label"
		| "duplicate_issue_id"
		| "malformed_issue"
		| "missing_repository"
		| "unknown_repository"
		| "unknown_affects"
		| "affects_includes_primary";
	message: string;
	path?: string;
};

export type IssueLocation = BoardIssue;

export function scanBoard(
	options: ScanBoardOptions,
): Result<BoardSnapshot, MutationError> {
	const mikanRoot = join(options.projectRoot, ".mikan");
	const configuredStatuses = options.config.board.columns.map(
		(column) => column.id,
	);
	const visibleColumns = options.config.board.columns.filter(
		(column) => options.includeArchived || column.id !== "archived",
	);
	const labelIds = new Set(options.config.labels.map((label) => label.id));
	const repositories = options.config.repositories;
	const workspaceMode = repositories !== undefined && repositories.length > 0;
	const repositoryIds = new Set(
		(repositories ?? []).map((repository) => repository.id),
	);
	const repositoryGithubRepos = new Map(
		(repositories ?? []).map((repository) => [
			repository.id,
			repository.github?.repo,
		]),
	);
	const warnings: BoardWarning[] = workspaceMode
		? repositoryPathWarnings(options.projectRoot, repositories)
		: [];
	const byId = new Map<string, BoardIssue[]>();
	const columns: BoardColumn[] = visibleColumns.map((column) => ({
		...column,
		issues: [],
	}));
	const visibleByStatus = new Map(columns.map((column) => [column.id, column]));

	for (const statusId of configuredStatuses) {
		const statusDir = join(mikanRoot, statusId);
		if (!existsSync(statusDir)) continue;
		for (const filename of sortedMarkdownFiles(statusDir)) {
			const path = join(statusDir, filename);
			const raw = readFileSync(path, "utf8");
			const parsed = parseIssueMarkdown(raw);
			if (!parsed.ok) {
				warnings.push({
					kind: "malformed_issue",
					message: parsed.error.message,
					path,
				});
				continue;
			}
			const status = parseStatusId(statusId);
			if (!status.ok) continue;
			const item: BoardIssue = {
				issue: parsed.value,
				status: status.value,
				path,
				unmetDependencies: [],
				dependencyStatus: "ready",
			};
			const id = String(parsed.value.id);
			const matches = byId.get(id) ?? [];
			matches.push(item);
			byId.set(id, matches);
			for (const label of parsed.value.labels.map(String)) {
				if (!labelIds.has(label)) {
					warnings.push({
						kind: "unknown_label",
						message: `Unknown label ${label} on ${id}`,
						path,
						issueId: id,
					});
				}
			}
			if (workspaceMode) {
				warnings.push(
					...repositoryWarnings(
						parsed.value,
						repositoryIds,
						repositoryGithubRepos,
						path,
						id,
					),
				);
			}
			visibleByStatus.get(statusId)?.issues.push(item);
		}
	}

	for (const [id, matches] of byId) {
		if (matches.length > 1) {
			warnings.push({
				kind: "duplicate_issue_id",
				message: `Duplicate Issue ID ${id}`,
				issueId: id,
				path: matches.map((match) => match.path).join(", "),
			});
		}
	}

	deriveDependencyState(byId, warnings);

	if (existsSync(mikanRoot)) {
		const configured = new Set(
			configuredStatuses.concat([".state", "templates"]),
		);
		for (const entry of readdirSync(mikanRoot, { withFileTypes: true })) {
			if (!entry.isDirectory() || configured.has(entry.name)) continue;
			const dir = join(mikanRoot, entry.name);
			if (sortedMarkdownFiles(dir).length > 0) {
				warnings.push({
					kind: "unknown_directory",
					message: `Unknown Status directory ${entry.name}`,
					path: dir,
				});
			}
		}
	}

	warnings.push(...readHookFailureWarnings(options.projectRoot));

	return { ok: true, value: { columns, warnings } };
}

export function findMaxIssueSequence(options: {
	projectRoot: string;
	config: BoardConfig;
	projectKey: string;
}): number {
	let max = 0;
	const prefix = `${options.projectKey}-`;
	for (const column of options.config.board.columns) {
		const statusDir = join(options.projectRoot, ".mikan", column.id);
		if (!existsSync(statusDir)) continue;
		for (const filename of sortedMarkdownFiles(statusDir)) {
			const raw = readFileSync(join(statusDir, filename), "utf8");
			const parsed = parseIssueMarkdown(raw);
			if (!parsed.ok) continue;
			const id = String(parsed.value.id);
			if (!id.startsWith(prefix)) continue;
			max = Math.max(max, Number(id.slice(prefix.length)));
		}
	}
	return max;
}

export function findIssueById(options: {
	projectRoot: string;
	config: BoardConfig;
	id: string;
}): Result<IssueLocation, MutationError> {
	const board = scanBoard({
		projectRoot: options.projectRoot,
		config: options.config,
		includeArchived: true,
	});
	if (!board.ok) return board;
	const matches = board.value.columns
		.flatMap((column) => column.issues)
		.filter((item) => String(item.issue.id) === options.id);
	if (matches.length === 0) {
		for (const column of options.config.board.columns) {
			const path = join(
				options.projectRoot,
				".mikan",
				column.id,
				`${options.id}.md`,
			);
			if (!existsSync(path)) continue;
			const parsed = parseIssueMarkdown(readFileSync(path, "utf8"));
			if (!parsed.ok) {
				return {
					ok: false,
					error: {
						kind: "malformed_issue",
						message: parsed.error.message,
						path,
					},
				};
			}
		}
		return {
			ok: false,
			error: { kind: "not_found", message: `Issue not found: ${options.id}` },
		};
	}
	if (matches.length > 1) {
		return {
			ok: false,
			error: {
				kind: "duplicate_issue_id",
				message: `Duplicate Issue ID ${options.id}`,
			},
		};
	}
	return { ok: true, value: matches[0] as IssueLocation };
}

function repositoryPathWarnings(
	projectRoot: string,
	repositories: RepositoryRef[] | undefined,
): BoardWarning[] {
	return (repositories ?? []).flatMap((repository): BoardWarning[] => {
		if (repository.path === undefined) return [];
		const path = join(projectRoot, repository.path);
		if (existsSync(path)) return [];
		return [
			{
				kind: "missing_repository_path",
				message: `Repository ${repository.id} path does not exist: ${repository.path}`,
				path,
			},
		];
	});
}

function repositoryWarnings(
	issue: ParsedIssue,
	repositoryIds: Set<string>,
	repositoryGithubRepos: Map<string, string | undefined>,
	path: string,
	id: string,
): BoardWarning[] {
	const warnings: BoardWarning[] = [];
	const repository = issue.repository;
	if (repository === undefined) {
		warnings.push({
			kind: "missing_repository",
			message: `Missing repository on ${id}`,
			path,
			issueId: id,
		});
	} else if (!repositoryIds.has(repository)) {
		warnings.push({
			kind: "unknown_repository",
			message: `Unknown repository ${repository} on ${id}`,
			path,
			issueId: id,
		});
	} else {
		const mirrorRepo = issue.githubIssue?.repo;
		const configuredRepo = repositoryGithubRepos.get(repository);
		if (mirrorRepo && configuredRepo && mirrorRepo !== configuredRepo) {
			warnings.push({
				kind: "mirror_repo_mismatch",
				message: `GitHub Mirror repo ${mirrorRepo} on ${id} differs from repository ${repository}'s configured github.repo ${configuredRepo}`,
				path,
				issueId: id,
			});
		}
	}
	for (const affected of issue.affects) {
		if (repository !== undefined && affected === repository) {
			warnings.push({
				kind: "affects_includes_primary",
				message: `affects must not contain primary repository ${affected} on ${id}`,
				path,
				issueId: id,
			});
		} else if (!repositoryIds.has(affected)) {
			warnings.push({
				kind: "unknown_affects",
				message: `Unknown affected repository ${affected} on ${id}`,
				path,
				issueId: id,
			});
		}
	}
	return warnings;
}

function sortedMarkdownFiles(directory: string): string[] {
	return readdirSync(directory)
		.filter((entry) => entry.endsWith(".md"))
		.filter((entry) => statSync(join(directory, entry)).isFile())
		.sort();
}

function readHookFailureWarnings(projectRoot: string): BoardWarning[] {
	const path = join(projectRoot, ".mikan", ".state", "hook-log.ndjson");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.flatMap((line): BoardWarning[] => {
			let entry: unknown;
			try {
				entry = JSON.parse(line);
			} catch {
				return [];
			}
			if (!isHookFailureEntry(entry)) return [];
			const issueId = entry.issue_id;
			const command = entry.command;
			const exitCode = entry.exit_code;
			const detail = entry.error ? `: ${entry.error}` : "";
			return [
				{
					kind: "hook_failure",
					message: `Hook failed for ${issueId}: ${command} exited ${exitCode}${detail}`,
					path,
					issueId,
				},
			];
		});
}

function isHookFailureEntry(entry: unknown): entry is {
	issue_id: string;
	command: string;
	exit_code: number;
	error?: string;
} {
	if (!entry || typeof entry !== "object") return false;
	const value = entry as Record<string, unknown>;
	return (
		typeof value.issue_id === "string" &&
		typeof value.command === "string" &&
		typeof value.exit_code === "number" &&
		(value.error === undefined || typeof value.error === "string")
	);
}
