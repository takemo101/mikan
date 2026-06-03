import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	type IssueFrontmatter,
	type ParsedIssue,
	parseIssueDocument,
	parseIssueMarkdown,
	serializeIssue,
} from "./issue-markdown.ts";
import {
	type IssueId,
	type LabelId,
	parseIssueId,
	parseLabelId,
	parseProjectKey,
	parseStatusId,
	type Result,
	type StatusId,
} from "./primitives.ts";

export type { ParsedIssue } from "./issue-markdown.ts";
export { parseIssueMarkdown } from "./issue-markdown.ts";
// Public facade re-exports for the extracted Issue parsing and Markdown
// preservation Modules (MIK-084). Behavior and exported names are unchanged.
export type {
	IssueId,
	IssueParseError,
	LabelId,
	ProjectKey,
	Result,
	StatusId,
	UtcTimestamp,
} from "./primitives.ts";
export {
	parseIssueId,
	parseLabelId,
	parseProjectKey,
	parseStatusId,
	parseUtcTimestamp,
} from "./primitives.ts";

export type ColumnConfig = { id: string; title: string };
export type LabelConfig = { id: string; title: string };
export type BoardConfig = {
	board: { columns: ColumnConfig[] };
	labels: LabelConfig[];
};

export type DependencyStatus = "ready" | "blocked";

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
		| "malformed_issue";
	message: string;
	path?: string;
};

export type IssueLocation = BoardIssue;

export type CreateIssueOptions = {
	projectRoot: string;
	config: BoardConfig & { project?: { key?: string } };
	title: string;
	body?: string;
	status?: string;
	labels?: string[];
	dependencies?: string[];
	now?: () => Date;
};

export type UpdateIssueOptions = {
	projectRoot: string;
	config: BoardConfig;
	id: string;
	title?: string;
	labels?: string[];
	dependencies?: string[];
	body?: string;
	now?: () => Date;
};

export type MoveIssueOptions = {
	projectRoot: string;
	config: BoardConfig;
	id: string;
	status: string;
	log?: string;
	now?: () => Date;
};

export type AppendIssueOptions = {
	projectRoot: string;
	config: BoardConfig;
	id: string;
	section: string;
	body: string;
	source?: string;
	now?: () => Date;
};

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
	const warnings: BoardWarning[] = [];
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

function deriveDependencyState(
	byId: Map<string, BoardIssue[]>,
	warnings: BoardWarning[],
): void {
	for (const item of [...byId.values()].flat()) {
		const issueId = String(item.issue.id);
		const unmet = new Map<string, IssueId>();
		for (const dependency of item.issue.dependencies) {
			const dependencyId = String(dependency);
			if (dependencyId === issueId) {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_self",
					message: `${issueId} depends on itself`,
					issueId,
					path: item.path,
				});
				continue;
			}
			const matches = byId.get(dependencyId) ?? [];
			const target = matches[0];
			if (!target) {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_missing",
					message: `${issueId} depends on missing Issue ${dependencyId}`,
					issueId,
					path: item.path,
				});
				continue;
			}
			if (hasDependencyPath(dependencyId, issueId, byId)) {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_cycle",
					message: `${issueId} has cyclic dependency through ${dependencyId}`,
					issueId,
					path: item.path,
				});
				continue;
			}
			const targetStatus = String(target.status);
			if (targetStatus === "archived") {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_archived",
					message: `${issueId} depends on archived Issue ${dependencyId}`,
					issueId,
					path: item.path,
				});
				continue;
			}
			if (targetStatus !== "completed") {
				unmet.set(dependencyId, dependency);
				warnings.push({
					kind: "dependency_incomplete",
					message: `${issueId} depends on incomplete Issue ${dependencyId}`,
					issueId,
					path: item.path,
				});
			}
		}
		item.unmetDependencies = [...unmet.values()];
		item.dependencyStatus =
			item.unmetDependencies.length > 0 ? "blocked" : "ready";
	}
}

