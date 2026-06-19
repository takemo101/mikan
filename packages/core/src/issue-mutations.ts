import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	type BoardConfig,
	findIssueById,
	findMaxIssueSequence,
	type IssueLocation,
	type MutationError,
	scanBoard,
} from "./board-scan.ts";
import {
	type IssueFrontmatter,
	type IssueMetadata,
	type ParsedIssue,
	parseIssueDocument,
	parseIssueMarkdown,
	parseIssueMetadata,
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
import { atomicWriteFile, withWriteLock } from "./write-lock.ts";

export type CreateIssueOptions = {
	projectRoot: string;
	config: BoardConfig & { project?: { key?: string } };
	title: string;
	body?: string;
	status?: string;
	labels?: string[];
	dependencies?: string[];
	metadata?: unknown;
	repository?: string;
	affects?: string[];
	now?: () => Date;
};

export type UpdateIssueOptions = {
	projectRoot: string;
	config: BoardConfig;
	id: string;
	title?: string;
	labels?: string[];
	preserveUnknownLabels?: boolean;
	dependencies?: string[];
	metadata?: unknown;
	repository?: string;
	affects?: string[];
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
	const metadataValidation = validateMetadata(
		options.metadata === undefined ? {} : options.metadata,
	);
	if (!metadataValidation.ok) return metadataValidation;
	const repositoryValidation = validateRepository(
		options.config,
		options.repository,
		options.affects,
	);
	if (!repositoryValidation.ok) return repositoryValidation;
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
		const frontmatter: IssueFrontmatter = {
			id,
			title: options.title,
			labels: options.labels ?? [],
			depends_on: dependenciesValidation.value.map(String),
			...(repositoryValidation.value.repository !== undefined
				? { repository: repositoryValidation.value.repository }
				: {}),
			...(repositoryValidation.value.affects &&
			repositoryValidation.value.affects.length > 0
				? { affects: repositoryValidation.value.affects }
				: {}),
			...(options.metadata !== undefined
				? { metadata: metadataValidation.value }
				: {}),
			created_at: now,
			updated_at: now,
		};
		const markdown = serializeIssue({
			frontmatter,
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
		const existingLabels = target.value.issue.labels.map(String);
		const configuredLabelIds = new Set(
			options.config.labels.map((label) => label.id),
		);
		const existingUnknownLabels = new Set(
			existingLabels.filter((label) => !configuredLabelIds.has(label)),
		);
		const labels = options.labels ?? existingLabels;
		const labelsToValidate = options.preserveUnknownLabels
			? labels.filter((label) => !existingUnknownLabels.has(label))
			: labels;
		const labelsValidation = validateLabels(options.config, labelsToValidate);
		if (!labelsValidation.ok) return labelsValidation;
		const dependenciesValidation = options.dependencies
			? validateDependencies(options.dependencies)
			: undefined;
		if (dependenciesValidation && !dependenciesValidation.ok)
			return dependenciesValidation;
		const metadataValidation = Object.hasOwn(options, "metadata")
			? validateMetadata(options.metadata)
			: undefined;
		if (metadataValidation && !metadataValidation.ok) return metadataValidation;
		const document = readIssueDocument(target.value.path);
		if (!document.ok) return document;
		const workspaceMode = isWorkspaceMode(options.config);
		const finalRepository = workspaceMode
			? (options.repository ?? document.value.frontmatter.repository)
			: document.value.frontmatter.repository;
		const finalAffects = workspaceMode
			? (options.affects ?? document.value.frontmatter.affects)
			: document.value.frontmatter.affects;
		const repositoryValidation = validateRepository(
			options.config,
			finalRepository,
			finalAffects,
		);
		if (!repositoryValidation.ok) return repositoryValidation;
		// Reconstruct frontmatter in canonical key order (matching createIssue)
		// rather than mutating after construction, which would append newly added
		// repository/affects keys after created_at/updated_at.
		const {
			id: existingId,
			title: _existingTitle,
			labels: _existingLabels,
			depends_on: existingDependsOn,
			repository: _existingRepository,
			affects: _existingAffects,
			metadata: existingMetadata,
			created_at: existingCreatedAt,
			updated_at: _existingUpdatedAt,
			...extraFrontmatter
		} = document.value.frontmatter;
		const finalRepositoryValue = workspaceMode
			? repositoryValidation.value.repository
			: document.value.frontmatter.repository;
		const finalAffectsValue = workspaceMode
			? repositoryValidation.value.affects
			: document.value.frontmatter.affects;
		const finalMetadata = metadataValidation
			? metadataValidation.value
			: existingMetadata;
		const frontmatter: IssueFrontmatter = {
			id: existingId,
			title: options.title ?? target.value.issue.title,
			labels,
			depends_on: dependenciesValidation
				? dependenciesValidation.value.map(String)
				: existingDependsOn,
			...(finalRepositoryValue !== undefined
				? { repository: finalRepositoryValue }
				: {}),
			...(finalAffectsValue && finalAffectsValue.length > 0
				? { affects: finalAffectsValue }
				: {}),
			...(finalMetadata !== undefined ? { metadata: finalMetadata } : {}),
			created_at: existingCreatedAt,
			updated_at: utcNow(options.now),
			...extraFrontmatter,
		};
		const updated = serializeIssue({
			frontmatter,
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
	const seen = new Set<string>();
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
		if (seen.has(label)) {
			return {
				ok: false,
				error: { kind: "unknown_label", message: `Duplicate Label: ${label}` },
			};
		}
		seen.add(label);
		parsed.push(labelId.value);
	}
	return { ok: true, value: parsed };
}

function isWorkspaceMode(config: BoardConfig): boolean {
	const repositories = config.repositories;
	return repositories !== undefined && repositories.length > 0;
}

function validateRepository(
	config: BoardConfig,
	repository: string | undefined,
	affects: string[] | undefined,
): Result<{ repository?: string; affects?: string[] }, MutationError> {
	if (!isWorkspaceMode(config)) {
		return { ok: true, value: {} };
	}
	const repositoryIds = new Set(
		(config.repositories ?? []).map((entry) => entry.id),
	);
	if (repository === undefined) {
		return {
			ok: false,
			error: {
				kind: "missing_repository",
				message: "Missing repository",
			},
		};
	}
	if (!repositoryIds.has(repository)) {
		return {
			ok: false,
			error: {
				kind: "unknown_repository",
				message: `Unknown repository: ${repository}`,
			},
		};
	}
	const validatedAffects: string[] = [];
	for (const affected of affects ?? []) {
		if (affected === repository) {
			return {
				ok: false,
				error: {
					kind: "affects_includes_primary",
					message: `affects must not contain primary repository: ${affected}`,
				},
			};
		}
		if (!repositoryIds.has(affected)) {
			return {
				ok: false,
				error: {
					kind: "unknown_affects",
					message: `Unknown affected repository: ${affected}`,
				},
			};
		}
		validatedAffects.push(affected);
	}
	return { ok: true, value: { repository, affects: validatedAffects } };
}

function validateMetadata(
	metadata: unknown,
): Result<IssueMetadata, MutationError> {
	const parsed = parseIssueMetadata(metadata);
	if (!parsed.ok) {
		return {
			ok: false,
			error: { kind: "malformed_issue", message: parsed.error.join("; ") },
		};
	}
	return parsed;
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
