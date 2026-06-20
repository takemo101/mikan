import { type MutationError, moveIssue } from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";
import {
	type IssueDetailResponse,
	loadIssueDetailResponse,
} from "./issue-api.ts";

// Archive write API for `POST /api/issues/:id/archive`.
//
// Archiving is a thin specialization of a Status move: it reloads the current
// project config from disk and delegates to core `moveIssue` with the fixed
// `archived` Status, so the exact same move semantics — Status validation, the
// destination-collision guard, the atomic write, the file rename into the
// archived directory, and the automatic Status Log entry — apply as for the CLI,
// MCP, and TUI. Every browser-driven archive writes the fixed Status Log body
// `Archived via mikan browser` so the provenance is legible in the log. The
// Markdown file is moved, never deleted, and there is no unarchive surface here.
//
// core locates the Issue file before touching disk, so an unknown or traversal
// ID fails as `issue_not_found` without ever writing outside the project root.
// Errors flow back through the shared `{ ok: false, error: { code, message } }`
// envelope with user-fixable codes preserved and anything unexpected mapped to
// `internal_error`. On success the response carries the freshly reloaded Issue
// detail payload; the client never treats it as an optimistic update and instead
// invalidates/refetches Board and detail.

// Fixed Status the Browser archives Issues into. Defined in the default config
// board columns alongside the workflow statuses.
export const ARCHIVED_STATUS = "archived";

// Exact Status Log body written for every browser-originated archive. Mirrors
// the `Moved via mikan browser` convention so an archive's origin is legible.
export const BROWSER_ARCHIVE_LOG = "Archived via mikan browser";

// The archive response reuses the Issue detail envelope: a successful archive
// returns the updated Issue detail (reloaded from the archived directory), a
// failure returns the shared error envelope.
export type ArchiveResponse = IssueDetailResponse;

export function archiveIssueResponse(cwd: string, id: string): ArchiveResponse {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const moved = moveIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		status: ARCHIVED_STATUS,
		log: BROWSER_ARCHIVE_LOG,
	});
	if (!moved.ok) {
		return { ok: false, error: mapArchiveError(moved.error) };
	}
	// Reload the persisted Issue from disk (now under the archived directory) so
	// the response reflects the real post-archive state rather than a projection.
	return loadIssueDetailResponse(loaded.value.projectRoot, id);
}

// Map the core mutation failure to a user-facing code. A missing/malformed Issue
// is user-fixable; a configuration missing the archived Status surfaces as
// unknown_status; a held write lock and a destination collision are
// transient/fixable; anything unexpected collapses to a generic internal_error.
function mapArchiveError(error: MutationError): ApiError {
	switch (error.kind) {
		case "not_found":
			return { code: "issue_not_found", message: error.message };
		case "unknown_status":
			return { code: "unknown_status", message: error.message };
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
