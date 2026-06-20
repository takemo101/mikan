import { appendIssue, type MutationError } from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";
import {
	type IssueDetailResponse,
	loadIssueDetailResponse,
} from "./issue-api.ts";

// Append write API for `POST /api/issues/:id/append`.
//
// This is the first Browser write endpoint. It validates the requested section
// and body up front, reloads the current project config from disk for the
// mutation, then delegates to core `appendIssue` so the exact same append
// semantics (timestamped Reports, plain Notes, atomic write under a lock) apply
// as for the CLI, MCP, and TUI. The Browser only exposes the human-facing
// Reports/Notes sections; any other section is rejected before touching core, so
// the endpoint can never append to Status Log or invent new sections.
//
// Errors flow back through the shared `{ ok: false, error: { code, message } }`
// envelope with user-fixable codes where possible. On success the response
// carries the freshly reloaded Issue detail payload, but the client never treats
// it as an optimistic update: it invalidates and refetches Board and detail.

export const APPENDABLE_SECTIONS = ["Reports", "Notes"] as const;
export type AppendableSection = (typeof APPENDABLE_SECTIONS)[number];

// Source recorded on Browser-originated appends, matching the TUI's
// `mikan-tui`/CLI conventions so the provenance line reads `mikan-browser`.
export const BROWSER_APPEND_SOURCE = "mikan-browser";

export type AppendInput = {
	section?: unknown;
	body?: unknown;
};

// The append response reuses the Issue detail envelope: a successful append
// returns the updated Issue detail, a failure returns the shared error envelope.
export type AppendResponse = IssueDetailResponse;

function isAppendableSection(value: unknown): value is AppendableSection {
	return (
		typeof value === "string" &&
		APPENDABLE_SECTIONS.includes(value as AppendableSection)
	);
}

export function appendIssueResponse(
	cwd: string,
	id: string,
	input: AppendInput,
): AppendResponse {
	if (!isAppendableSection(input.section)) {
		const requested =
			typeof input.section === "string" ? input.section : "(missing)";
		return {
			ok: false,
			error: {
				code: "unsupported_section",
				message: `Unsupported append section: ${requested}. Use Reports or Notes.`,
			},
		};
	}
	const section = input.section;
	const body = typeof input.body === "string" ? input.body : "";
	if (body.trim().length === 0) {
		return {
			ok: false,
			error: {
				code: "empty_append",
				message: `${section} text cannot be empty.`,
			},
		};
	}

	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const appended = appendIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		section,
		body,
		source: BROWSER_APPEND_SOURCE,
	});
	if (!appended.ok) {
		return { ok: false, error: mapAppendError(appended.error) };
	}
	// Reload the persisted Issue from disk so the response reflects the real
	// post-append state rather than any in-memory projection.
	return loadIssueDetailResponse(loaded.value.projectRoot, id);
}

// Map the core mutation failure to a user-facing code. Missing/malformed Issues
// and a held write lock are user-fixable; anything unexpected collapses to a
// generic internal_error.
function mapAppendError(error: MutationError): ApiError {
	switch (error.kind) {
		case "not_found":
			return { code: "issue_not_found", message: error.message };
		case "malformed_issue":
			return { code: "malformed_issue", message: error.message };
		case "duplicate_issue_id":
			return { code: "duplicate_issue_id", message: error.message };
		case "unknown_label":
			return { code: "unknown_label", message: error.message };
		case "lock_held":
			return { code: "lock_held", message: error.message };
		default:
			return { code: "internal_error", message: error.message };
	}
}
