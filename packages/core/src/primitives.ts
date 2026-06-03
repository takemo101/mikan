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

const issueIdPattern = /^[A-Z][A-Z0-9]*-\d{3,}$/;
const statusOrLabelPattern = /^[a-z][a-z0-9-]*$/;
const projectKeyPattern = /^[A-Z][A-Z0-9]*$/;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

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

export function invalidFrontmatter<T>(
	message: string,
): Result<T, IssueParseError> {
	return invalidFrontmatterResult(message);
}

export function invalidFrontmatterResult<T>(
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
