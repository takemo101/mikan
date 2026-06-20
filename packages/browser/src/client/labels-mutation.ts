import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LabelsResponse } from "../labels-api.ts";
import { BOARD_QUERY_KEY } from "./board-query.ts";
import { ISSUE_DETAIL_QUERY_KEY } from "./issue-detail-query.ts";

// TanStack Query mutation for editing config-defined Labels from the detail
// modal's Label popover.
//
// There is no optimistic update: the mutation posts the selected known Label ids
// to the labels endpoint and, only on a successful write, invalidates the Board
// query and the selected Issue's detail query so both refetch the persisted
// state. App-level error envelopes (`ok: false`) resolve normally and are
// surfaced inside the popover by the caller; they do not invalidate, so a failed
// save leaves Board/detail state untouched.

export type LabelsVariables = {
	labels: string[];
};

export async function postLabels(
	id: string,
	variables: LabelsVariables,
): Promise<LabelsResponse> {
	const response = await fetch(`/api/issues/${encodeURIComponent(id)}/labels`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify(variables),
	});
	return (await response.json()) as LabelsResponse;
}

export function useLabelsMutation(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (variables: LabelsVariables) => postLabels(id, variables),
		onSuccess: (result) => {
			if (!result.ok) return;
			queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
			queryClient.invalidateQueries({
				queryKey: [ISSUE_DETAIL_QUERY_KEY, id],
			});
		},
	});
}
