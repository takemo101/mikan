import { fg, StyledText } from "@opentui/core";
import React from "react";
import packageJson from "../package.json" with { type: "json" };
import type { TuiAppViewProps } from "./app-view-props.ts";
import { BoardView, Footer } from "./board-view.ts";
import {
	buildBoardViewModel,
	formatWarningSummary,
} from "./board-view-model.ts";
import {
	buildDetailPageViewModel,
	buildDetailViewModel,
	type DetailPageViewModel,
} from "./detail-view-model.ts";
import {
	boxLine,
	contentLine,
	footerText,
	formatLabels,
} from "./formatting.ts";
import {
	cardDependencyStatus,
	cardDependsOn,
	cardUnmetDependencies,
	getSelectedDetails,
	loadTuiModel,
	type TuiDetails,
	type TuiModel,
} from "./model.ts";
import {
	appendSelectedIssueNote,
	archiveSelectedIssue,
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	refreshTuiModel,
} from "./mutations.ts";
import {
	applyNoteInput,
	footerMode,
	getMoveTargets,
	keyToTuiAction,
	moveSelection,
} from "./navigation.ts";
import {
	buildArchivePromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
} from "./prompt-view-model.ts";
import { clamp, type TuiSelection } from "./selection.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

export type { TuiAppViewProps } from "./app-view-props.ts";
export type { FooterProps } from "./board-view.ts";
// Public facade re-exports for extracted board rendering components (MIK-081).
export {
	BoardView,
	ColumnPane,
	Footer,
	IssueCard,
} from "./board-view.ts";
export type {
	BoardCardView,
	BoardColumnView,
	BoardViewModel,
	BoardViewOptions,
} from "./board-view-model.ts";
// Public facade re-exports for extracted view model builders (MIK-079).
export {
	buildBoardViewModel,
	columnWidthPercent,
} from "./board-view-model.ts";
export type {
	DetailPageOptions,
	DetailPageViewModel,
	DetailViewModel,
} from "./detail-view-model.ts";
export {
	buildDetailPageViewModel,
	buildDetailViewModel,
} from "./detail-view-model.ts";
export type {
	TuiCard,
	TuiColumn,
	TuiDetails,
	TuiModel,
	TuiWarning,
} from "./model.ts";
export {
	buildTuiModel,
	getSelectedDetails,
	loadTuiModel,
} from "./model.ts";
export type {
	MoveSelectedIssueResult,
	TuiMutationResult,
	TuiRefreshResult,
} from "./mutations.ts";
// Public facade re-exports for extracted Issue mutation operations (MIK-080).
export {
	appendSelectedIssueNote,
	archiveSelectedIssue,
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	refreshTuiModel,
} from "./mutations.ts";
export {
	applyNoteInput,
	getAdjacentMoveTarget,
	getMoveTargets,
	keyToDirection,
	keyToTuiAction,
	moveSelection,
} from "./navigation.ts";
export type {
	ArchivePromptViewModel,
	MovePromptViewModel,
	NotePromptViewModel,
} from "./prompt-view-model.ts";
export {
	buildArchivePromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
} from "./prompt-view-model.ts";
export type { MoveTarget, TuiSelection } from "./selection.ts";
export type { TuiTheme } from "./theme.ts";
// Public facade re-exports for extracted model, selection, theme, and view
// model Modules (MIK-077). Behavior and exported names are unchanged.
export { buildTuiTheme } from "./theme.ts";

export const TUI_VERSION = packageJson.version;

export function renderTuiText(
	model: TuiModel,
	selection: TuiSelection,
): string {
	const lines = [
		"mikan board",
		formatWarningSummary(model.warnings),
		...renderBoard(model, selection),
	].filter(Boolean);
	if (selection.moveOpen) {
		lines.push("", ...renderMoveInteraction(model, selection));
	}
	if (selection.noteOpen) {
		lines.push("", ...renderNoteInteraction(model, selection));
	}
	if (selection.archiveOpen) {
		lines.push("", ...renderArchiveInteraction(model, selection));
	}
	if (selection.warningsOpen) {
		lines.push("", ...renderWarningDetails(model));
	}
	if (selection.helpOpen) {
		lines.push("", ...renderKeyHelp());
	}
	lines.push(
		"",
		[footerText(footerMode(selection)), selection.message]
			.filter(Boolean)
			.join("    "),
	);
	const details = selection.detailOpen
		? getSelectedDetails(model, selection)
		: undefined;
	if (details) {
		lines.push("", ...renderDetails(details));
	}
	return `${lines.join("\n")}\n`;
}

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
		selection.warningsOpen
			? React.createElement(WarningPanel, { model, theme })
			: undefined,
		selection.helpOpen ? React.createElement(HelpPanel, { theme }) : undefined,
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

