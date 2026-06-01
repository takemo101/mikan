import { readFileSync } from "node:fs";
import {
	appendIssue,
	type BoardIssue,
	type BoardSnapshot,
	moveIssue,
	scanBoard,
} from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import React from "react";
import packageJson from "../package.json" with { type: "json" };
import {
	boxLine,
	contentLine,
	type FooterMode,
	footerText,
	formatLabels,
	formatLineRange,
	visibleCardCountForViewport,
	visibleDetailLineCount,
} from "./formatting.ts";

export type TuiCard = {
	id: string;
	title: string;
	labels: string[];
	status: string;
	path: string;
	dependsOn?: string[];
	unmetDependencies?: string[];
	dependencyStatus?: "ready" | "blocked";
};

export type TuiColumn = {
	id: string;
	title: string;
	cards: TuiCard[];
};

export type TuiModel = {
	columns: TuiColumn[];
	warnings: string[];
};

export const TUI_VERSION = packageJson.version;

export type TuiTheme = {
	base: {
		canvas: string;
		surface: string;
		text: string;
		muted: string;
	};
	interactive: {
		accent: string;
		focus: string;
		selectedSurface: string;
	};
	feedback: {
		warning: string;
		error: string;
		success: string;
	};
};

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

export type DetailViewModel = {
	selected: TuiCard & {
		labelsText: string;
	};
	groups: {
		status: string;
		title: string;
		cards: BoardCardView[];
	}[];
	sections: {
		summary: string;
		statusLog: string;
		reports: string;
		notes: string;
		herdr: string;
	};
};

export type DetailPageViewModel = {
	id: string;
	title: string;
	status: string;
	labelsText: string;
	dependsOnText: string;
	unmetDependenciesText: string;
	dependencyStatus: "ready" | "blocked";
	markdown: string;
	visibleMarkdownLines: string[];
	hiddenLinesBefore: number;
	hiddenLinesAfter: number;
	lineRangeText: string;
};

export type DetailPageOptions = {
	visibleLineCount?: number;
	viewportHeight?: number;
};

export type MovePromptViewModel = {
	title: string;
	focused: boolean;
	targets: (MoveTarget & { selected: boolean })[];
	hint: string;
};

export type NotePromptViewModel = {
	title: string;
	focused: boolean;
	draft: string;
	feedback?: string;
	hint: string;
};

export type ArchivePromptViewModel = {
	title: string;
	focused: boolean;
	body: string;
	hint: string;
};

export type TuiSelection = {
	columnIndex: number;
	cardIndex: number;
	detailOpen: boolean;
	moveOpen?: boolean;
	moveTargetIndex?: number;
	noteOpen?: boolean;
	noteDraft?: string;
	archiveOpen?: boolean;
	detailScrollOffset?: number;
	detailScrollMax?: number;
	message?: string;
};

export type MoveTarget = {
	id: string;
	title: string;
};

export type TuiMutationResult = {
	ok: boolean;
	model: TuiModel;
	selection: TuiSelection;
	message: string;
};

export type MoveSelectedIssueResult = TuiMutationResult;

export type TuiRefreshResult = {
	model: TuiModel;
	selection: TuiSelection;
};

export type TuiDetails = {
	card: TuiCard;
	markdown: string;
	summary: string;
	statusLog: string;
	reports: string;
	notes: string;
	herdr: string;
};

export function buildTuiTheme(): TuiTheme {
	return {
		base: {
			canvas: "#1f1a14",
			surface: "#2a2118",
			text: "#eadfce",
			muted: "#9c8870",
		},
		interactive: {
			accent: "#f0a04b",
			focus: "#f6c177",
			selectedSurface: "#3a2a1d",
		},
		feedback: {
			warning: "#f6c177",
			error: "#d66a4a",
			success: "#8faa5f",
		},
	};
}

export function loadTuiModel(cwd = process.cwd()): TuiModel {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) throw new Error(loaded.error.message);
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
	});
	if (!board.ok) throw new Error(board.error.message);
	return buildTuiModel(board.value);
}

export function buildTuiModel(board: BoardSnapshot): TuiModel {
	return {
		columns: board.columns.map((column) => ({
			id: column.id,
			title: column.title,
			cards: column.issues.map(formatCard),
		})),
		warnings: board.warnings.map(
			(warning) => `${warning.kind}: ${warning.message}`,
		),
	};
}

