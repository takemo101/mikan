import { type MutationError, moveIssue } from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";
import {
	type IssueDetailResponse,
	loadIssueDetailResponse,
} from "./issue-api.ts";

// Status move write API for `POST /api/issues/:id/move`.
//
// This is the Browser's second write endpoint (after append, MIK-154) and backs
// board drag-and-drop. It validates the requested target Status up front,
// reloads the current project config from disk for the mutation, then delegates
// to core `moveIssue` so the exact same move semantics — Status validation, the
// destination-collision guard, the atomic write, the file rename into the new
// Status directory, and the automatic Status Log entry — apply as for the CLI,
// MCP, and TUI. The move always writes the fixed Status Log message
// `Moved via mikan browser` so the provenance of a browser-driven move is clear.
//
// core locates the Issue file before touching disk, so an unknown or traversal
// ID fails as `issue_not_found` without ever writing outside the project root.
// Errors flow back through the shared `{ ok: false, error: { code, message } }`
// envelope with user-fixable codes (unknown Issue, unknown Status, …) preserved
// and anything unexpected mapped to `internal_error`. On success the response
// carries the freshly reloaded Issue detail payload; the client never treats it
// as an optimistic update and instead invalidates/refetches Board and detail.

// Exact Status Log body written for every browser-originated move. Mirrors the
// TUI's `Moved via TUI` convention so a move's origin is legible in the log.
export const BROWSER_MOVE_LOG = "Moved via mikan browser";

export type MoveInput = {
	status?: unknown;
};

// The move response reuses the Issue detail envelope: a successful move returns
// the updated Issue detail (reloaded from its new Status directory), a failure
// returns the shared error envelope.
export type MoveResponse = IssueDetailResponse;

export function moveIssueResponse(
	cwd: string,
	id: string,
	input: MoveInput,
): MoveResponse {
	if (typeof input.status !== "string" || input.status.trim().length === 0) {
		return {
			ok: false,
			error: {
				code: "invalid_request",
				message: "Move requires a target Status.",
			},
		};
	}
	const status = input.status;

	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const moved = moveIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		status,
		log: BROWSER_MOVE_LOG,
	});
	if (!moved.ok) {
		return { ok: false, error: mapMoveError(moved.error) };
	}
	// Reload the persisted Issue from disk (now under its new Status directory) so
	// the response reflects the real post-move state rather than any projection.
	return loadIssueDetailResponse(loaded.value.projectRoot, id);
}

// Map the core mutation failure to a user-facing code. An unknown target Status
// and a missing/malformed Issue are user-fixable; a held write lock and a
// destination collision are transient/fixable; anything unexpected collapses to
// a generic internal_error.
function mapMoveError(error: MutationError): ApiError {
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
