import React from "react";
import packageJson from "../../cli/package.json" with { type: "json" };
import type {
	TuiAppViewProps,
	TuiColumnScrollDirection,
	TuiColumnsMode,
} from "./app-view-props.ts";
import { BoardView, Footer } from "./board-view.ts";
import { DetailPage } from "./detail-view.ts";
import {
	ArchivePrompt,
	GitHubMirrorPrompt,
	HelpPanel,
	LabelPrompt,
	MovePrompt,
	NotePrompt,
	RepositoryFilterPrompt,
	WarningPanel,
} from "./modals.ts";
import { getSelectedDetails, loadTuiModel, type TuiModel } from "./model.ts";
import {
	appendSelectedIssueNote,
	archiveSelectedIssue,
	beginSelectedIssueGitHubMirror,
	confirmSelectedIssueGitHubMirror,
	isNoopTuiRefresh,
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	refreshTuiModel,
	tuiModelFileFingerprint,
	updateSelectedIssueLabels,
} from "./mutations.ts";
import {
	applyRepositoryFilterChoice,
	beginGitHubMirrorSubmission,
	columnScrollTargetKey,
	footerMode,
	getMoveTargets,
	keyToTuiAction,
	moveLabelFocus,
	moveRepositoryFilterFocus,
	moveSelection,
	moveSelectionFromColumnScroll,
	reconcileFilteredSelection,
	shouldSyncColumnScroll,
	toFullIndexSelection,
	toggleFocusedLabel,
	verticalScrollDeltaForBounds,
} from "./navigation.ts";
import {
	applyRepositoryFilter,
	clamp,
	type TuiSelection,
} from "./selection.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

export type {
	TuiAppViewProps,
	TuiColumnScrollDirection,
	TuiColumnsMode,
} from "./app-view-props.ts";
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
// Public facade re-exports for extracted detail and modal components (MIK-082).
export {
	DetailPage,
	DetailPane,
	DetailView,
	LogPane,
} from "./detail-view.ts";
export type {
	DetailPageOptions,
	DetailPageViewModel,
	DetailViewModel,
} from "./detail-view-model.ts";
export {
	buildDetailPageViewModel,
	buildDetailViewModel,
} from "./detail-view-model.ts";
export type { FooterMode } from "./formatting.ts";
export {
	formatRepositoryFilter,
	MAX_VISIBLE_COLUMNS,
	MIN_COLUMN_WIDTH,
	MIN_VISIBLE_COLUMNS,
	visibleCardCountForViewport,
	visibleColumnCountForViewport,
} from "./formatting.ts";
export {
	ArchivePrompt,
	GitHubMirrorPrompt,
	HelpPanel,
	LabelPrompt,
	MovePrompt,
	NotePrompt,
	RepositoryFilterPrompt,
	WarningPanel,
} from "./modals.ts";
export type {
	TuiCard,
	TuiColumn,
	TuiDetails,
	TuiGithubIssue,
	TuiLabel,
	TuiModel,
	TuiRepository,
	TuiWarning,
} from "./model.ts";
export {
	buildTuiModel,
	getSelectedDetails,
	loadTuiModel,
} from "./model.ts";
export type {
	MoveSelectedIssueResult,
	TuiGitHubMirrorOperations,
	TuiMutationResult,
	TuiRefreshResult,
} from "./mutations.ts";
// Public facade re-exports for extracted Issue mutation operations (MIK-080).
export {
	appendSelectedIssueNote,
	archiveSelectedIssue,
	beginSelectedIssueGitHubMirror,
	confirmSelectedIssueGitHubMirror,
	isNoopTuiRefresh,
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	refreshTuiModel,
	tuiModelFileFingerprint,
	updateSelectedIssueLabels,
} from "./mutations.ts";
export {
	applyRepositoryFilterChoice,
	beginGitHubMirrorSubmission,
	cardIndexForColumnScrollDirection,
	columnScrollTargetKey,
	footerMode,
	getAdjacentMoveTarget,
	getMoveTargets,
	isWorkspaceMode,
	keyToDirection,
	keyToTuiAction,
	moveLabelFocus,
	moveRepositoryFilterFocus,
	moveSelection,
	moveSelectionFromColumnScroll,
	reconcileFilteredSelection,
	repositoryFilterOptions,
	shouldSyncColumnScroll,
	toFullIndexSelection,
	toggleFocusedLabel,
	verticalScrollDeltaForBounds,
} from "./navigation.ts";
export type {
	ArchivePromptViewModel,
	GitHubMirrorPromptViewModel,
	LabelPromptViewModel,
	MovePromptViewModel,
	NotePromptViewModel,
	RepositoryFilterPromptViewModel,
} from "./prompt-view-model.ts";
export {
	buildArchivePromptViewModel,
	buildGitHubMirrorPromptViewModel,
	buildLabelPromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
	buildRepositoryFilterPromptViewModel,
} from "./prompt-view-model.ts";
export type { MoveTarget, TuiSelection } from "./selection.ts";
export { applyRepositoryFilter } from "./selection.ts";
// Public facade re-export for the extracted plain-text renderer (MIK-083).
export { renderTuiText } from "./text-render.ts";
export type { TuiTheme } from "./theme.ts";
// Public facade re-exports for extracted model, selection, theme, and view
// model Modules (MIK-077). Behavior and exported names are unchanged.
export { buildTuiTheme } from "./theme.ts";

