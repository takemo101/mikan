import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { ApiError } from "../config-error.ts";
import type { MoveResponse } from "../move-api.ts";
import type { MoveCommand } from "./board-dnd.ts";
import { BOARD_QUERY_KEY } from "./board-query.ts";
import { ISSUE_DETAIL_QUERY_KEY } from "./issue-detail-query.ts";

// TanStack Query mutation backing board drag-and-drop Status moves.
//
// There is no optimistic update: a drop posts to the move endpoint and, only on
// a successful write, invalidates the Board query and the moved Issue's detail
// query so both refetch the persisted state. A failed move — whether an app-level
// error envelope (`ok: false`) or a transport error — does not invalidate, so the
// board and any open detail keep their last good state; the failure is surfaced as
// a single board-level banner error. This hook owns only that banner state; the
// selected Issue and Repository filter live in URL state elsewhere and are never
// touched here, so a failed move preserves them.

export type MoveVariables = MoveCommand;

const NETWORK_ERROR: ApiError = {
	code: "network_error",
	message: "Could not reach the move API.",
};

export async function postMove(
	id: string,
	status: string,
): Promise<MoveResponse> {
	const response = await fetch(`/api/issues/${encodeURIComponent(id)}/move`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
		},
		body: JSON.stringify({ status }),
	});
	return (await response.json()) as MoveResponse;
}

export type BoardMove = {
	moveIssue: (command: MoveCommand) => void;
	moveError: ApiError | undefined;
	clearMoveError: () => void;
	isMoving: boolean;
};

export function useBoardMove(): BoardMove {
	const queryClient = useQueryClient();
	const [moveError, setMoveError] = useState<ApiError | undefined>(undefined);

	const mutation = useMutation({
		mutationFn: (variables: MoveVariables) =>
			postMove(variables.id, variables.status),
		onSuccess: (result, variables) => {
			if (!result.ok) {
				setMoveError(result.error);
				return;
			}
			setMoveError(undefined);
			queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
			queryClient.invalidateQueries({
				queryKey: [ISSUE_DETAIL_QUERY_KEY, variables.id],
			});
		},
		onError: () => setMoveError(NETWORK_ERROR),
	});

	const moveIssue = useCallback(
		(command: MoveCommand) => mutation.mutate(command),
		[mutation],
	);
	const clearMoveError = useCallback(() => setMoveError(undefined), []);

	return {
		moveIssue,
		moveError,
		clearMoveError,
		isMoving: mutation.isPending,
	};
}
