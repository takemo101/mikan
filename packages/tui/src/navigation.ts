import type { FooterMode } from "./formatting.ts";
import type { TuiModel } from "./model.ts";
import {
	applyRepositoryFilter,
	clamp,
	clampSelection,
	findSelectionByCardId,
	type MoveTarget,
	type TuiSelection,
} from "./selection.ts";

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
	| "edit-labels"
	| "archive"
	| "github"
	| "warnings"
	| "repository-filter"
	| "help"
	| "save-note"
	| "reload"
	| "quit";

type TuiDirection = "left" | "right" | "up" | "down" | "enter" | "escape";

type TuiSelectionAction =
	| TuiDirection
	| "move"
	| "append-note"
	| "edit-labels"
	| "archive"
	| "github"
	| "warnings"
	| "repository-filter"
	| "help";

function isPlainBoardSelection(selection: TuiSelection): boolean {
	return [
		selection.detailOpen,
		selection.moveOpen,
		selection.noteOpen,
		selection.labelOpen,
		selection.archiveOpen,
		selection.githubConfirmOpen,
		selection.repositoryFilterOpen,
		selection.warningsOpen,
		selection.helpOpen,
	].every((open) => !open);
}

export function columnScrollTargetKey(
	model: TuiModel,
	selection: TuiSelection,
): string | undefined {
	if (!isPlainBoardSelection(selection)) return undefined;
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	return card ? `${selection.columnIndex}:${card.id}` : undefined;
}

export function shouldSyncColumnScroll(
	previousTarget: string | undefined,
	nextTarget: string | undefined,
): boolean {
	return nextTarget !== undefined && previousTarget !== nextTarget;
}

export function verticalScrollDeltaForBounds(
	cardTop: number,
	cardBottom: number,
	viewportTop: number,
	viewportBottom: number,
): number {
	if (cardTop < viewportTop) return cardTop - viewportTop;
	if (cardBottom > viewportBottom) return cardBottom - viewportBottom;
	return 0;
}

export function cardIndexForColumnScrollDirection(
	cardIndex: number,
	cardCount: number,
	direction: "up" | "down",
): number {
	return clamp(
		cardIndex + (direction === "down" ? 1 : -1),
		0,
		Math.max(0, cardCount - 1),
	);
}

export function moveSelectionFromColumnScroll(
	model: TuiModel,
	selection: TuiSelection,
	direction: "up" | "down",
): TuiSelection {
	const cardCount = model.columns[selection.columnIndex]?.cards.length ?? 0;
	return {
		...selection,
		cardIndex: cardIndexForColumnScrollDirection(
			selection.cardIndex,
			cardCount,
			direction,
		),
	};
}