export const TUI_VERSION = packageJson.version;

export function createTuiAppElement(
	props: TuiAppViewProps,
): React.ReactElement {
	return React.createElement(TuiAppView, props);
}

export function TuiAppView({
	model: fullModel,
	selection,
	theme = buildTuiTheme(),
	viewportHeight,
	viewportWidth,
	columns,
	noteTextareaRef,
	onNoteSubmit,
	detailScrollBoxRef,
	columnScrollBoxRef,
	onColumnScroll,
}: TuiAppViewProps): React.ReactElement {
	const model = applyRepositoryFilter(fullModel, selection.repositoryFilter);
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
						detailScrollBoxRef,
					})
				: React.createElement(BoardView, {
						model,
						selection,
						theme,
						viewportHeight,
						viewportWidth,
						columns,
						columnScrollBoxRef,
						onColumnScroll,
					}),
		),
		selection.moveOpen
			? React.createElement(MovePrompt, { model, selection, theme })
			: undefined,
		selection.noteOpen
			? React.createElement(NotePrompt, {
					model,
					selection,
					theme,
					noteTextareaRef,
					onNoteSubmit,
				})
			: undefined,
		selection.labelOpen
			? React.createElement(LabelPrompt, { model, selection, theme })
			: undefined,
		selection.archiveOpen
			? React.createElement(ArchivePrompt, { model, selection, theme })
			: undefined,
		selection.githubConfirmOpen
			? React.createElement(GitHubMirrorPrompt, { model, selection, theme })
			: undefined,
		selection.repositoryFilterOpen
			? React.createElement(RepositoryFilterPrompt, { model, selection, theme })
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
		style: { color: theme.interactive.accent, flexShrink: 0 },
		content: `🍊 mikan v${TUI_VERSION}`,
	});
}

