import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppendableSection, AppendResponse } from "../append-api.ts";
import { BOARD_QUERY_KEY } from "./board-query.ts";
import { ISSUE_DETAIL_QUERY_KEY } from "./issue-detail-query.ts";

// TanStack Query mutation for appending Reports/Notes from the detail modal.
//
// There is no optimistic update: the mutation posts to the append endpoint and,
// only on a successful write, invalidates the Board query and the selected
// Issue's detail query so both refetch the persisted state. App-level error
// envelopes (`ok: false`) resolve normally and are surfaced as form-near errors
// by the caller; they do not invalidate, so a failed append leaves Board/detail
// state untouched.

export type AppendVariables = {
	section: AppendableSection;
	body: string;
};

export async function postAppend(
	id: string,
	variables: AppendVariables,
): Promise<AppendResponse> {
	const response = await fetch(`/api/issues/${encodeURIComponent(id)}/append`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify(variables),
	});
	return (await response.json()) as AppendResponse;
}

export function useAppendMutation(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (variables: AppendVariables) => postAppend(id, variables),
		onSuccess: (result) => {
			if (!result.ok) return;
			queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
			queryClient.invalidateQueries({
				queryKey: [ISSUE_DETAIL_QUERY_KEY, id],
			});
		},
	});
}
