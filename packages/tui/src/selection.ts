import type { TuiModel } from "./model.ts";

export type TuiSelection = {
	columnIndex: number;
	cardIndex: number;
	detailOpen: boolean;
	moveOpen?: boolean;
	moveTargetIndex?: number;
	noteOpen?: boolean;
	noteDraft?: string;
	labelOpen?: boolean;
	labelFocusIndex?: number;
	labelDraftIds?: string[];
	archiveOpen?: boolean;
	githubConfirmOpen?: boolean;
	githubBusy?: boolean;
	warningsOpen?: boolean;
	helpOpen?: boolean;
	repositoryFilterOpen?: boolean;
	repositoryFilterFocusIndex?: number;
	repositoryFilter?: string;
	detailScrollOffset?: number;
	detailScrollMax?: number;
	message?: string;
};

export type MoveTarget = {
	id: string;
	title: string;
};

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function clampSelection(
	model: TuiModel,
	selection: TuiSelection,
): TuiSelection {
	const columnIndex = clamp(
		selection.columnIndex,
		0,
		Math.max(0, model.columns.length - 1),
	);
	const maxCardIndex = Math.max(
		0,
		(model.columns[columnIndex]?.cards.length ?? 1) - 1,
	);
	return {
		...selection,
		columnIndex,
		cardIndex: clamp(selection.cardIndex, 0, maxCardIndex),
	};
}

export function findSelectionByCardId(
	model: TuiModel,
	cardId: string,
): TuiSelection | undefined {
	for (const [columnIndex, column] of model.columns.entries()) {
		const cardIndex = column.cards.findIndex((card) => card.id === cardId);
		if (cardIndex !== -1) {
			return { columnIndex, cardIndex, detailOpen: false };
		}
	}
	return undefined;
}

/**
 * Workspace-only Repository filter. Returns a model whose Columns keep only Cards
 * whose primary `repository` matches `filter`. `affects` never widens the result.
 * Empty Columns are preserved so the board layout stays stable. A falsy filter or
 * a non-workspace model (no configured Repositories) returns the model unchanged.
 */
export function applyRepositoryFilter(
	model: TuiModel,
	filter?: string,
): TuiModel {
	if (!filter || !model.repositories || model.repositories.length === 0) {
		return model;
	}
	return {
		...model,
		columns: model.columns.map((column) => ({
			...column,
			cards: column.cards.filter((card) => card.repository === filter),
		})),
	};
}
