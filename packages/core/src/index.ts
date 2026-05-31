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
import { parse, stringify } from "yaml";
import { z } from "zod";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type IssueId = Brand<string, "IssueId">;
export type StatusId = Brand<string, "StatusId">;
export type LabelId = Brand<string, "LabelId">;
export type ProjectKey = Brand<string, "ProjectKey">;
export type UtcTimestamp = Brand<string, "UtcTimestamp">;

export type IssueParseError = {
	kind: "missing_frontmatter" | "invalid_frontmatter";
	message: string;
};

export type ParsedIssue = {
	id: IssueId;
	title: string;
	labels: LabelId[];
	createdAt: UtcTimestamp;
	updatedAt: UtcTimestamp;
	body: string;
};

export type ColumnConfig = { id: string; title: string };
export type LabelConfig = { id: string; title: string };
export type BoardConfig = {
	board: { columns: ColumnConfig[] };
	labels: LabelConfig[];
};

export type BoardIssue = {
	issue: ParsedIssue;
	status: StatusId;
	path: string;
};

export type BoardColumn = ColumnConfig & { issues: BoardIssue[] };

export type BoardWarning = {
	kind:
		| "duplicate_issue_id"
		| "unknown_label"
		| "unknown_directory"
		| "malformed_issue";
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
	now?: () => Date;
};

export type UpdateIssueOptions = {
	projectRoot: string;
	config: BoardConfig;
	id: string;
	title?: string;
	labels?: string[];
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

const issueIdPattern = /^[A-Z][A-Z0-9]*-\d{3,}$/;
const statusOrLabelPattern = /^[a-z][a-z0-9-]*$/;
const projectKeyPattern = /^[A-Z][A-Z0-9]*$/;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const frontmatterSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	labels: z.array(z.string()).optional().default([]),
	created_at: z.string().min(1),
	updated_at: z.string().min(1),
});

type IssueFrontmatter = z.infer<typeof frontmatterSchema>;

export function parseIssueId(input: string): Result<IssueId, IssueParseError> {
	if (!issueIdPattern.test(input)) {
		return invalidFrontmatter(`id must look like MIK-001: ${input}`);
	}
	return { ok: true, value: input as IssueId };
}

export function parseStatusId(
	input: string,
): Result<StatusId, IssueParseError> {
	if (!statusOrLabelPattern.test(input)) {
		return invalidFrontmatter(
			`status id must be lowercase kebab-case: ${input}`,
		);
	}
	return { ok: true, value: input as StatusId };
}

export function parseLabelId(input: string): Result<LabelId, IssueParseError> {
	if (!statusOrLabelPattern.test(input)) {
		return invalidFrontmatter(
			`label id must be lowercase kebab-case: ${input}`,
		);
	}
	return { ok: true, value: input as LabelId };
}

export function parseProjectKey(
	input: string,
): Result<ProjectKey, IssueParseError> {
	if (!projectKeyPattern.test(input)) {
		return invalidFrontmatter(
			`project key must be uppercase alphanumeric: ${input}`,
		);
	}
	return { ok: true, value: input as ProjectKey };
}

export function parseUtcTimestamp(
	input: string,
): Result<UtcTimestamp, IssueParseError> {
	const date = new Date(input);
	const canonical = Number.isNaN(date.valueOf())
		? ""
		: date.toISOString().replace(".000Z", "Z");
	if (!utcTimestampPattern.test(input) || canonical !== input) {
		return invalidFrontmatter(
			`timestamp must be UTC ISO 8601 ending in Z: ${input}`,
		);
	}
	return { ok: true, value: input as UtcTimestamp };
}