export function moveSelection(
	model: TuiModel,
	selection: TuiSelection,
	direction: TuiSelectionAction,
	options: { viewportHeight?: number } = {},
): TuiSelection {
	if (direction === "enter") {
		return { ...selection, detailOpen: true, detailScrollOffset: 0 };
	}
	if (
		selection.detailOpen &&
		!selection.moveOpen &&
		!selection.noteOpen &&
		(direction === "up" || direction === "down")
	) {
		return {
			...selection,
			detailScrollOffset: clamp(
				(selection.detailScrollOffset ?? 0) + (direction === "down" ? 1 : -1),
				0,
				detailScrollMax(model, selection, options),
			),
		};
	}
	if (direction === "escape") {
		if (selection.archiveOpen) {
			return { ...selection, archiveOpen: false };
		}
		return {
			...selection,
			detailOpen: false,
			moveOpen: false,
			noteOpen: false,
		};
	}
	if (direction === "move") {
		return {
			...selection,
			archiveOpen: false,
			detailOpen: false,
			noteOpen: false,
			moveOpen: true,
			moveTargetIndex: 0,
		};
	}
	if (direction === "append-note") {
		return {
			...selection,
			archiveOpen: false,
			detailOpen: false,
			moveOpen: false,
			noteOpen: true,
		};
	}
	if (direction === "archive") {
		return {
			...selection,
			archiveOpen: true,
			moveOpen: false,
			noteOpen: false,
		};
	}
	const columnIndex = clamp(
		selection.columnIndex +
			(direction === "right" ? 1 : direction === "left" ? -1 : 0),
		0,
		Math.max(0, model.columns.length - 1),
	);
	const maxCardIndex = Math.max(
		0,
		(model.columns[columnIndex]?.cards.length ?? 1) - 1,
	);
	const cardIndex = clamp(
		direction === "up"
			? selection.cardIndex - 1
			: direction === "down"
				? selection.cardIndex + 1
				: Math.min(selection.cardIndex, maxCardIndex),
		0,
		maxCardIndex,
	);
	return { ...selection, columnIndex, cardIndex };
}

export function refreshTuiModel(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
}): TuiRefreshResult {
	const selectedCard =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	const model = loadTuiModel(options.cwd);
	const foundSelection = selectedCard
		? findSelectionByCardId(model, selectedCard.id)
		: undefined;
	const selection = foundSelection ?? clampSelection(model, options.selection);
	const stillSelected = Boolean(foundSelection);
	return {
		model,
		selection: {
			...selection,
			detailOpen: stillSelected ? options.selection.detailOpen : false,
			detailScrollOffset: stillSelected
				? options.selection.detailScrollOffset
				: undefined,
			detailScrollMax: stillSelected
				? options.selection.detailScrollMax
				: undefined,
			moveOpen: stillSelected ? options.selection.moveOpen : false,
			moveTargetIndex: stillSelected
				? options.selection.moveTargetIndex
				: undefined,
			noteOpen: stillSelected ? options.selection.noteOpen : false,
			noteDraft: stillSelected ? options.selection.noteDraft : undefined,
			message: options.selection.message,
			archiveOpen: stillSelected ? options.selection.archiveOpen : false,
		},
	};
}

export function getSelectedDetails(
	model: TuiModel,
	selection: TuiSelection,
): TuiDetails | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	const markdown = readFileSync(card.path, "utf8");
	return {
		card,
		markdown,
		summary: extractSection(markdown, "Summary") || card.title,
		statusLog: extractSection(markdown, "Status Log"),
		reports: extractSection(markdown, "Reports"),
		notes: extractSection(markdown, "Notes"),
		herdr:
			extractSection(markdown, "Herdr") || extractSection(markdown, "herdr"),
	};
}

export function renderTuiText(
	model: TuiModel,
	selection: TuiSelection,
): string {
	const lines = ["mikan board", ...renderBoard(model, selection)];
	if (model.warnings.length > 0) {
		lines.push(
			"",
			"Warnings",
			...model.warnings.map((warning) => `! ${warning}`),
		);
	}
	if (selection.moveOpen) {
		lines.push("", ...renderMoveInteraction(model, selection));
	}
	if (selection.noteOpen) {
		lines.push("", ...renderNoteInteraction(model, selection));
	}
	if (selection.archiveOpen) {
		lines.push("", ...renderArchiveInteraction(model, selection));
	}
	lines.push(
		"",
		[footerText(footerMode(selection)), selection.message]
			.filter(Boolean)
			.join(" | "),
	);
	const details = selection.detailOpen
		? getSelectedDetails(model, selection)
		: undefined;
	if (details) {
		lines.push("", ...renderDetails(details));
	}
	return `${lines.join("\n")}\n`;
}

export type TuiAppViewProps = {
	model: TuiModel;
	selection: TuiSelection;
	theme?: TuiTheme;
	viewportHeight?: number;
};

export function createTuiAppElement(
	props: TuiAppViewProps,
): React.ReactElement {
	return React.createElement(TuiAppView, props);
}