function hasDependencyPath(
	fromId: string,
	toId: string,
	byId: Map<string, BoardIssue[]>,
	seen = new Set<string>(),
): boolean {
	if (fromId === toId) return true;
	if (seen.has(fromId)) return false;
	seen.add(fromId);
	const [item] = byId.get(fromId) ?? [];
	if (!item) return false;
	return item.issue.dependencies.some((dependency) =>
		hasDependencyPath(String(dependency), toId, byId, seen),
	);
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

export function createIssue(
	options: CreateIssueOptions,
): Result<IssueLocation, MutationError> {
	const status = options.status ?? "backlog";
	const statusValidation = validateStatus(options.config, status);
	if (!statusValidation.ok) return statusValidation;
	const labelsValidation = validateLabels(options.config, options.labels ?? []);
	if (!labelsValidation.ok) return labelsValidation;
	const dependenciesValidation = validateDependencies(
		options.dependencies ?? [],
	);
	if (!dependenciesValidation.ok) return dependenciesValidation;
	const projectKey = options.config.project?.key ?? "MIK";
	const parsedProjectKey = parseProjectKey(projectKey);
	if (!parsedProjectKey.ok) {
		return {
			ok: false,
			error: {
				kind: "malformed_issue",
				message: parsedProjectKey.error.message,
			},
		};
	}
	return withWriteLock(options.projectRoot, () => {
		const board = scanBoard({
			projectRoot: options.projectRoot,
			config: options.config,
			includeArchived: true,
		});
		if (!board.ok) return board;
		const duplicate = board.value.warnings.find(
			(warning) => warning.kind === "duplicate_issue_id",
		);
		if (duplicate) {
			return {
				ok: false,
				error: {
					kind: "duplicate_issue_id",
					message: duplicate.message,
					path: duplicate.path,
				},
			};
		}
		const sequence =
			findMaxIssueSequence({
				projectRoot: options.projectRoot,
				config: options.config,
				projectKey,
			}) + 1;
		const id = `${projectKey}-${String(sequence).padStart(3, "0")}`;
		const now = utcNow(options.now);
		const body = options.body ?? defaultIssueBody(options.title);
		const markdown = serializeIssue({
			frontmatter: {
				id,
				title: options.title,
				labels: options.labels ?? [],
				depends_on: dependenciesValidation.value.map(String),
				created_at: now,
				updated_at: now,
			},
			body,
		});
		const path = join(options.projectRoot, ".mikan", status, `${id}.md`);
		if (existsSync(path)) {
			return {
				ok: false,
				error: {
					kind: "duplicate_issue_id",
					message: `Issue already exists: ${id}`,
					path,
				},
			};
		}
		atomicWriteFile(path, markdown);
		const parsed = parseIssueMarkdown(markdown);
		if (!parsed.ok) {
			return {
				ok: false,
				error: { kind: "malformed_issue", message: parsed.error.message, path },
			};
		}
		return findIssueById({
			projectRoot: options.projectRoot,
			config: options.config,
			id,
		});
	});
}

export function updateIssue(
	options: UpdateIssueOptions,
): Result<IssueLocation, MutationError> {
	return withWriteLock(options.projectRoot, () => {
		const target = findIssueById(options);
		if (!target.ok) return target;
		const labels = options.labels ?? target.value.issue.labels.map(String);
		const labelsValidation = validateLabels(options.config, labels);
		if (!labelsValidation.ok) return labelsValidation;
		const dependenciesValidation = options.dependencies
			? validateDependencies(options.dependencies)
			: undefined;
		if (dependenciesValidation && !dependenciesValidation.ok)
			return dependenciesValidation;
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		const updated = serializeIssue({
			frontmatter: {
				...document.value.frontmatter,
				title: options.title ?? target.value.issue.title,
				labels,
				...(dependenciesValidation
					? { depends_on: dependenciesValidation.value.map(String) }
					: {}),
				updated_at: utcNow(options.now),
			},
			body: options.body ?? target.value.issue.body,
		});
		atomicWriteFile(target.value.path, updated);
		const parsed = parseIssueMarkdown(updated);
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					kind: "malformed_issue",
					message: parsed.error.message,
					path: target.value.path,
				},
			};
		}
		return findIssueById(options);
	});
}