export function parseIssueMarkdown(
	markdown: string,
): Result<ParsedIssue, IssueParseError> {
	const parsed = parseIssueDocument(markdown);
	if (!parsed.ok) return parsed;
	return { ok: true, value: parsed.value.issue };
}

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
	return withWriteLock(options.projectRoot, () => {
		const status = options.status ?? "backlog";
		const statusValidation = validateStatus(options.config, status);
		if (!statusValidation.ok) return statusValidation;
		const labelsValidation = validateLabels(
			options.config,
			options.labels ?? [],
		);
		if (!labelsValidation.ok) return labelsValidation;
		const projectKey = options.config.project?.key ?? "MIK";
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
		return {
			ok: true,
			value: { issue: parsed.value, status: statusValidation.value, path },
		};
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
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		const updated = serializeIssue({
			frontmatter: {
				...document.value.frontmatter,
				title: options.title ?? target.value.issue.title,
				labels,
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
		return { ok: true, value: { ...target.value, issue: parsed.value } };
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
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		let body = target.value.issue.body;
		if (options.log) {
			body = appendToSection(
				body,
				"Status Log",
				formatAppendEntry(options.log, undefined, options.now),
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
		const destination = join(
			options.projectRoot,
			".mikan",
			options.status,
			basename(target.value.path),
		);
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
		return {
			ok: true,
			value: {
				issue: parsed.value,
				status: statusValidation.value,
				path: destination,
			},
		};
	});
}

export function appendIssue(
	options: AppendIssueOptions,
): Result<IssueLocation, MutationError> {
	return withWriteLock(options.projectRoot, () => {
		const target = findIssueById(options);
		if (!target.ok) return target;
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		const updated = serializeIssue({
			frontmatter: {
				...document.value.frontmatter,
				updated_at: utcNow(options.now),
			},
			body: appendToSection(
				target.value.issue.body,
				options.section,
				formatAppendEntry(options.body, options.source, options.now),
			),
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
		return { ok: true, value: { ...target.value, issue: parsed.value } };
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

function parseIssueDocument(
	markdown: string,
): Result<
	{ frontmatter: IssueFrontmatter; issue: ParsedIssue },
	IssueParseError
> {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
	if (!frontmatter) {
		return {
			ok: false,
			error: {
				kind: "missing_frontmatter",
				message: "Issue Markdown must start with YAML frontmatter",
			},
		};
	}

	const frontmatterSource = frontmatter[1] ?? "";
	let rawFrontmatter: unknown;
	try {
		rawFrontmatter = parse(frontmatterSource);
	} catch (error) {
		return invalidFrontmatterResult(
			error instanceof Error ? error.message : String(error),
		);
	}

	const parsedFrontmatter = frontmatterSchema.safeParse(rawFrontmatter);
	if (!parsedFrontmatter.success) {
		return invalidFrontmatterResult(
			parsedFrontmatter.error.issues.map(formatZodIssue).join("; "),
		);
	}

	const errors: string[] = [];
	let issueId: IssueId | undefined;
	const id = parseIssueId(parsedFrontmatter.data.id);
	if (id.ok) issueId = id.value;
	else errors.push(id.error.message);

	const labels: LabelId[] = [];
	for (const rawLabel of parsedFrontmatter.data.labels) {
		const label = parseLabelId(rawLabel);
		if (label.ok) labels.push(label.value);
		else errors.push(label.error.message);
	}

	let createdAt: UtcTimestamp | undefined;
	const parsedCreatedAt = parseUtcTimestamp(parsedFrontmatter.data.created_at);
	if (parsedCreatedAt.ok) createdAt = parsedCreatedAt.value;
	else errors.push(`created_at: ${parsedCreatedAt.error.message}`);

	let updatedAt: UtcTimestamp | undefined;
	const parsedUpdatedAt = parseUtcTimestamp(parsedFrontmatter.data.updated_at);
	if (parsedUpdatedAt.ok) updatedAt = parsedUpdatedAt.value;
	else errors.push(`updated_at: ${parsedUpdatedAt.error.message}`);

	if (errors.length > 0 || !issueId || !createdAt || !updatedAt) {
		return invalidFrontmatterResult(errors.join("; "));
	}

	return {
		ok: true,
		value: {
			frontmatter: parsedFrontmatter.data,
			issue: {
				id: issueId,
				title: parsedFrontmatter.data.title,
				labels,
				createdAt,
				updatedAt,
				body: markdown.slice(frontmatter[0].length),
			},
		},
	};
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

function serializeIssue(input: {
	frontmatter: IssueFrontmatter;
	body: string;
}): string {
	return `---\n${stringify(input.frontmatter).trim()}\n---\n${input.body.startsWith("\n") ? "" : "\n"}${input.body}`;
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

function utcNow(now?: () => Date): string {
	return (now?.() ?? new Date()).toISOString().replace(".000Z", "Z");
}

function lockPath(projectRoot: string): string {
	return join(projectRoot, ".mikan", ".state", "write.lock");
}

function invalidFrontmatter<T>(message: string): Result<T, IssueParseError> {
	return invalidFrontmatterResult(message);
}

function invalidFrontmatterResult<T>(
	message: string,
): Result<T, IssueParseError> {
	return {
		ok: false,
		error: {
			kind: "invalid_frontmatter",
			message,
		},
	};
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
	return `${path}${issue.message}`;
}