export function TuiAppView({
	model,
	selection,
	theme = buildTuiTheme(),
	viewportHeight,
}: TuiAppViewProps): React.ReactElement {
	const details = selection.detailOpen
		? getSelectedDetails(model, selection)
		: undefined;
	return React.createElement(
		"box",
		{
			id: "mikan-app",
			style: {
				backgroundColor: theme.base.canvas,
				color: theme.base.text,
				flexDirection: "column",
				height: "100%",
			},
		},
		React.createElement(Header, { theme }),
		React.createElement(
			"box",
			{
				id: "mikan-main",
				style: { flexDirection: "column", flexGrow: 1, minHeight: 0 },
			},
			details
				? React.createElement(DetailPage, {
						model,
						selection,
						theme,
						viewportHeight,
					})
				: React.createElement(BoardView, {
						model,
						selection,
						theme,
						viewportHeight,
					}),
		),
		selection.moveOpen
			? React.createElement(MovePrompt, { model, selection, theme })
			: undefined,
		selection.noteOpen
			? React.createElement(NotePrompt, { model, selection, theme })
			: undefined,
		selection.archiveOpen
			? React.createElement(ArchivePrompt, { model, selection, theme })
			: undefined,
		React.createElement(Footer, {
			message: selection.message,
			mode: footerMode(selection),
			theme,
		}),
	);
}

export function Header(props: { theme?: TuiTheme }): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement("text", {
		id: "mikan-header",
		style: { color: theme.interactive.accent },
		content: `🍊 mikan v${TUI_VERSION}`,
	});
}

export function buildDetailPageViewModel(
	model: TuiModel,
	selection: TuiSelection,
	options: DetailPageOptions = {},
): DetailPageViewModel | undefined {
	const details = getSelectedDetails(model, selection);
	if (!details) return undefined;
	const markdown = stripFrontmatter(details.markdown).trimEnd();
	const markdownLines = markdown.split("\n");
	const visibleLineCount =
		options.visibleLineCount ??
		(options.viewportHeight
			? visibleDetailLineCount(options.viewportHeight)
			: 40);
	const offset = clamp(
		selection.detailScrollOffset ?? 0,
		0,
		Math.max(0, markdownLines.length - visibleLineCount),
	);
	const visibleMarkdownLines = markdownLines.slice(
		offset,
		offset + visibleLineCount,
	);
	const lineEnd = offset + visibleMarkdownLines.length;
	return {
		id: details.card.id,
		title: details.card.title,
		status: details.card.status,
		labelsText: details.card.labels.join(", "),
		dependsOnText: cardDependsOn(details.card).join(", "),
		unmetDependenciesText: cardUnmetDependencies(details.card).join(", "),
		dependencyStatus: cardDependencyStatus(details.card),
		markdown,
		visibleMarkdownLines,
		hiddenLinesBefore: offset,
		hiddenLinesAfter: Math.max(0, markdownLines.length - lineEnd),
		lineRangeText: formatLineRange({
			start: offset + 1,
			end: lineEnd,
			total: markdownLines.length,
			hiddenBefore: offset,
			hiddenAfter: Math.max(0, markdownLines.length - lineEnd),
		}),
	};
}

export function buildDetailViewModel(
	model: TuiModel,
	selection: TuiSelection,
): DetailViewModel | undefined {
	const details = getSelectedDetails(model, selection);
	if (!details) return undefined;
	return {
		selected: {
			...details.card,
			labelsText: details.card.labels.join(", "),
		},
		groups: model.columns.map((column, columnIndex) => ({
			status: column.id,
			title: column.title,
			cards: column.cards.map((card, cardIndex) => ({
				...card,
				selected:
					columnIndex === selection.columnIndex &&
					cardIndex === selection.cardIndex,
				labelsText: card.labels.join(", "),
			})),
		})),
		sections: {
			summary: details.summary,
			statusLog: details.statusLog,
			reports: details.reports,
			notes: details.notes,
			herdr: details.herdr,
		},
	};
}

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

export function BoardView({
	model,
	selection,
	theme = buildTuiTheme(),
	viewportHeight,
}: TuiAppViewProps): React.ReactElement {
	const view = buildBoardViewModel(model, selection, { viewportHeight });
	return React.createElement(
		"box",
		{
			id: "mikan-board",
			style: { flexDirection: "column", flexGrow: 1, minHeight: 0 },
		},
		React.createElement("text", { content: view.columnViewportText }),
		...view.groups.map((group, groupIndex) =>
			React.createElement(
				"box",
				{
					key: `group-${groupIndex}`,
					id: `board-row-${groupIndex}`,
					style: { flexDirection: "row", flexGrow: 1, minHeight: 0 },
				},
				...group.columns.map((column) =>
					React.createElement(ColumnPane, {
						key: column.id,
						column,
						theme,
						width: `${(100 / group.columns.length).toFixed(2)}%`,
					}),
				),
			),
		),
		model.warnings.length > 0
			? React.createElement("text", {
					content: [
						`Warnings: ${model.warnings.length}`,
						...model.warnings,
					].join("\n"),
				})
			: undefined,
	);
}