export function moveIssue(
	options: MoveIssueOptions,
): Result<IssueLocation, MutationError> {
	return withWriteLock(options.projectRoot, () => {
		const statusValidation = validateStatus(options.config, options.status);
		if (!statusValidation.ok) return statusValidation;
		const target = findIssueById(options);
		if (!target.ok) return target;
		const existingLabels = validateLabels(
			options.config,
			target.value.issue.labels.map(String),
		);
		if (!existingLabels.ok) return existingLabels;
		const destination = join(
			options.projectRoot,
			".mikan",
			options.status,
			basename(target.value.path),
		);
		if (destination !== target.value.path && existsSync(destination)) {
			return {
				ok: false,
				error: {
					kind: "duplicate_issue_id",
					message: `Destination already exists: ${destination}`,
					path: destination,
				},
			};
		}
		mkdirSync(dirname(destination), { recursive: true });
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		let body = target.value.issue.body;
		if (options.log) {
			body = appendToSection(
				body,
				"Status Log",
				formatAppendEntry(
					formatStatusTransitionLog(
						String(target.value.status),
						options.status,
						options.log,
					),
					undefined,
					options.now,
				),
			);
		}
		const updated = serializeIssue({
			frontmatter: {
				...document.value.frontmatter,
				updated_at: utcNow(options.now),
			},
			body,
		});
		atomicWriteFile(target.value.path, updated);
		if (destination !== target.value.path)
			renameSync(target.value.path, destination);
		const parsed = parseIssueMarkdown(readFileSync(destination, "utf8"));
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					kind: "malformed_issue",
					message: parsed.error.message,
					path: destination,
				},
			};
		}
		return findIssueById({
			projectRoot: options.projectRoot,
			config: options.config,
			id: options.id,
		});
	});
}

export function appendIssue(
	options: AppendIssueOptions,
): Result<IssueLocation, MutationError> {
	return withWriteLock(options.projectRoot, () => {
		const target = findIssueById(options);
		if (!target.ok) return target;
		const existingLabels = validateLabels(
			options.config,
			target.value.issue.labels.map(String),
		);
		if (!existingLabels.ok) return existingLabels;
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		const entry =
			options.section === "Notes" && !options.source
				? options.body
				: formatAppendEntry(options.body, options.source, options.now);
		const updated = serializeIssue({
			frontmatter: {
				...document.value.frontmatter,
				updated_at: utcNow(options.now),
			},
			body: appendToSection(target.value.issue.body, options.section, entry),
		});
		atomicWriteFile(target.value.path, updated);
		const parsed = parseIssueMarkdown(updated);
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					kind: "malformed_issue",
					message: parsed.error.message,
					path: target.value.path,
				},
			};
		}
		return findIssueById(options);
	});
}

export function appendToSection(
	body: string,
	section: string,
	entry: string,
): string {
	const heading = `## ${section}`;
	const lines = body.split("\n");
	const index = lines.findIndex((line) => line.trim() === heading);
	if (index === -1) {
		return `${body.replace(/\s*$/, "\n\n")}${heading}\n\n${entry.trim()}\n`;
	}
	let insertAt = lines.length;
	for (let i = index + 1; i < lines.length; i++) {
		if (/^##\s+/.test(lines[i] ?? "")) {
			insertAt = i;
			break;
		}
	}
	const before = lines.slice(0, insertAt).join("\n").replace(/\s*$/, "\n\n");
	const after = lines.slice(insertAt).join("\n");
	return `${before}${entry.trim()}\n${after ? `\n${after}` : ""}`;
}