function detailLabelsText(page: DetailPageViewModel): string {
	return page.labelsText
		? formatLabels(page.labelsText.split(", ").filter(Boolean))
		: "none";
}

function detailDependencyText(page: DetailPageViewModel): string {
	if (page.unmetDependenciesText)
		return `deps unmet ${page.unmetDependenciesText}`;
	return page.dependsOnText ? `deps ${page.dependencyStatus}` : "";
}

function detailStatusColor(status: string, theme: TuiTheme): string {
	if (status === "completed") return theme.feedback.success;
	if (status === "blocked") return theme.feedback.warning;
	if (status === "active") return theme.interactive.accent;
	return theme.base.muted;
}

function detailTitleContent(
	page: DetailPageViewModel,
	theme: TuiTheme,
): StyledText {
	const chunks = [
		fg(theme.interactive.accent)(page.id),
		fg(theme.base.muted)(" │ "),
		fg(theme.base.text)(page.title),
	];
	if (page.lineRangeText) {
		chunks.push(fg(theme.base.muted)(" │ "));
		chunks.push(fg(theme.base.muted)(page.lineRangeText));
	}
	return new StyledText(chunks);
}

function detailMetaContent(
	page: DetailPageViewModel,
	theme: TuiTheme,
): StyledText {
	const chunks = [
		fg(detailStatusColor(page.status, theme))(page.status),
		fg(theme.base.muted)(" · labels "),
		fg(theme.base.muted)(detailLabelsText(page)),
	];
	const dependency = detailDependencyText(page);
	if (dependency) chunks.push(fg(theme.feedback.warning)(` · ${dependency}`));
	if (page.warningCount > 0) {
		chunks.push(fg(theme.feedback.warning)(` · warnings ${page.warningCount}`));
	}
	return new StyledText(chunks);
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
				content: detailTitleContent(page, theme),
			}),
			React.createElement("text", {
				content: detailMetaContent(page, theme),
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

export function HelpPanel(props: { theme?: TuiTheme }): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "help-panel-backdrop",
			style: modalBackdropStyle(theme),
		},
		React.createElement(
			"box",
			{
				id: "help-panel",
				title: "Key help",
				border: true,
				style: modalStyle(theme),
			},
			React.createElement("text", { content: renderKeyHelp().join("\n") }),
		),
	);
}

export function WarningPanel(props: {
	model: TuiModel;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "warning-panel",
			title: "Warning details",
			border: true,
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.feedback.warning,
				flexDirection: "column",
			},
		},
		React.createElement("text", {
			content:
				props.model.warnings.length > 0
					? props.model.warnings.map((warning) => `! ${warning}`).join("\n")
					: "No warnings",
		}),
	);
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

function renderWarningDetails(model: TuiModel): string[] {
	return [
		"Warning details",
		...(model.warnings.length > 0
			? model.warnings.map((warning) => `! ${warning}`)
			: ["No warnings"]),
	];
}

function renderKeyHelp(): string[] {
	return [
		"Key help",
		"↑/↓ or j/k card/scroll",
		"←/→ or h/l column",
		"enter detail/confirm",
		"esc back/cancel",
		"H/L move Issue",
		"m move menu",
		"n append Note",
		"a archive Issue",
		"w warning details",
		"r reload",
		"q quit",
	];
}

function renderDetails(details: TuiDetails): string[] {
	return [
		`Detail: ${details.card.id} ${details.card.title}`,
		"esc back",
		"",
		"## Dependencies",
		`Depends On: ${cardDependsOn(details.card).length > 0 ? cardDependsOn(details.card).join(", ") : "none"}`,
		`Unmet: ${cardUnmetDependencies(details.card).length > 0 ? cardUnmetDependencies(details.card).join(", ") : "none"}`,
		`Dependency readiness: ${cardDependencyStatus(details.card)}`,
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
								cardDependencyStatus(card) === "blocked" ? " deps!" : ""
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
			if (selection.helpOpen) {
				if (action === "escape" || action === "help") {
					setSelection((current) => moveSelection(model, current, action));
				}
				return;
			}
			if (selection.noteOpen) {
				if (action === "help") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
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
				if (action === "help") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
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
