import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GitHubMirrorResponse } from "../github-mirror-api.ts";
import { BOARD_QUERY_KEY } from "./board-query.ts";
import { ISSUE_DETAIL_QUERY_KEY } from "./issue-detail-query.ts";

// TanStack Query mutation backing the detail-modal GitHub Mirror action.
//
// There is no optimistic update: confirming the GitHub Mirror modal posts to the
// github-mirror endpoint and, only on a successful write, invalidates the Board
// query and the mirrored Issue's detail query so both refetch the persisted state
// (the detail now carries `github_issue`). An app-level error envelope
// (`ok: false`) resolves normally and is surfaced in the confirmation modal by
// the caller; it does not invalidate, so a failed Mirror leaves Board/detail
// state — and the open detail's filter/selection — untouched.

export async function postGitHubMirror(
	id: string,
): Promise<GitHubMirrorResponse> {
	const response = await fetch(
		`/api/issues/${encodeURIComponent(id)}/github-mirror`,
		{
			method: "POST",
			headers: { accept: "application/json" },
		},
	);
	return (await response.json()) as GitHubMirrorResponse;
}

export function useGitHubMirrorMutation(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => postGitHubMirror(id),
		onSuccess: (result) => {
			if (!result.ok) return;
			queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
			queryClient.invalidateQueries({
				queryKey: [ISSUE_DETAIL_QUERY_KEY, id],
			});
		},
	});
}
