import { parse } from "yaml";
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
			id: issueId,
			title: parsedFrontmatter.data.title,
			labels,
			createdAt,
			updatedAt,
			body: markdown.slice(frontmatter[0].length),
		},
	};
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