export function moveSelection(
	model: TuiModel,
	selection: TuiSelection,
	direction: TuiSelectionAction,
	_options: { viewportHeight?: number } = {},
): TuiSelection {
	if (direction === "enter") {
		const card =
			model.columns[selection.columnIndex]?.cards[selection.cardIndex];
		if (!card) {
			return { ...selection, detailOpen: false, message: "No Issue selected" };
		}
		return {
			...selection,
			detailOpen: true,
			detailScrollOffset: 0,
			message: undefined,
		};
	}
	if (
		selection.detailOpen &&
		!selection.moveOpen &&
		!selection.noteOpen &&
		!selection.labelOpen
	) {
		if (direction === "up" || direction === "down") {
			return selection;
		}
		if (direction === "left" || direction === "right") {
			return selection;
		}
	}
	if (direction === "escape") {
		if (selection.helpOpen) {
			return { ...selection, helpOpen: false };
		}
		if (selection.repositoryFilterOpen) {
			return {
				...selection,
				repositoryFilterOpen: false,
				repositoryFilterFocusIndex: undefined,
			};
		}
		if (selection.archiveOpen) {
			return { ...selection, archiveOpen: false };
		}
		if (selection.githubConfirmOpen) {
			return { ...selection, githubConfirmOpen: false };
		}
		if (selection.labelOpen) {
			return { ...selection, labelOpen: false };
		}
		if (selection.warningsOpen) {
			return { ...selection, warningsOpen: false };
		}
		return {
			...selection,
			detailOpen: false,
			moveOpen: false,
			noteOpen: false,
			noteDraft: undefined,
			labelOpen: false,
			message: selection.noteOpen ? undefined : selection.message,
		};
	}
	if (direction === "move") {
		return {
			...selection,
			archiveOpen: false,
			detailOpen: false,
			noteOpen: false,
			noteDraft: undefined,
			labelOpen: false,
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
			labelOpen: false,
			noteOpen: true,
			noteDraft: "",
			message: undefined,
		};
	}
	if (direction === "edit-labels") {
		const card =
			model.columns[selection.columnIndex]?.cards[selection.cardIndex];
		const knownLabelIds = new Set(
			(model.labels ?? []).map((label) => label.id),
		);
		return {
			...selection,
			archiveOpen: false,
			githubConfirmOpen: false,
			moveOpen: false,
			noteOpen: false,
			noteDraft: undefined,
			labelOpen: true,
			labelFocusIndex: 0,
			labelDraftIds:
				card?.labels.filter((label) => knownLabelIds.has(label)) ?? [],
		};
	}
	if (direction === "archive") {
		return {
			...selection,
			archiveOpen: true,
			moveOpen: false,
			noteOpen: false,
			noteDraft: undefined,
			labelOpen: false,
			githubConfirmOpen: false,
		};
	}
	if (direction === "github") {
		return {
			...selection,
			archiveOpen: false,
			moveOpen: false,
			noteOpen: false,
			noteDraft: undefined,
			labelOpen: false,
			githubConfirmOpen: true,
		};
	}
	if (direction === "warnings") {
		return model.warnings.length > 0
			? { ...selection, warningsOpen: !selection.warningsOpen }
			: { ...selection, message: "No warnings" };
	}
	if (direction === "repository-filter") {
		if (!isWorkspaceMode(model)) {
			return {
				...selection,
				message: "Repository filter needs workspace mode",
			};
		}
		return {
			...selection,
			archiveOpen: false,
			detailOpen: false,
			githubConfirmOpen: false,
			moveOpen: false,
			noteOpen: false,
			noteDraft: undefined,
			labelOpen: false,
			repositoryFilterOpen: true,
			repositoryFilterFocusIndex: repositoryFilterFocusForActive(
				model,
				selection,
			),
			message: undefined,
		};
	}
	if (direction === "help") {
		return { ...selection, helpOpen: !selection.helpOpen };
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

export function beginGitHubMirrorSubmission(
	selection: TuiSelection,
): TuiSelection {
	return {
		...selection,
		githubConfirmOpen: false,
		githubBusy: true,
		message: "GitHub mirror running...",
	};
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

export function moveLabelFocus(
	model: TuiModel,
	selection: TuiSelection,
	direction: "up" | "down",
): TuiSelection {
	if (!selection.labelOpen) return selection;
	return {
		...selection,
		labelFocusIndex: clamp(
			(selection.labelFocusIndex ?? 0) + (direction === "down" ? 1 : -1),
			0,
			Math.max(0, (model.labels ?? []).length - 1),
		),
	};
}

export function toggleFocusedLabel(
	model: TuiModel,
	selection: TuiSelection,
): TuiSelection {
	if (!selection.labelOpen) return selection;
	const label = (model.labels ?? [])[selection.labelFocusIndex ?? 0];
	if (!label) return selection;
	const current = new Set(selection.labelDraftIds ?? []);
	if (current.has(label.id)) current.delete(label.id);
	else current.add(label.id);
	return { ...selection, labelDraftIds: [...current] };
}

/** A project is in workspace mode once it has at least one configured Repository. */
export function isWorkspaceMode(model: TuiModel): boolean {
	return (model.repositories?.length ?? 0) > 0;
}

/**
 * Repository filter choices in modal order: `All repositories` (undefined) first,
 * then each configured Repository ID in config order.
 */
export function repositoryFilterOptions(
	model: TuiModel,
): (string | undefined)[] {
	return [undefined, ...(model.repositories ?? []).map((repo) => repo.id)];
}

function repositoryFilterFocusForActive(
	model: TuiModel,
	selection: TuiSelection,
): number {
	const options = repositoryFilterOptions(model);
	const index = options.indexOf(selection.repositoryFilter);
	return index === -1 ? 0 : index;
}

export function moveRepositoryFilterFocus(
	model: TuiModel,
	selection: TuiSelection,
	direction: "up" | "down",
): TuiSelection {
	if (!selection.repositoryFilterOpen) return selection;
	return {
		...selection,
		repositoryFilterFocusIndex: clamp(
			(selection.repositoryFilterFocusIndex ?? 0) +
				(direction === "down" ? 1 : -1),
			0,
			Math.max(0, repositoryFilterOptions(model).length - 1),
		),
	};
}

/**
 * Apply the focused Repository filter choice and close the modal. The previously
 * selected Issue is preserved by ID when it survives the new filter; otherwise the
 * selection clamps safely into the filtered board. Pass the full (unfiltered) model.
 */
export function applyRepositoryFilterChoice(
	model: TuiModel,
	selection: TuiSelection,
): TuiSelection {
	const options = repositoryFilterOptions(model);
	const focusIndex = clamp(
		selection.repositoryFilterFocusIndex ?? 0,
		0,
		Math.max(0, options.length - 1),
	);
	const nextFilter = options[focusIndex];
	const currentBoard = applyRepositoryFilter(model, selection.repositoryFilter);
	const selectedId =
		currentBoard.columns[selection.columnIndex]?.cards[selection.cardIndex]?.id;
	const nextBoard = applyRepositoryFilter(model, nextFilter);
	const located = selectedId
		? findSelectionByCardId(nextBoard, selectedId)
		: undefined;
	const base = located ?? clampSelection(nextBoard, selection);
	return {
		...selection,
		columnIndex: base.columnIndex,
		cardIndex: base.cardIndex,
		repositoryFilter: nextFilter,
		repositoryFilterOpen: false,
		repositoryFilterFocusIndex: undefined,
		detailOpen: false,
	};
}

/**
 * Translate a filtered-board selection into full-model indices by Issue ID so the
 * shared mutation/refresh helpers (which reload the full board) resolve the right
 * Issue. A passthrough when no filter is active. Columns are never filtered, so
 * only the Card index can shift.
 */
export function toFullIndexSelection(
	model: TuiModel,
	selection: TuiSelection,
): TuiSelection {
	if (!selection.repositoryFilter) return selection;
	const board = applyRepositoryFilter(model, selection.repositoryFilter);
	const card = board.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return selection;
	const located = findSelectionByCardId(model, card.id);
	return located
		? {
				...selection,
				columnIndex: located.columnIndex,
				cardIndex: located.cardIndex,
			}
		: selection;
}

/**
 * Re-map a selection produced against the full (reloaded) model back into the
 * active filtered board, preserving the selected Issue by ID when possible. A
 * passthrough when no filter is active. Used after mutations/refreshes so stored
 * indices stay consistent with the filtered board the user sees.
 */
export function reconcileFilteredSelection(
	model: TuiModel,
	selection: TuiSelection,
	filter: string | undefined,
): TuiSelection {
	if (!filter) return { ...selection, repositoryFilter: filter };
	const board = applyRepositoryFilter(model, filter);
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	const located = card ? findSelectionByCardId(board, card.id) : undefined;
	const base = located ?? clampSelection(board, selection);
	return {
		...selection,
		columnIndex: base.columnIndex,
		cardIndex: base.cardIndex,
		repositoryFilter: filter,
	};
}

export function footerMode(selection: TuiSelection): FooterMode {
	if (selection.noteOpen) return "note-modal";
	if (
		selection.moveOpen ||
		selection.labelOpen ||
		selection.archiveOpen ||
		selection.githubConfirmOpen ||
		selection.repositoryFilterOpen
	) {
		return "modal";
	}
	return selection.detailOpen ? "detail" : "board";
}

export function keyToTuiAction(
	keyName: string | undefined,
	shift = false,
	ctrl = false,
): TuiAction | undefined {
	if (ctrl && keyName === "s") return "save-note";
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
		case "e":
			return "edit-labels";
		case "a":
			return "archive";
		case "g":
			return "github";
		case "w":
			return "warnings";
		case "f":
			return "repository-filter";
		case "?":
			return "help";
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
		action === "edit-labels" ||
		action === "archive" ||
		action === "github" ||
		action === "warnings" ||
		action === "repository-filter" ||
		action === "help" ||
		action === "save-note" ||
		action === "reload" ||
		action === "quit"
	) {
		return undefined;
	}
	return action;
}