export function isWriteLocked(projectRoot: string): boolean {
	return existsSync(lockPath(projectRoot));
}

function readIssueDocument(
	path: string,
): Result<
	{ frontmatter: IssueFrontmatter; issue: ParsedIssue },
	MutationError
> {
	const parsed = parseIssueDocument(readFileSync(path, "utf8"));
	if (!parsed.ok) {
		return {
			ok: false,
			error: { kind: "malformed_issue", message: parsed.error.message, path },
		};
	}
	return parsed;
}

function validateStatus(
	config: BoardConfig,
	status: string,
): Result<StatusId, MutationError> {
	if (!config.board.columns.some((column) => column.id === status)) {
		return {
			ok: false,
			error: { kind: "unknown_status", message: `Unknown Status: ${status}` },
		};
	}
	const parsed = parseStatusId(status);
	if (!parsed.ok)
		return {
			ok: false,
			error: { kind: "unknown_status", message: parsed.error.message },
		};
	return parsed;
}

function validateLabels(
	config: BoardConfig,
	labels: string[],
): Result<LabelId[], MutationError> {
	const known = new Set(config.labels.map((label) => label.id));
	const parsed: LabelId[] = [];
	for (const label of labels) {
		if (!known.has(label)) {
			return {
				ok: false,
				error: { kind: "unknown_label", message: `Unknown label: ${label}` },
			};
		}
		const labelId = parseLabelId(label);
		if (!labelId.ok) {
			return {
				ok: false,
				error: { kind: "unknown_label", message: labelId.error.message },
			};
		}
		parsed.push(labelId.value);
	}
	return { ok: true, value: parsed };
}

function validateDependencies(
	dependencies: string[],
): Result<IssueId[], MutationError> {
	const parsed: IssueId[] = [];
	for (const dependency of dependencies) {
		const dependencyId = parseIssueId(dependency);
		if (!dependencyId.ok) {
			return {
				ok: false,
				error: { kind: "malformed_issue", message: dependencyId.error.message },
			};
		}
		parsed.push(dependencyId.value);
	}
	return { ok: true, value: parsed };
}

function withWriteLock<T>(
	projectRoot: string,
	operation: () => Result<T, MutationError>,
): Result<T, MutationError> {
	const path = lockPath(projectRoot);
	if (existsSync(path)) {
		return {
			ok: false,
			error: { kind: "lock_held", message: "mikan write lock is held", path },
		};
	}
	mkdirSync(dirname(path), { recursive: true });
	try {
		writeFileSync(path, String(process.pid), { flag: "wx" });
	} catch {
		return {
			ok: false,
			error: { kind: "lock_held", message: "mikan write lock is held", path },
		};
	}
	try {
		return operation();
	} catch (error) {
		return {
			ok: false,
			error: {
				kind: "io_error",
				message: error instanceof Error ? error.message : String(error),
			},
		};
	} finally {
		rmSync(path, { force: true });
	}
}

function atomicWriteFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
	);
	writeFileSync(tmp, content);
	renameSync(tmp, path);
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

function defaultIssueBody(title: string): string {
	return `# ${title}\n\n## Summary\n\n## Context\n\n## Acceptance Criteria\n\n## Status Log\n\n## Reports\n\n## Notes\n`;
}

function formatAppendEntry(
	body: string,
	source?: string,
	now?: () => Date,
): string {
	const prefix = source ? `- ${utcNow(now)} (${source})` : `- ${utcNow(now)}`;
	return `${prefix}\n\n${body}`;
}

function formatStatusTransitionLog(
	fromStatus: string,
	toStatus: string,
	message: string,
): string {
	return `Moved from ${fromStatus} to ${toStatus}\n\n${message}`;
}

function utcNow(now?: () => Date): string {
	return (now?.() ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function lockPath(projectRoot: string): string {
	return join(projectRoot, ".mikan", ".state", "write.lock");
}
