import { findIssueById, type MutationError, updateIssue } from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";
import {
	type IssueDetailResponse,
	loadIssueDetailResponse,
} from "./issue-api.ts";

// Label update write API for `POST /api/issues/:id/labels`.
//
// This is the Browser's detail-modal Label editor endpoint. It only ever sets
// config-defined ("known") Labels chosen in the popover; free-form Label
// creation is out of scope. Any config-unknown Labels already on the Issue are
// preserved exactly, kept in their original order and placed after the selected
// known Labels, so editing Labels in Browser never silently drops Labels that an
// older config or another tool wrote.
//
// The endpoint validates the requested selection up front (all selected Labels
// must be config-known), reloads the current project config from disk for the
// mutation, then delegates to core `updateIssue` with `preserveUnknownLabels` so
// the same atomic, lock-guarded frontmatter write applies as for the CLI, MCP,
// and TUI. Only frontmatter Labels change: no Status Log, Report, or Note entry
// is written, and no GitHub Mirror is pushed.
//
// Errors flow back through the shared `{ ok: false, error: { code, message } }`
// envelope with user-fixable codes preserved and anything unexpected mapped to
// `internal_error`. On success the response carries the freshly reloaded Issue
// detail payload; the client never treats it as an optimistic update and instead
// invalidates/refetches Board and detail.

export type LabelsInput = {
	labels?: unknown;
};

// The labels response reuses the Issue detail envelope: a successful update
// returns the updated Issue detail, a failure returns the shared error envelope.
export type LabelsResponse = IssueDetailResponse;

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

export function updateLabelsResponse(
	cwd: string,
	id: string,
	input: LabelsInput,
): LabelsResponse {
	if (!isStringArray(input.labels)) {
		return {
			ok: false,
			error: {
				code: "invalid_request",
				message: "Label update requires a `labels` array of Label ids.",
			},
		};
	}
	const requested = input.labels;

	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const config = loaded.value.config;
	const projectRoot = loaded.value.projectRoot;

	// Config-known Label ids in config order; used both to validate the selection
	// and to canonically order the saved known Labels.
	const configLabelIds = config.labels.map((label) => label.id);
	const knownLabelIds = new Set(configLabelIds);
	const requestedSet = new Set(requested);

	// Every selected Label must be config-known: the popover only offers known
	// Labels, and free-form creation is out of scope.
	for (const label of requested) {
		if (!knownLabelIds.has(label)) {
			return {
				ok: false,
				error: {
					code: "unknown_label",
					message: `Unknown label: ${label}`,
				},
			};
		}
	}

	// Locate the Issue to read its existing Labels in original order so we can
	// preserve any config-unknown Labels exactly. A missing/traversal id fails
	// here without any write.
	const located = findIssueById({ projectRoot, config, id });
	if (!located.ok) {
		return { ok: false, error: mapLabelsError(located.error) };
	}
	const existingLabels = located.value.issue.labels.map(String);
	const preservedUnknown = existingLabels.filter(
		(label) => !knownLabelIds.has(label),
	);

	// Selected known Labels in config order, then preserved unknown Labels in
	// their original order.
	const selectedKnown = configLabelIds.filter((label) =>
		requestedSet.has(label),
	);
	const nextLabels = [...selectedKnown, ...preservedUnknown];

	const updated = updateIssue({
		projectRoot,
		config,
		id,
		labels: nextLabels,
		preserveUnknownLabels: true,
	});
	if (!updated.ok) {
		return { ok: false, error: mapLabelsError(updated.error) };
	}
	// Reload the persisted Issue from disk so the response reflects the real
	// post-update state rather than any in-memory projection.
	return loadIssueDetailResponse(projectRoot, id);
}

// Map the core mutation failure to a user-facing code. Missing/malformed Issues
// and an unknown Label are user-fixable; a held write lock is transient; anything
// unexpected collapses to a generic internal_error.
function mapLabelsError(error: MutationError): ApiError {
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
