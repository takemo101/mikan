import type { TuiCard } from "./model.ts";

export type BoardCardView = TuiCard & {
	selected: boolean;
	labelsText: string;
};

export type BoardColumnView = {
	id: string;
	title: string;
	count: number;
	active: boolean;
	empty: boolean;
	emptyText: string;
	cards: BoardCardView[];
	visibleCards: BoardCardView[];
	laneFillLineCount: number;
	hiddenCardsBefore: number;
	hiddenCardsAfter: number;
	cardRangeText: string;
};

export type BoardViewModel = {
	columns: BoardColumnView[];
	visibleColumns: BoardColumnView[];
	groups: { columns: BoardColumnView[] }[];
	hasColumnsBefore: boolean;
	hasColumnsAfter: boolean;
	columnViewportText: string;
};

export type BoardViewOptions = {
	visibleColumnCount?: number;
	visibleCardCount?: number;
	viewportHeight?: number;
};
