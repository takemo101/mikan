import type { BoardViewModel } from "@mikan/core";

// Primary-Repository filtering for the Browser board.
//
// Mirrors the TUI's `applyRepositoryFilter`: a filter narrows Columns to Cards
// whose primary `repository` matches. Affected Repositories (`affects`) never
// widen the result. Columns are always preserved so empty Columns still render
// their empty state, and an unknown/no-match filter simply yields empty
// Columns rather than hiding lanes.
export function filterBoardByRepository(
	board: BoardViewModel,
	repository: string | undefined,
): BoardViewModel {
	if (!repository || !board.repositories || board.repositories.length === 0) {
		return board;
	}
	return {
		...board,
		columns: board.columns.map((column) => ({
			...column,
			cards: column.cards.filter((card) => card.repository === repository),
		})),
	};
}

export function countBoardCards(board: BoardViewModel): number {
	return board.columns.reduce(
		(total, column) => total + column.cards.length,
		0,
	);
}