export function ColumnPane(props: {
	column: BoardColumnView;
	theme?: TuiTheme;
	width?: string;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	const children = [
		props.column.cardRangeText
			? React.createElement("text", { content: props.column.cardRangeText })
			: undefined,
		...(props.column.empty
			? [React.createElement("text", { content: props.column.emptyText })]
			: props.column.visibleCards.map((card) =>
					React.createElement(IssueCard, {
						key: card.id,
						card,
						selected: card.selected,
						theme,
					}),
				)),
	];
	return React.createElement(
		"box",
		{
			id: `column-${props.column.id}`,
			title: `${props.column.active ? "▶ " : ""}${props.column.title} (${props.column.count})`,
			border: true,
			focused: props.column.active,
			style: {
				backgroundColor: theme.base.surface,
				borderColor: props.column.active
					? theme.interactive.accent
					: theme.base.muted,
				flexDirection: "column",
				flexGrow: 1,
				width: props.width,
			},
		},
		...children,
	);
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
			border: true,
			focused: props.selected,
			style: {
				backgroundColor: props.selected
					? theme.interactive.selectedSurface
					: theme.base.surface,
				borderColor: props.selected
					? theme.interactive.focus
					: theme.base.muted,
				color: props.selected ? theme.interactive.focus : theme.base.text,
				flexDirection: "column",
				height: 3,
			},
		},
		React.createElement("text", {
			content: `${props.selected ? "▶ " : ""}${props.card.id}${
				cardDependencyStatus(props.card) === "blocked" ? " 🔒" : ""
			} ${props.card.title}${props.card.labels.length > 0 ? ` ${formatLabels(props.card.labels)}` : ""}`,
		}),
	);
}

export function DetailPage(props: TuiAppViewProps): React.ReactElement {
	const page = buildDetailPageViewModel(props.model, props.selection, {
		viewportHeight: props.viewportHeight,
	});
	const theme = props.theme ?? buildTuiTheme();
	if (!page)
		return React.createElement("text", { content: "No Issue selected" });
	return React.createElement(
		"box",
		{
			id: "detail-page",
			title: "Detail",
			border: true,
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.interactive.accent,
				flexDirection: "column",
				flexGrow: 1,
				overflow: "hidden",
			},
		},
		React.createElement(
			"box",
			{
				id: "detail-header",
				style: {
					backgroundColor: theme.base.surface,
					flexDirection: "column",
					flexShrink: 0,
				},
			},
			React.createElement("text", {
				content: `${page.id}  ${page.title}`,
			}),
			React.createElement("text", {
				content: `Status: ${page.status} | Labels: ${page.labelsText ? formatLabels(page.labelsText.split(", ").filter(Boolean)) : "none"}${page.lineRangeText ? ` | ${page.lineRangeText}` : ""}`,
			}),
			page.dependsOnText || page.unmetDependenciesText
				? React.createElement("text", {
						content: `Dependencies: ${page.dependsOnText || "none"} | Unmet: ${page.unmetDependenciesText || "none"} | ${page.dependencyStatus}`,
					})
				: undefined,
			React.createElement("text", {
				content: "────────────────────────────────────────────────",
			}),
		),
		React.createElement(
			"box",
			{
				id: "detail-markdown-body",
				style: {
					flexDirection: "column",
					flexGrow: 1,
					minHeight: 0,
					overflow: "hidden",
				},
			},
			React.createElement("markdown", {
				id: "detail-markdown",
				content: page.visibleMarkdownLines.join("\n"),
				style: {
					flexGrow: 1,
					minHeight: 0,
					overflow: "hidden",
				},
			}),
		),
	);
}

export function DetailView(props: TuiAppViewProps): React.ReactElement {
	const view = buildDetailViewModel(props.model, props.selection);
	const details = getSelectedDetails(props.model, props.selection);
	const theme = props.theme ?? buildTuiTheme();
	if (!view || !details) {
		return React.createElement("text", { content: "No Issue selected" });
	}
	const issueList = React.createElement(
		"box",
		{
			id: "detail-issue-list",
			title: "Issues",
			style: { flexDirection: "column", flexGrow: 1 },
		},
		...view.groups.map((group) =>
			React.createElement("text", {
				key: group.status,
				content: [
					`${group.title} (${group.cards.length})`,
					...group.cards.map(
						(card) => `${card.selected ? ">" : " "} ${card.id} ${card.title}`,
					),
				].join("\n"),
			}),
		),
	);
	return React.createElement(
		"box",
		{ id: "mikan-detail-layout", style: { flexDirection: "row" } },
		issueList,
		React.createElement(
			"box",
			{
				id: "detail-right-panes",
				style: { flexDirection: "column", flexGrow: 3 },
			},
			React.createElement(DetailPane, { details, theme }),
			React.createElement(LogPane, { details, theme }),
		),
	);
}

