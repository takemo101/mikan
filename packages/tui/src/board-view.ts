import {
	fg,
	type MouseEvent,
	type ScrollBoxRenderable,
	StyledText,
} from "@opentui/core";
import React from "react";
import type {
	TuiAppViewProps,
	TuiColumnScrollDirection,
} from "./app-view-props.ts";
import {
	type BoardColumnView,
	buildBoardViewModel,
	columnWidthPercent,
	formatWarningSummary,
} from "./board-view-model.ts";
import {
	type FooterMode,
	footerText,
	formatLabels,
	formatRepositoryFilter,
} from "./formatting.ts";
import { cardDependencyStatus, type TuiCard } from "./model.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

function columnScrollDirection(
	event: MouseEvent,
): TuiColumnScrollDirection | undefined {
	if (event.modifiers?.shift) return undefined;
	const direction = event.scroll?.direction;
	return direction === "up" ||
		direction === "down" ||
		direction === "left" ||
		direction === "right"
		? direction
		: undefined;
}

export function BoardView({
	model,
	selection,
	theme = buildTuiTheme(),
	viewportHeight,
	viewportWidth,
	columns,
	columnScrollBoxRef,
	onColumnScroll,
}: TuiAppViewProps): React.ReactElement {
	// A fixed columns count overrides the responsive width; "auto" (or unset)
	// keeps the sliding viewport derived from viewport width.
	const view = buildBoardViewModel(model, selection, {
		viewportHeight,
		...(typeof columns === "number"
			? { visibleColumnCount: columns }
			: { viewportWidth }),
	});
	const repositoryFilterText = formatRepositoryFilter({
		workspaceMode: (model.repositories?.length ?? 0) > 0,
		filter: selection.repositoryFilter,
		title: selection.repositoryFilter
			? model.repositoryTitles?.[selection.repositoryFilter]
			: undefined,
	});
	return React.createElement(
		"box",
		{
			id: "mikan-board",
			style: { flexDirection: "column", flexGrow: 1, minHeight: 0 },
		},
		model.warnings.length > 0
			? React.createElement("text", {
					content: formatWarningSummary(model.warnings),
					style: { color: theme.feedback.warning },
				})
			: undefined,
		repositoryFilterText
			? React.createElement("text", {
					id: "mikan-repository-filter",
					content: repositoryFilterText,
					style: { color: theme.interactive.accent },
				})
			: undefined,
		React.createElement("text", { content: view.columnViewportText }),
		...view.groups.map((group, groupIndex) =>
			React.createElement(
				"box",
				{
					key: `group-${groupIndex}`,
					id: `board-row-${groupIndex}`,
					style: { flexDirection: "row", flexGrow: 1, minHeight: 0 },
				},
				...group.columns.map((column, columnIndex) =>
					React.createElement(ColumnPane, {
						key: column.id,
						column,
						theme,
						width: columnWidthPercent(columnIndex, group.columns.length),
						scrollBoxRef: column.active ? columnScrollBoxRef : undefined,
						onScroll: column.active ? onColumnScroll : undefined,
					}),
				),
			),
		),
	);
}

export function ColumnPane(props: {
	column: BoardColumnView;
	theme?: TuiTheme;
	width?: string;
	scrollBoxRef?: React.RefObject<ScrollBoxRenderable | null>;
	onScroll?: (direction: TuiColumnScrollDirection) => void;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	const cardChildren = props.column.empty
		? [
				React.createElement("text", {
					id: `column-${props.column.id}-empty`,
					content: props.column.emptyText,
				}),
			]
		: props.column.cards.map((card) =>
				React.createElement(IssueCard, {
					key: card.id,
					card,
					selected: card.selected,
					theme,
				}),
			);
	return React.createElement(
		"box",
		{
			id: `column-${props.column.id}`,
			title: `${props.column.active ? "▶ " : ""}${props.column.title} (${props.column.count})`,
			bottomTitle: props.column.cardRangeText || undefined,
			bottomTitleAlignment: "center",
			border: true,
			focused: props.column.active,
			style: {
				backgroundColor: theme.base.surface,
				borderColor: props.column.active
					? theme.interactive.accent
					: theme.base.muted,
				flexDirection: "column",
				flexGrow: 1,
				minHeight: 0,
				width: props.width,
			},
		},
		React.createElement(
			"scrollbox",
			{
				id: `column-${props.column.id}-card-list`,
				ref: props.scrollBoxRef,
				onMouseScroll: props.onScroll
					? (event: MouseEvent) => {
							const direction = columnScrollDirection(event);
							if (direction) {
								queueMicrotask(() => props.onScroll?.(direction));
							}
						}
					: undefined,
				scrollY: true,
				scrollX: false,
				style: {
					flexGrow: 1,
					minHeight: 0,
					overflow: "hidden",
				},
			},
			...cardChildren,
		),
	);
}

function issueCardContent(
	card: TuiCard,
	selected: boolean,
	theme: TuiTheme,
): StyledText {
	const chunks = [];
	if (selected) chunks.push(fg(theme.interactive.focus)("▶ "));
	if (card.repository) {
		chunks.push(fg(theme.base.muted)(`[${card.repository}] `));
	}
	chunks.push(fg(theme.interactive.accent)(card.id));
	if (cardDependencyStatus(card) === "blocked") {
		chunks.push(fg(theme.base.text)(" "));
		chunks.push(fg(theme.feedback.warning)("deps!"));
	}
	chunks.push(fg(theme.base.muted)(" │ "));
	chunks.push(fg(theme.base.text)(card.title));
	if (card.labels.length > 0) {
		chunks.push(fg(theme.base.text)(" "));
		chunks.push(fg(theme.base.muted)(formatLabels(card.labels)));
	}
	return new StyledText(chunks);
}

export function IssueCard(props: {
	card: TuiCard;
	selected: boolean;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: `card-${props.card.id}`,
			border: false,
			focused: props.selected,
			style: {
				backgroundColor: props.selected
					? theme.interactive.selectedSurface
					: theme.base.surface,
				flexDirection: "column",
				height: 1,
				overflow: "hidden",
				width: "100%",
			},
		},
		React.createElement("text", {
			content: issueCardContent(props.card, props.selected, theme),
			truncate: true,
			wrapMode: "none",
			style: { overflow: "hidden", width: "100%" },
		}),
	);
}

export type FooterProps = {
	message?: string;
	mode?: FooterMode;
	theme?: TuiTheme;
};

export function Footer(props: FooterProps): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement("text", {
		id: "mikan-footer",
		style: { color: theme.base.muted, flexShrink: 0, marginTop: "auto" },
		content: [footerText(props.mode ?? "board"), props.message]
			.filter(Boolean)
			.join("    "),
	});
}