export async function launchTui(
	options: { cwd?: string; pollMs?: number; columns?: TuiColumnsMode } = {},
): Promise<void> {
	const { createCliRenderer } = await import("@opentui/core");
	const { createRoot, useKeyboard, useTerminalDimensions } = await import(
		"@opentui/react"
	);
	const renderer = await createCliRenderer();
	const pollMs = options.pollMs ?? 1000;
	const root = createRoot(renderer);
	const stop = () => {
		root.unmount();
		renderer.destroy();
	};

	function App() {
		const dimensions = useTerminalDimensions();
		const [model, setModel] = React.useState(() => loadTuiModel(options.cwd));
		const [selection, setSelection] = React.useState<TuiSelection>({
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
		});
		const modelRef = React.useRef(model);
		const selectionRef = React.useRef(selection);
		const githubBusyRef = React.useRef(false);
		const noteTextareaRef = React.useRef<{ plainText: string } | null>(null);
		const detailScrollBoxRef = React.useRef<
			import("@opentui/core").ScrollBoxRenderable | null
		>(null);
		const columnScrollBoxRef = React.useRef<
			import("@opentui/core").ScrollBoxRenderable | null
		>(null);
		const columnScrollTargetRef = React.useRef<string | undefined>(undefined);
		// Detail bodies are read from disk during render, not stored in the model,
		// so the poll interval also tracks Issue file freshness to notice external
		// body-only edits that leave the model unchanged (MIK-164).
		const fileFingerprintRef = React.useRef<string | null>(null);
		if (fileFingerprintRef.current === null) {
			fileFingerprintRef.current = tuiModelFileFingerprint(model);
		}
		// Mutations/refreshes reload and resolve Issues against the full board, so
		// inputs are translated to full-model indices and results are re-mapped back
		// into the active Repository filter. Both are passthroughs when no filter is
		// active, keeping single-project behavior unchanged.
		const commitResult = React.useCallback(
			(result: {
				model: TuiModel;
				selection: TuiSelection;
				message?: string;
			}) => {
				const filter = selectionRef.current.repositoryFilter;
				const reconciled = reconcileFilteredSelection(
					result.model,
					result.selection,
					filter,
				);
				const next =
					result.message !== undefined
						? { ...reconciled, message: result.message }
						: reconciled;
				modelRef.current = result.model;
				selectionRef.current = next;
				fileFingerprintRef.current = tuiModelFileFingerprint(result.model);
				setModel(result.model);
				setSelection(next);
			},
			[],
		);
		const submitNote = React.useCallback(
			(body: string) => {
				const result = appendSelectedIssueNote({
					cwd: options.cwd,
					model: modelRef.current,
					selection: toFullIndexSelection(
						modelRef.current,
						selectionRef.current,
					),
					body,
				});
				commitResult(result);
			},
			[commitResult],
		);
		modelRef.current = model;
		selectionRef.current = selection;

		React.useEffect(() => {
			const board = applyRepositoryFilter(model, selection.repositoryFilter);
			const nextTarget = columnScrollTargetKey(board, selection);
			if (!shouldSyncColumnScroll(columnScrollTargetRef.current, nextTarget)) {
				columnScrollTargetRef.current = nextTarget;
				return;
			}
			columnScrollTargetRef.current = nextTarget;
			const card =
				board.columns[selection.columnIndex]?.cards[selection.cardIndex];
			const scrollBox = columnScrollBoxRef.current;
			const selectedCard = card
				? scrollBox?.content.findDescendantById(`card-${card.id}`)
				: undefined;
			if (!scrollBox || !selectedCard) return;
			const verticalDelta = verticalScrollDeltaForBounds(
				selectedCard.y,
				selectedCard.y + selectedCard.height,
				scrollBox.viewport.y,
				scrollBox.viewport.y + scrollBox.viewport.height,
			);
			if (verticalDelta !== 0) {
				scrollBox.scrollBy({ x: 0, y: verticalDelta });
			}
		}, [model, selection]);

		const syncCursorToColumnScroll = React.useCallback(
			(direction: TuiColumnScrollDirection) => {
				setSelection((current) => {
					const board = applyRepositoryFilter(
						modelRef.current,
						current.repositoryFilter,
					);
					const next = moveSelectionFromColumnScroll(board, current, direction);
					if (
						next.columnIndex === current.columnIndex &&
						next.cardIndex === current.cardIndex
					) {
						return current;
					}
					selectionRef.current = next;
					return next;
				});
			},
			[],
		);

		React.useEffect(() => {
			const interval = setInterval(() => {
				const fullSelection = toFullIndexSelection(
					modelRef.current,
					selectionRef.current,
				);
				const refreshed = refreshTuiModel({
					cwd: options.cwd,
					model: modelRef.current,
					selection: fullSelection,
				});
				// Idle polling must not touch React state: each commit rerenders the
				// OpenTUI tree and leaks memory over time (MIK-164). An unchanged
				// model is not enough to skip — detail bodies live on disk, so a
				// body-only edit only shows up in the file fingerprint.
				if (
					isNoopTuiRefresh(
						{ model: modelRef.current, selection: fullSelection },
						refreshed,
					) &&
					tuiModelFileFingerprint(refreshed.model) ===
						fileFingerprintRef.current
				) {
					return;
				}
				commitResult(refreshed);
			}, pollMs);
			return () => clearInterval(interval);
		}, [commitResult]);

		useKeyboard((key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
			const action = keyToTuiAction(key.name, key.shift, key.ctrl);
			// `board` is the model the user sees (Repository filter applied); `selection`
			// indexes into it. `fullSelection` re-targets the same Issue in the unfiltered
			// model for the shared mutation helpers. Both equal their inputs with no filter.
			const board = applyRepositoryFilter(model, selection.repositoryFilter);
			const fullSelection = toFullIndexSelection(model, selection);
			if (selection.helpOpen) {
				if (action === "escape" || action === "help") {
					setSelection((current) => moveSelection(board, current, action));
				}
				return;
			}
			if (selection.repositoryFilterOpen) {
				if (action === "up" || action === "down") {
					setSelection((current) =>
						moveRepositoryFilterFocus(board, current, action),
					);
					return;
				}
				if (action === "enter") {
					setSelection((current) =>
						applyRepositoryFilterChoice(model, current),
					);
					return;
				}
				if (action === "escape") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				return;
			}
			if (selection.noteOpen) {
				if (action === "escape") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				return;
			}
			if (selection.archiveOpen) {
				if (action === "help") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				if (action === "escape") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				if (action === "enter") {
					commitResult(
						archiveSelectedIssue({
							cwd: options.cwd,
							model,
							selection: fullSelection,
						}),
					);
					return;
				}
				return;
			}
			if (selection.githubConfirmOpen) {
				if (action === "help") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				if (action === "escape") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				if (action === "enter") {
					if (githubBusyRef.current) return;
					githubBusyRef.current = true;
					setSelection((current) => beginGitHubMirrorSubmission(current));
					void (async () => {
						try {
							commitResult(
								await confirmSelectedIssueGitHubMirror({
									cwd: options.cwd,
									model,
									selection: fullSelection,
								}),
							);
						} finally {
							githubBusyRef.current = false;
						}
					})();
					return;
				}
				return;
			}
			if (selection.labelOpen) {
				if (action === "help") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				if (action === "escape") {
					setSelection((current) => moveSelection(board, current, action));
					return;
				}
				if (action === "up" || action === "down") {
					setSelection((current) => moveLabelFocus(board, current, action));
					return;
				}
				if (key.name === "space") {
					setSelection((current) => toggleFocusedLabel(board, current));
					return;
				}
				if (action === "enter") {
					commitResult(
						updateSelectedIssueLabels({
							cwd: options.cwd,
							model,
							selection: fullSelection,
						}),
					);
					return;
				}
				return;
			}
			if (!action) return;
			if (
				selection.detailOpen &&
				!selection.moveOpen &&
				!selection.noteOpen &&
				!selection.labelOpen &&
				(action === "up" || action === "down")
			) {
				detailScrollBoxRef.current?.scrollBy(action === "down" ? 1 : -1);
				return;
			}
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
						Math.max(0, getMoveTargets(board, current).length - 1),
					),
				}));
				return;
			}
			if (selection.moveOpen && action === "enter") {
				const targets = getMoveTargets(board, selection);
				const target = targets[selection.moveTargetIndex ?? 0];
				if (!target) return;
				commitResult(
					moveSelectedIssue({
						cwd: options.cwd,
						model,
						selection: fullSelection,
						targetStatus: target.id,
					}),
				);
				return;
			}
			if (action === "reload") {
				commitResult(
					refreshTuiModel({
						cwd: options.cwd,
						model,
						selection: fullSelection,
					}),
				);
				return;
			}
			if (action === "move-left" || action === "move-right") {
				commitResult(
					moveSelectedIssueByDirection({
						cwd: options.cwd,
						model,
						selection: fullSelection,
						direction: action === "move-left" ? "left" : "right",
					}),
				);
				return;
			}
			if (action === "archive") {
				setSelection((current) => moveSelection(board, current, action));
				return;
			}
			if (action === "save-note") return;
			if (action === "github") {
				if (githubBusyRef.current) return;
				githubBusyRef.current = true;
				const card =
					board.columns[selection.columnIndex]?.cards[selection.cardIndex];
				if (card?.githubIssue) {
					setSelection((current) => beginGitHubMirrorSubmission(current));
				}
				void (async () => {
					try {
						commitResult(
							await beginSelectedIssueGitHubMirror({
								cwd: options.cwd,
								model,
								selection: fullSelection,
							}),
						);
					} finally {
						githubBusyRef.current = false;
					}
				})();
				return;
			}
			setSelection((current) =>
				moveSelection(board, current, action, {
					viewportHeight: renderer.height,
				}),
			);
		});

		return createTuiAppElement({
			model,
			selection,
			viewportHeight: dimensions.height,
			viewportWidth: dimensions.width,
			columns: options.columns,
			noteTextareaRef,
			columnScrollBoxRef,
			onColumnScroll: syncCursorToColumnScroll,
			onNoteSubmit: submitNote,
			detailScrollBoxRef,
		});
	}

	root.render(React.createElement(App));
	process.once("SIGINT", stop);
}
