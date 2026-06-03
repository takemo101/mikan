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

export type ParsedIssue = {
	id: IssueId;
	title: string;
	labels: LabelId[];
	dependencies: IssueId[];
	createdAt: UtcTimestamp;
	updatedAt: UtcTimestamp;
	body: string;
};

const frontmatterSchema = z
	.object({
		id: z.string().min(1),
		title: z.string().min(1),
		labels: z.array(z.string()).optional().default([]),
		depends_on: z.array(z.string()).optional().default([]),
		created_at: z.string().min(1),
		updated_at: z.string().min(1),
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
				dependencies,
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

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
	return `${path}${issue.message}`;
}
