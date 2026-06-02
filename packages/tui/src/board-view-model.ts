import { visibleCardCountForViewport } from "./formatting.ts";
import type { TuiCard, TuiModel } from "./model.ts";
import { clamp, type TuiSelection } from "./selection.ts";

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

export function buildBoardViewModel(
	model: TuiModel,
	selection: TuiSelection,
	options: BoardViewOptions = {},
): BoardViewModel {
	const visibleCardCount = Math.max(
		1,
		options.visibleCardCount ??
			(options.viewportHeight
				? visibleCardCountForViewport(options.viewportHeight)
				: 6),
	);
	const columns = model.columns.map((column, columnIndex) => {
		const cards = column.cards.map((card, cardIndex) => ({
			...card,
			selected:
				columnIndex === selection.columnIndex &&
				cardIndex === selection.cardIndex,
			labelsText: card.labels.join(", "),
		}));
		const maxCardStart = Math.max(0, cards.length - visibleCardCount);
		const cardStart =
			cards.length <= visibleCardCount
				? 0
				: columnIndex === selection.columnIndex
					? clamp(
							selection.cardIndex - Math.floor(visibleCardCount / 2),
							0,
							maxCardStart,
						)
					: 0;
		const visibleCards = cards.slice(cardStart, cardStart + visibleCardCount);
		const cardEnd = cardStart + visibleCards.length;
		return {
			id: column.id,
			title: column.title,
			count: column.cards.length,
			active: columnIndex === selection.columnIndex,
			empty: column.cards.length === 0,
			emptyText: "No Issues",
			cards,
			visibleCards,
			laneFillLineCount: Math.max(0, visibleCardCount - visibleCards.length),
			hiddenCardsBefore: cardStart,
			hiddenCardsAfter: Math.max(0, cards.length - cardEnd),
			cardRangeText:
				cards.length > visibleCardCount
					? `${cardStart + 1}-${cardEnd}/${cards.length} | ↑${cardStart} | ↓${Math.max(0, cards.length - cardEnd)}`
					: "",
		};
	});
	const visibleColumnCount = Math.max(1, options.visibleColumnCount ?? 3);
	const maxStart = Math.max(0, columns.length - visibleColumnCount);
	const start = clamp(
		selection.columnIndex - (visibleColumnCount - 1),
		0,
		maxStart,
	);
	const visibleColumns = columns.slice(start, start + visibleColumnCount);
	const hasColumnsBefore = start > 0;
	const hasColumnsAfter = start + visibleColumnCount < columns.length;
	return {
		columns,
		visibleColumns,
		groups: [{ columns: visibleColumns }],
		hasColumnsBefore,
		hasColumnsAfter,
		columnViewportText: `Columns: ${hasColumnsBefore ? "◀ " : ""}${visibleColumns
			.map((column) => column.title)
			.join(" / ")}${hasColumnsAfter ? " ▶" : ""}`,
	};
}

export function columnWidthPercent(index: number, count: number): string {
	const safeCount = Math.max(1, count);
	const base = Math.floor(100 / safeCount);
	const remainder = 100 - base * safeCount;
	const extraStart = Math.floor((safeCount - remainder) / 2);
	const width =
		index >= extraStart && index < extraStart + remainder ? base + 1 : base;
	return `${width}%`;
}

export function formatWarningSummary(warnings: string[]): string {
	if (warnings.length === 0) return "";
	const kinds = [...new Set(warnings.map((warning) => warning.split(":")[0]))]
		.filter(Boolean)
		.join(", ");
	return `Warnings: ${warnings.length}${kinds ? ` ${kinds}` : ""} | w details`;
}
