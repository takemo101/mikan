import {
	type GhApiRunner,
	type GitHubMirrorError,
	mirrorIssueToGitHub,
} from "@mikan/github";
import { loadProjectConfig } from "@mikan/project-config";
import { type ApiError, mapConfigError } from "./config-error.ts";
import {
	type IssueDetailResponse,
	loadIssueDetailResponse,
} from "./issue-api.ts";

// GitHub Mirror write API for `POST /api/issues/:id/github-mirror`.
//
// This is the Browser's explicit GitHub Mirror create/update endpoint. It is a
// thin adapter: it reloads the current project config from disk and delegates to
// core `mirrorIssueToGitHub`, so target resolution (single-project `github.repo`
// or workspace `repository` -> `repositories[].github.repo`, never Labels or
// `affects`), GitHub body/label construction, the existing-Mirror repo identity
// rule, and the `github_issue` frontmatter write all stay in `@mikan/github` and
// are never duplicated here. The call is synchronous — one request mirrors one
// Issue — with no background queue, retry, or auto-push.
//
// The underlying gh API caller is injectable as `runner` so tests exercise the
// real Mirror behavior against a fake GitHub without shelling out to `gh`; in
// production it defaults to core's gh-CLI runner. There is no `--repo` override:
// the Browser never retargets a Mirror.
//
// Errors flow back through the shared `{ ok: false, error: { code, message } }`
// envelope. The core Mirror error kind is preserved as the code so config,
// missing-repository, malformed-Issue, and GitHub/`gh` failures stay legible.
// On success the response carries the freshly reloaded Issue detail (now with
// `github_issue` frontmatter); the client never treats it as an optimistic
// update and instead invalidates/refetches Board and detail.

export type GitHubMirrorOptions = {
	// Injectable gh API caller. Tests pass a fake runner; production omits it so
	// core uses its default `gh` CLI runner.
	runner?: GhApiRunner;
	// Overridable clock used for the `last_mirrored_at` frontmatter timestamp.
	now?: () => Date;
};

// The Mirror response reuses the Issue detail envelope: a successful Mirror
// returns the updated Issue detail (reloaded with its new `github_issue`
// frontmatter), a failure returns the shared error envelope.
export type GitHubMirrorResponse = IssueDetailResponse;

export async function mirrorIssueToGitHubResponse(
	cwd: string,
	id: string,
	options: GitHubMirrorOptions = {},
): Promise<GitHubMirrorResponse> {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) {
		return { ok: false, error: mapConfigError(loaded.error) };
	}
	const mirrored = await mirrorIssueToGitHub({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		runner: options.runner,
		now: options.now,
	});
	if (!mirrored.ok) {
		return { ok: false, error: mapMirrorError(mirrored.error) };
	}
	// Reload the persisted Issue from disk so the response reflects the real
	// post-Mirror state (now carrying `github_issue`) rather than a projection.
	return loadIssueDetailResponse(loaded.value.projectRoot, id);
}

// Map the core Mirror failure to a user-facing code. The core error kind is
// already a stable, user-meaningful discriminator (missing/unknown config,
// missing Issue, malformed Issue, and gh/GitHub failures), so it is preserved as
// the code and the descriptive message is passed through unchanged.
function mapMirrorError(error: GitHubMirrorError): ApiError {
	return { code: error.kind, message: error.message };
}
