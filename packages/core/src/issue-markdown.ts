import { parse, stringify } from "yaml";
import { z } from "zod";
import {
	type IssueId,
	type IssueParseError,
	invalidFrontmatterResult,
	type LabelId,
	parseIssueId,
	parseLabelId,
	parseUtcTimestamp,
	type Result,
	type UtcTimestamp,
} from "./primitives.ts";

export type GitHubIssueReference = {
	repo: string;
	number: number;
	url: string;
	lastMirroredAt: UtcTimestamp;
};

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export type IssueMetadata = Record<string, JsonValue>;

export type ParsedIssue = {
	id: IssueId;
	title: string;
	labels: LabelId[];
	dependencies: IssueId[];
	metadata: IssueMetadata;
	githubIssue?: GitHubIssueReference;
	createdAt: UtcTimestamp;
	updatedAt: UtcTimestamp;
	body: string;
};

const githubRepoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const metadataMaxBytes = 16 * 1024;
const metadataMaxDepth = 8;

const frontmatterSchema = z
	.object({
		id: z.string().min(1),
		title: z.string().min(1),
		labels: z.array(z.string()).optional().default([]),
		depends_on: z.array(z.string()).optional().default([]),
		metadata: z.unknown().optional(),
		created_at: z.string().min(1),
		updated_at: z.string().min(1),
		github_issue: z.unknown().optional(),
	})
	.passthrough();

export type IssueFrontmatter = z.infer<typeof frontmatterSchema>;

export function parseIssueMarkdown(
	markdown: string,
): Result<ParsedIssue, IssueParseError> {
	const parsed = parseIssueDocument(markdown);
	if (!parsed.ok) return parsed;
	return { ok: true, value: parsed.value.issue };
}

export function parseIssueDocument(
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

	const dependencies: IssueId[] = [];
	for (const rawDependency of parsedFrontmatter.data.depends_on) {
		const dependency = parseIssueId(rawDependency);
		if (dependency.ok) dependencies.push(dependency.value);
		else errors.push(`depends_on: ${dependency.error.message}`);
	}

	let metadata: IssueMetadata | undefined;
	const parsedMetadata = parseIssueMetadata(parsedFrontmatter.data.metadata);
	if (parsedMetadata.ok) metadata = parsedMetadata.value;
	else errors.push(...parsedMetadata.error);

	let createdAt: UtcTimestamp | undefined;
	const parsedCreatedAt = parseUtcTimestamp(parsedFrontmatter.data.created_at);
	if (parsedCreatedAt.ok) createdAt = parsedCreatedAt.value;
	else errors.push(`created_at: ${parsedCreatedAt.error.message}`);

	let updatedAt: UtcTimestamp | undefined;
	const parsedUpdatedAt = parseUtcTimestamp(parsedFrontmatter.data.updated_at);
	if (parsedUpdatedAt.ok) updatedAt = parsedUpdatedAt.value;
	else errors.push(`updated_at: ${parsedUpdatedAt.error.message}`);

	let githubIssue: GitHubIssueReference | undefined;
	if (parsedFrontmatter.data.github_issue !== undefined) {
		const parsedGitHubIssue = parseGitHubIssueReference(
			parsedFrontmatter.data.github_issue,
		);
		if (parsedGitHubIssue.ok) githubIssue = parsedGitHubIssue.value;
		else errors.push(...parsedGitHubIssue.error);
	}

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
				dependencies,
				metadata: metadata ?? {},
				...(githubIssue ? { githubIssue } : {}),
				createdAt,
				updatedAt,
				body: markdown.slice(frontmatter[0].length),
			},
		},
	};
}

export function serializeIssue(input: {
	frontmatter: IssueFrontmatter;
	body: string;
}): string {
	return `---\n${stringify(input.frontmatter).trim()}\n---\n${input.body.startsWith("\n") ? "" : "\n"}${input.body}`;
}

export function parseIssueMetadata(
	input: unknown,
): Result<IssueMetadata, string[]> {
	if (input === undefined) return { ok: true, value: {} };
	if (!isPlainObject(input)) {
		return { ok: false, error: ["metadata must be an object"] };
	}
	const errors: string[] = [];
	validateJsonValue(input, "metadata", 0, errors);
	if (errors.length > 0) return { ok: false, error: errors };
	const encoded = JSON.stringify(input);
	if (new TextEncoder().encode(encoded).length > metadataMaxBytes) {
		return {
			ok: false,
			error: [`metadata must not exceed ${metadataMaxBytes} bytes`],
		};
	}
	return { ok: true, value: input as IssueMetadata };
}

function validateJsonValue(
	value: unknown,
	path: string,
	depth: number,
	errors: string[],
): void {
	if (depth > metadataMaxDepth) {
		errors.push(`metadata must not exceed depth ${metadataMaxDepth}`);
		return;
	}
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			errors.push(`${path} must be JSON-compatible`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			validateJsonValue(item, `${path}.${index}`, depth + 1, errors);
		}
		return;
	}
	if (isPlainObject(value)) {
		for (const [key, item] of Object.entries(value)) {
			validateJsonValue(item, `${path}.${key}`, depth + 1, errors);
		}
		return;
	}
	errors.push(`${path} must be JSON-compatible`);
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
	return (
		!!input &&
		typeof input === "object" &&
		!Array.isArray(input) &&
		(Object.getPrototypeOf(input) === Object.prototype ||
			Object.getPrototypeOf(input) === null)
	);
}

function parseGitHubIssueReference(
	input: unknown,
): Result<GitHubIssueReference, string[]> {
	const errors: string[] = [];
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return {
			ok: false,
			error: ["github_issue must be an object"],
		};
	}
	const raw = input as Record<string, unknown>;
	const repo = typeof raw.repo === "string" ? raw.repo : "";
	if (!githubRepoPattern.test(repo)) {
		errors.push("github_issue.repo must look like owner/name");
	}
	const number = raw.number;
	if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
		errors.push("github_issue.number must be a positive integer");
	}
	const url = typeof raw.url === "string" ? raw.url : "";
	try {
		new URL(url);
	} catch {
		errors.push("github_issue.url must be a URL");
	}
	const lastMirroredAt =
		typeof raw.last_mirrored_at === "string" ? raw.last_mirrored_at : "";
	const parsedLastMirroredAt = parseUtcTimestamp(lastMirroredAt);
	const lastMirroredAtValue = parsedLastMirroredAt.ok
		? parsedLastMirroredAt.value
		: undefined;
	if (!parsedLastMirroredAt.ok) {
		errors.push(
			`github_issue.last_mirrored_at: ${parsedLastMirroredAt.error.message}`,
		);
	}
	if (errors.length > 0 || !lastMirroredAtValue) {
		return { ok: false, error: errors };
	}
	return {
		ok: true,
		value: {
			repo,
			number: number as number,
			url,
			lastMirroredAt: lastMirroredAtValue,
		},
	};
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
	return `${path}${issue.message}`;
}