export function DetailPane(props: {
	details: TuiDetails;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "detail-pane",
			title: "Details",
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.interactive.accent,
				flexDirection: "column",
				flexGrow: 2,
			},
		},
		React.createElement("text", {
			content: `${props.details.card.id} ${props.details.card.title}`,
		}),
		React.createElement("text", {
			content: `Status: ${props.details.card.status}`,
		}),
		React.createElement("text", {
			content: `Labels: ${props.details.card.labels.join(", ") || "(none)"}`,
		}),
		React.createElement("markdown", { content: props.details.summary }),
	);
}

export function LogPane(props: {
	details: TuiDetails;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "log-pane",
			title: "Status Log / Reports / Notes",
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.base.muted,
				flexDirection: "column",
				flexGrow: 1,
			},
		},
		React.createElement("markdown", {
			content: [
				"## Status Log",
				props.details.statusLog || "(empty)",
				"## Reports",
				props.details.reports || "(empty)",
				"## Notes",
				props.details.notes || "(empty)",
				"## Herdr",
				props.details.herdr || "(empty)",
			].join("\n\n"),
		}),
	);
}

export function MovePrompt(props: TuiAppViewProps): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "move-modal-backdrop",
			style: modalBackdropStyle(theme),
		},
		React.createElement(
			"box",
			{
				id: "move-prompt",
				title: "Move Issue",
				border: true,
				style: modalStyle(theme),
			},
			React.createElement("text", {
				content: renderMoveInteraction(props.model, props.selection).join("\n"),
			}),
		),
	);
}

export function NotePrompt(props: TuiAppViewProps): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "note-modal-backdrop",
			style: modalBackdropStyle(theme),
		},
		React.createElement(
			"box",
			{
				id: "note-prompt",
				title: "Append Note",
				border: true,
				style: modalStyle(theme),
			},
			React.createElement("text", {
				content: renderNoteInteraction(props.model, props.selection).join("\n"),
			}),
		),
	);
}

export function ArchivePrompt(props: TuiAppViewProps): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "archive-modal-backdrop",
			style: modalBackdropStyle(theme),
		},
		React.createElement(
			"box",
			{
				id: "archive-prompt",
				title: "Archive Issue",
				border: true,
				style: modalStyle(theme),
			},
			React.createElement("text", {
				content: renderArchiveInteraction(props.model, props.selection).join(
					"\n",
				),
			}),
		),
	);
}

function modalBackdropStyle(_theme: TuiTheme): Record<string, string | number> {
	return {
		alignItems: "center",
		flexDirection: "column",
		height: "100%",
		justifyContent: "center",
		left: 0,
		position: "absolute",
		top: 0,
		width: "100%",
		zIndex: 10,
	};
}

function modalStyle(theme: TuiTheme): Record<string, string | number> {
	return {
		backgroundColor: theme.base.surface,
		borderColor: theme.interactive.focus,
		flexDirection: "column",
		padding: 1,
		width: "70%",
	};
}

export type { FooterMode } from "./formatting.ts";

export type FooterProps = {
	message?: string;
	mode?: FooterMode;
	theme?: TuiTheme;
};

export function Footer(props: FooterProps): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement("text", {
		id: "mikan-footer",
		style: { color: theme.base.muted, marginTop: "auto" },
		content: [footerText(props.mode ?? "board"), props.message]
			.filter(Boolean)
			.join(" | "),
	});
}

function footerMode(selection: TuiSelection): FooterMode {
	if (selection.moveOpen || selection.noteOpen || selection.archiveOpen) {
		return "modal";
	}
	return selection.detailOpen ? "detail" : "board";
}

export function getMoveTargets(
	model: TuiModel,
	selection: TuiSelection,
): MoveTarget[] {
	const currentStatus = model.columns[selection.columnIndex]?.id;
	return model.columns
		.filter((column) => column.id !== currentStatus)
		.map((column) => ({ id: column.id, title: column.title }));
}

export function getAdjacentMoveTarget(
	model: TuiModel,
	selection: TuiSelection,
	direction: "left" | "right",
): MoveTarget | undefined {
	const offset = direction === "left" ? -1 : 1;
	const column = model.columns[selection.columnIndex + offset];
	return column ? { id: column.id, title: column.title } : undefined;
}

export function applyNoteInput(
	selection: TuiSelection,
	keyName: string | undefined,
	shift = false,
): TuiSelection {
	if (!selection.noteOpen || !keyName) return selection;
	if (keyName === "backspace") {
		return {
			...selection,
			noteDraft: (selection.noteDraft ?? "").slice(0, -1),
		};
	}
	const character = keyName === "space" ? " " : keyName;
	if (character.length !== 1) return selection;
	const value =
		shift && /[a-z]/.test(character) ? character.toUpperCase() : character;
	return { ...selection, noteDraft: `${selection.noteDraft ?? ""}${value}` };
}

