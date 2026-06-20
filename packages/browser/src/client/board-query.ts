import { QueryClient, useQuery } from "@tanstack/react-query";
import type { BoardApiResponse } from "../board-api.ts";

// TanStack Query wiring for the Browser board.
//
// The Browser has no watcher or daemon: it short-polls `GET /api/board` every
// few seconds so changes made by the CLI, MCP, TUI, or agents become visible
// without a manual reload. Later Issues add append/move mutations that
// invalidate `BOARD_QUERY_KEY` after a successful write.

export const BOARD_QUERY_KEY = ["board"] as const;

// Poll interval for the board. Kept short enough to feel live, long enough to
// avoid hammering the local server.
export const BOARD_POLL_INTERVAL_MS = 4000;

export function createBrowserQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				retry: false,
				staleTime: 0,
			},
		},
	});
}

export async function fetchBoard(): Promise<BoardApiResponse> {
	const response = await fetch("/api/board", {
		headers: { accept: "application/json" },
	});
	return (await response.json()) as BoardApiResponse;
}

export function useBoardQuery() {
	return useQuery({
		queryKey: BOARD_QUERY_KEY,
		queryFn: fetchBoard,
		refetchInterval: BOARD_POLL_INTERVAL_MS,
	});
}
