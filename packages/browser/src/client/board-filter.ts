import type { BoardViewModel } from "@mikan/core";

// Repository filtering for the Browser board.
//
// By default a filter narrows Columns to Cards whose primary `repository`
// matches (mirroring the TUI's `applyRepositoryFilter`); affected Repositories
// (`affects`) never widen the result. When `includeAffected` is set, the scope
// expands to also include Cards whose `affects` contains the selected
// Repository — but `affects` remains display/filter-only and never influences
// GitHub Mirror targets. Columns are always preserved so empty Columns still
// render their empty state, and an unknown/no-match filter simply yields empty
// Columns rather than hiding lanes.
export function filterBoardByRepository(
	board: BoardViewModel,
	repository: string | undefined,
	includeAffected = false,
): BoardViewModel {
	if (!repository || !board.repositories || board.repositories.length === 0) {
		return board;
	}
	return {
		...board,
		columns: board.columns.map((column) => ({
			...column,
			cards: column.cards.filter(
				(card) =>
					card.repository === repository ||
					(includeAffected && (card.affects?.includes(repository) ?? false)),
			),
		})),
	};
}

export function countBoardCards(board: BoardViewModel): number {
	return board.columns.reduce(
		(total, column) => total + column.cards.length,
		0,
	);
}
