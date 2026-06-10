import React from "react";
import packageJson from "../../cli/package.json" with { type: "json" };
import type { TuiAppViewProps, TuiColumnsMode } from "./app-view-props.ts";
import { BoardView, Footer } from "./board-view.ts";
import { DetailPage } from "./detail-view.ts";
import {
	ArchivePrompt,
	GitHubMirrorPrompt,
	HelpPanel,
	LabelPrompt,
	MovePrompt,
	NotePrompt,
	WarningPanel,
} from "./modals.ts";
import { getSelectedDetails, loadTuiModel } from "./model.ts";
import {
	appendSelectedIssueNote,
	archiveSelectedIssue,
	beginSelectedIssueGitHubMirror,
	confirmSelectedIssueGitHubMirror,
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	refreshTuiModel,
	updateSelectedIssueLabels,
} from "./mutations.ts";
import {
	beginGitHubMirrorSubmission,
	footerMode,
	getMoveTargets,
	keyToTuiAction,
	moveLabelFocus,
	moveSelection,
	toggleFocusedLabel,
} from "./navigation.ts";
import { clamp, type TuiSelection } from "./selection.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

export type { TuiAppViewProps, TuiColumnsMode } from "./app-view-props.ts";
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
	WarningPanel,
} from "./modals.ts";
export type {
	TuiCard,
	TuiColumn,
	TuiDetails,
	TuiGithubIssue,
	TuiLabel,
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
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	refreshTuiModel,
	updateSelectedIssueLabels,
} from "./mutations.ts";
export {
	beginGitHubMirrorSubmission,
	getAdjacentMoveTarget,
	getMoveTargets,
	keyToDirection,
	keyToTuiAction,
	moveLabelFocus,
	moveSelection,
	toggleFocusedLabel,
} from "./navigation.ts";
export type {
	ArchivePromptViewModel,
	GitHubMirrorPromptViewModel,
	LabelPromptViewModel,
	MovePromptViewModel,
	NotePromptViewModel,
} from "./prompt-view-model.ts";
export {
	buildArchivePromptViewModel,
	buildGitHubMirrorPromptViewModel,
	buildLabelPromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
} from "./prompt-view-model.ts";
export type { MoveTarget, TuiSelection } from "./selection.ts";
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
	model,
	selection,
	theme = buildTuiTheme(),
	viewportHeight,
	viewportWidth,
	columns,
	noteTextareaRef,
	onNoteSubmit,
	detailScrollBoxRef,
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
						detailScrollBoxRef,
					})
				: React.createElement(BoardView, {
						model,
						selection,
						theme,
						viewportHeight,
						viewportWidth,
						columns,
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
		const submitNote = React.useCallback((body: string) => {
			const result = appendSelectedIssueNote({
				cwd: options.cwd,
				model: modelRef.current,
				selection: selectionRef.current,
				body,
			});
			modelRef.current = result.model;
			selectionRef.current = { ...result.selection, message: result.message };
			setModel(result.model);
			setSelection({ ...result.selection, message: result.message });
		}, []);
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

		useKeyboard((key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
			const action = keyToTuiAction(key.name, key.shift, key.ctrl);
			if (selection.helpOpen) {
				if (action === "escape" || action === "help") {
					setSelection((current) => moveSelection(model, current, action));
				}
				return;
			}
			if (selection.noteOpen) {
				if (action === "escape") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
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
			if (selection.githubConfirmOpen) {
				if (action === "help") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "escape") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "enter") {
					if (githubBusyRef.current) return;
					githubBusyRef.current = true;
					setSelection((current) => beginGitHubMirrorSubmission(current));
					void (async () => {
						try {
							const result = await confirmSelectedIssueGitHubMirror({
								cwd: options.cwd,
								model,
								selection,
							});
							setModel(result.model);
							setSelection({ ...result.selection, message: result.message });
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
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "escape") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "up" || action === "down") {
					setSelection((current) => moveLabelFocus(model, current, action));
					return;
				}
				if (key.name === "space") {
					setSelection((current) => toggleFocusedLabel(model, current));
					return;
				}
				if (action === "enter") {
					const result = updateSelectedIssueLabels({
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
			if (action === "save-note") return;
			if (action === "github") {
				if (githubBusyRef.current) return;
				githubBusyRef.current = true;
				const card =
					model.columns[selection.columnIndex]?.cards[selection.cardIndex];
				if (card?.githubIssue) {
					setSelection((current) => beginGitHubMirrorSubmission(current));
				}
				void (async () => {
					try {
						const result = await beginSelectedIssueGitHubMirror({
							cwd: options.cwd,
							model,
							selection,
						});
						setModel(result.model);
						setSelection({ ...result.selection, message: result.message });
					} finally {
						githubBusyRef.current = false;
					}
				})();
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
			viewportHeight: dimensions.height,
			viewportWidth: dimensions.width,
			columns: options.columns,
			noteTextareaRef,
			onNoteSubmit: submitNote,
			detailScrollBoxRef,
		});
	}

	root.render(React.createElement(App));
	process.once("SIGINT", stop);
}
