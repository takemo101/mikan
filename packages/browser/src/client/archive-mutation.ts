import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ArchiveResponse } from "../archive-api.ts";
import { BOARD_QUERY_KEY } from "./board-query.ts";
import { ISSUE_DETAIL_QUERY_KEY } from "./issue-detail-query.ts";

// TanStack Query mutation backing the detail-modal Archive action.
//
// There is no optimistic update: confirming the Archive modal posts to the
// archive endpoint and, only on a successful write, invalidates the Board query
// and the archived Issue's detail query so both refetch the persisted state. An
// app-level error envelope (`ok: false`) resolves normally and is surfaced in the
// confirmation modal by the caller; it does not invalidate, so a failed archive
// leaves Board/detail state — and the open detail's filter/selection — untouched.

export async function postArchive(id: string): Promise<ArchiveResponse> {
	const response = await fetch(
		`/api/issues/${encodeURIComponent(id)}/archive`,
		{
			method: "POST",
			headers: { accept: "application/json" },
		},
	);
	return (await response.json()) as ArchiveResponse;
}

export function useArchiveMutation(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => postArchive(id),
		onSuccess: (result) => {
			if (!result.ok) return;
			queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
			queryClient.invalidateQueries({
				queryKey: [ISSUE_DETAIL_QUERY_KEY, id],
			});
		},
	});
}