export function moveSelectedIssueByDirection(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
	direction: "left" | "right";
	now?: () => Date;
}): MoveSelectedIssueResult {
	const target = getAdjacentMoveTarget(
		options.model,
		options.selection,
		options.direction,
	);
	if (!target) {
		return {
			ok: false,
			model: options.model,
			selection: options.selection,
			message: `No Status to the ${options.direction}`,
		};
	}
	return moveSelectedIssue({
		cwd: options.cwd,
		model: options.model,
		selection: options.selection,
		targetStatus: target.id,
		now: options.now,
	});
}

export function moveSelectedIssue(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
	targetStatus: string;
	log?: string;
	now?: () => Date;
}): MoveSelectedIssueResult {
	const card =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	if (!card) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, moveOpen: false },
			message: "No Issue selected",
		};
	}
	const loaded = loadProjectConfig(options.cwd ?? process.cwd());
	if (!loaded.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, moveOpen: false },
			message: loaded.error.message,
		};
	}
	const moved = moveIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: card.id,
		status: options.targetStatus,
		log: options.log ?? "Moved via TUI",
		now: options.now,
	});
	if (!moved.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, moveOpen: false },
			message: moved.error.message,
		};
	}
	const model = loadTuiModel(options.cwd);
	const selection =
		findSelectionByCardId(model, card.id) ??
		clampSelection(model, options.selection);
	return {
		ok: true,
		model,
		selection: {
			...selection,
			archiveOpen: false,
			detailOpen: false,
			moveOpen: false,
		},
		message: `${card.id} moved to ${options.targetStatus}`,
	};
}

export function archiveSelectedIssue(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
	now?: () => Date;
}): MoveSelectedIssueResult {
	const card =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	const result = moveSelectedIssue({
		cwd: options.cwd,
		model: options.model,
		selection: options.selection,
		targetStatus: "archived",
		log: "Archived via TUI",
		now: options.now,
	});
	return result.ok && card
		? {
				...result,
				message: `${card.id} archived`,
				selection: { ...result.selection, archiveOpen: false },
			}
		: result;
}

export function appendSelectedIssueNote(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
	body: string;
	now?: () => Date;
}): TuiMutationResult {
	const body = options.body.trim();
	if (!body) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: "Note cannot be empty",
		};
	}
	const card =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	if (!card) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: "No Issue selected",
		};
	}
	const loaded = loadProjectConfig(options.cwd ?? process.cwd());
	if (!loaded.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: loaded.error.message,
		};
	}
	const appended = appendIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: card.id,
		section: "Notes",
		body,
		source: "mikan-tui",
		now: options.now,
	});
	if (!appended.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: appended.error.message,
		};
	}
	const model = loadTuiModel(options.cwd);
	const selection =
		findSelectionByCardId(model, card.id) ??
		clampSelection(model, options.selection);
	return {
		ok: true,
		model,
		selection: {
			...selection,
			detailOpen: options.selection.detailOpen,
			noteOpen: false,
		},
		message: `${card.id} note appended`,
	};
}

export function buildMovePromptViewModel(
	model: TuiModel,
	selection: TuiSelection,
): MovePromptViewModel | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	const targetIndex = selection.moveTargetIndex ?? 0;
	return {
		title: `Move ${card.id}`,
		focused: Boolean(selection.moveOpen),
		targets: getMoveTargets(model, selection).map((target, index) => ({
			...target,
			selected: index === targetIndex,
		})),
		hint: "enter move  esc cancel",
	};
}

export function buildNotePromptViewModel(
	model: TuiModel,
	selection: TuiSelection,
): NotePromptViewModel | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	return {
		title: `Append note to ${card.id}`,
		focused: Boolean(selection.noteOpen),
		draft: selection.noteDraft ?? "",
		hint: "enter append  esc cancel",
	};
}

export function buildArchivePromptViewModel(
	model: TuiModel,
	selection: TuiSelection,
): ArchivePromptViewModel | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	return {
		title: `Archive ${card.id}?`,
		focused: Boolean(selection.archiveOpen),
		body: `${card.title}\nMove to archived. It will disappear from the default board.`,
		hint: "enter archive  esc cancel",
	};
}

function renderMoveInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildMovePromptViewModel(model, selection);
	if (!view) return ["Move", "No Issue selected"];
	return [
		`${view.title} to Status`,
		...view.targets.map(
			(target) =>
				`${target.selected ? ">" : " "} ${target.id} (${target.title})`,
		),
		view.hint,
	];
}

function renderNoteInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildNotePromptViewModel(model, selection);
	if (!view) return ["Append note", "No Issue selected"];
	return [
		view.title,
		`Note: ${view.draft}`,
		...(view.feedback ? [view.feedback] : []),
		view.hint,
	];
}

function renderArchiveInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildArchivePromptViewModel(model, selection);
	if (!view) return ["Archive", "No Issue selected"];
	return [view.title, view.body, view.hint];
}

function renderDetails(details: TuiDetails): string[] {
	return [
		`Detail: ${details.card.id} ${details.card.title}`,
		"esc back",
		"",
		"## Dependencies",
		`Depends On: ${cardDependsOn(details.card).length > 0 ? cardDependsOn(details.card).join(", ") : "none"}`,
		`Unmet: ${cardUnmetDependencies(details.card).length > 0 ? cardUnmetDependencies(details.card).join(", ") : "none"}`,
		`Status: ${cardDependencyStatus(details.card)}`,
		"",
		"## Summary",
		details.summary || "(empty)",
		"",
		"## Status Log",
		details.statusLog || "(empty)",
		"",
		"## Reports",
		details.reports || "(empty)",
		"",
		"## Notes",
		details.notes || "(empty)",
		"",
		"## Herdr",
		details.herdr || "(empty)",
	];
}

function renderBoard(model: TuiModel, selection: TuiSelection): string[] {
	const width = 26;
	const view = buildBoardViewModel(model, selection);
	const columns = view.visibleColumns.map((column) => {
		const rows = column.empty
			? ["  (empty)"]
			: [
					...(column.cardRangeText ? [`  ${column.cardRangeText}`] : []),
					...column.visibleCards.map(
						(card) =>
							`${card.selected ? "▶" : " "} ${card.id}${
								cardDependencyStatus(card) === "blocked" ? " 🔒" : ""
							} ${card.title}${card.labels.length > 0 ? ` ${formatLabels(card.labels)}` : ""}`,
					),
				];
		return {
			header: boxLine(
				`─ ${column.active ? "▶ " : ""}${column.title} `,
				width,
				"┌",
				"┐",
			),
			rows: rows.map((row) => contentLine(row, width)),
			footer: boxLine("", width, "└", "┘"),
		};
	});
	const maxRows = Math.max(0, ...columns.map((column) => column.rows.length));
	const lines: string[] = [];
	lines.push(view.columnViewportText);
	lines.push(columns.map((column) => column.header).join(" "));
	for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
		lines.push(
			columns
				.map((column) => column.rows[rowIndex] ?? contentLine("", width))
				.join(" "),
		);
	}
	lines.push(columns.map((column) => column.footer).join(" "));
	return lines;
}

export async function launchTui(
	options: { cwd?: string; pollMs?: number } = {},
): Promise<void> {
	const { createCliRenderer } = await import("@opentui/core");
	const { createRoot, useKeyboard } = await import("@opentui/react");
	const renderer = await createCliRenderer();
	const pollMs = options.pollMs ?? 1000;
	const root = createRoot(renderer);
	const stop = () => {
		root.unmount();
		renderer.destroy();
	};

	function App() {
		const [model, setModel] = React.useState(() => loadTuiModel(options.cwd));
		const [selection, setSelection] = React.useState<TuiSelection>({
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
		});
		const modelRef = React.useRef(model);
		const selectionRef = React.useRef(selection);
		modelRef.current = model;
		selectionRef.current = selection;

		React.useEffect(() => {
			const interval = setInterval(() => {
				const refreshed = refreshTuiModel({
					cwd: options.cwd,
					model: modelRef.current,
					selection: selectionRef.current,
				});
				modelRef.current = refreshed.model;
				selectionRef.current = refreshed.selection;
				setModel(refreshed.model);
				setSelection(refreshed.selection);
			}, pollMs);
			return () => clearInterval(interval);
		}, []);

		useKeyboard((key: { name?: string; shift?: boolean }) => {
			const action = keyToTuiAction(key.name, key.shift);
			if (selection.noteOpen) {
				if (action === "escape") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "enter") {
					const result = appendSelectedIssueNote({
						cwd: options.cwd,
						model,
						selection,
						body: selection.noteDraft ?? "",
					});
					setModel(result.model);
					setSelection({ ...result.selection, message: result.message });
					return;
				}
				setSelection((current) => applyNoteInput(current, key.name, key.shift));
				return;
			}
			if (selection.archiveOpen) {
				if (action === "escape") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "enter") {
					const result = archiveSelectedIssue({
						cwd: options.cwd,
						model,
						selection,
					});
					setModel(result.model);
					setSelection({ ...result.selection, message: result.message });
					return;
				}
				return;
			}
			if (!action) return;
			if (action === "quit") {
				stop();
				return;
			}
			if (selection.moveOpen && (action === "up" || action === "down")) {
				setSelection((current) => ({
					...current,
					moveTargetIndex: clamp(
						(current.moveTargetIndex ?? 0) + (action === "down" ? 1 : -1),
						0,
						Math.max(0, getMoveTargets(model, current).length - 1),
					),
				}));
				return;
			}
			if (selection.moveOpen && action === "enter") {
				const targets = getMoveTargets(model, selection);
				const target = targets[selection.moveTargetIndex ?? 0];
				if (!target) return;
				const result = moveSelectedIssue({
					cwd: options.cwd,
					model,
					selection,
					targetStatus: target.id,
				});
				setModel(result.model);
				setSelection({ ...result.selection, message: result.message });
				return;
			}
			if (action === "reload") {
				const result = refreshTuiModel({ cwd: options.cwd, model, selection });
				setModel(result.model);
				setSelection(result.selection);
				return;
			}
			if (action === "move-left" || action === "move-right") {
				const result = moveSelectedIssueByDirection({
					cwd: options.cwd,
					model,
					selection,
					direction: action === "move-left" ? "left" : "right",
				});
				setModel(result.model);
				setSelection({ ...result.selection, message: result.message });
				return;
			}
			if (action === "archive") {
				setSelection((current) => moveSelection(model, current, action));
				return;
			}
			setSelection((current) =>
				moveSelection(model, current, action, {
					viewportHeight: renderer.height,
				}),
			);
		});

		return createTuiAppElement({
			model,
			selection,
			viewportHeight: renderer.height,
		});
	}

	root.render(React.createElement(App));
	process.once("SIGINT", stop);
}

