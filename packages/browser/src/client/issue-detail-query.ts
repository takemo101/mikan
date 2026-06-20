import { useQuery } from "@tanstack/react-query";
import type { IssueDetailResponse } from "../issue-api.ts";
import { BOARD_POLL_INTERVAL_MS } from "./board-query.ts";

// TanStack Query wiring for the selected Issue's detail payload.
//
// Only fetches while an Issue is selected (the modal is open) and short-polls on
// the same cadence as the board so edits made by the CLI, MCP, TUI, or agents
// stay visible without a manual reload. Later Issues' append/move mutations
// invalidate this query after a successful write.

export const ISSUE_DETAIL_QUERY_KEY = "issue-detail";

export async function fetchIssueDetail(
	id: string,
): Promise<IssueDetailResponse> {
	const response = await fetch(`/api/issues/${encodeURIComponent(id)}`, {
		headers: { accept: "application/json" },
	});
	return (await response.json()) as IssueDetailResponse;
}

export function useIssueDetailQuery(id: string | undefined) {
	return useQuery({
		queryKey: [ISSUE_DETAIL_QUERY_KEY, id],
		queryFn: () => fetchIssueDetail(id as string),
		enabled: id !== undefined,
		refetchInterval: BOARD_POLL_INTERVAL_MS,
	});
}