type TuiAction =
	| "left"
	| "right"
	| "up"
	| "down"
	| "enter"
	| "escape"
	| "move"
	| "move-left"
	| "move-right"
	| "append-note"
	| "archive"
	| "reload"
	| "quit";

type TuiDirection = "left" | "right" | "up" | "down" | "enter" | "escape";

type TuiSelectionAction = TuiDirection | "move" | "append-note" | "archive";

export function keyToTuiAction(
	keyName: string | undefined,
	shift = false,
): TuiAction | undefined {
	if (shift && keyName === "h") return "move-left";
	if (shift && keyName === "l") return "move-right";
	switch (keyName) {
		case "left":
		case "right":
		case "up":
		case "down":
		case "enter":
		case "escape":
			return keyName;
		case "h":
			return "left";
		case "l":
			return "right";
		case "j":
			return "down";
		case "k":
			return "up";
		case "return":
			return "enter";
		case "H":
			return "move-left";
		case "L":
			return "move-right";
		case "r":
			return "reload";
		case "m":
			return "move";
		case "n":
			return "append-note";
		case "a":
			return "archive";
		case "q":
			return "quit";
		default:
			return undefined;
	}
}

export function keyToDirection(
	keyName: string | undefined,
): TuiDirection | undefined {
	const action = keyToTuiAction(keyName);
	if (
		action === "move" ||
		action === "move-left" ||
		action === "move-right" ||
		action === "append-note" ||
		action === "archive" ||
		action === "reload" ||
		action === "quit"
	) {
		return undefined;
	}
	return action;
}

function clampSelection(
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

function findSelectionByCardId(
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

function cardDependsOn(card: TuiCard): string[] {
	return card.dependsOn ?? [];
}

function cardUnmetDependencies(card: TuiCard): string[] {
	return card.unmetDependencies ?? [];
}

function cardDependencyStatus(card: TuiCard): "ready" | "blocked" {
	return card.dependencyStatus ?? "ready";
}

function formatCard(issue: BoardIssue): TuiCard {
	return {
		id: String(issue.issue.id),
		title: issue.issue.title,
		labels: issue.issue.labels.map(String),
		status: String(issue.status),
		path: issue.path,
		dependsOn: issue.issue.dependencies.map(String),
		unmetDependencies: issue.unmetDependencies.map(String),
		dependencyStatus: issue.dependencyStatus,
	};
}

function detailScrollMax(
	model: TuiModel,
	selection: TuiSelection,
	options: { viewportHeight?: number } = {},
): number {
	const details = getSelectedDetails(model, selection);
	if (!details) return 0;
	const visibleLineCount = options.viewportHeight
		? visibleDetailLineCount(options.viewportHeight)
		: 40;
	return Math.max(
		0,
		stripFrontmatter(details.markdown).trimEnd().split("\n").length -
			visibleLineCount,
	);
}

function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---\n")) return markdown;
	const end = markdown.indexOf("\n---\n", 4);
	if (end === -1) return markdown;
	return markdown.slice(end + "\n---\n".length).trimStart();
}

function extractSection(markdown: string, section: string): string {
	const lines = markdown.split("\n");
	const start = lines.findIndex(
		(line) => line.trim().toLowerCase() === `## ${section}`.toLowerCase(),
	);
	if (start === -1) return "";
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index++) {
		if (/^##\s+/.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines
		.slice(start + 1, end)
		.join("\n")
		.trim();
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
