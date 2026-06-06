import { type FooterMode, visibleDetailLineCount } from "./formatting.ts";
import {
	getSelectedDetails,
	stripFrontmatter,
	type TuiModel,
} from "./model.ts";
import { clamp, type MoveTarget, type TuiSelection } from "./selection.ts";

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
	| "help"
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
	| "help";

export function moveSelection(
	model: TuiModel,
	selection: TuiSelection,
	direction: TuiSelectionAction,
	options: { viewportHeight?: number } = {},
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
			return {
				...selection,
				detailScrollOffset: clamp(
					(selection.detailScrollOffset ?? 0) + (direction === "down" ? 1 : -1),
					0,
					detailScrollMax(model, selection, options),
				),
			};
		}
		if (direction === "left" || direction === "right") {
			return selection;
		}
	}
	if (direction === "escape") {
		if (selection.helpOpen) {
			return { ...selection, helpOpen: false };
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
			labelOpen: false,
		};
	}
	if (direction === "move") {
		return {
			...selection,
			archiveOpen: false,
			detailOpen: false,
			noteOpen: false,
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
			labelOpen: false,
			githubConfirmOpen: true,
		};
	}
	if (direction === "warnings") {
		return model.warnings.length > 0
			? { ...selection, warningsOpen: !selection.warningsOpen }
			: { ...selection, message: "No warnings" };
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

export function footerMode(selection: TuiSelection): FooterMode {
	if (
		selection.moveOpen ||
		selection.noteOpen ||
		selection.labelOpen ||
		selection.archiveOpen ||
		selection.githubConfirmOpen
	) {
		return "modal";
	}
	return selection.detailOpen ? "detail" : "board";
}

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
		case "e":
			return "edit-labels";
		case "a":
			return "archive";
		case "g":
			return "github";
		case "w":
			return "warnings";
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
		action === "help" ||
		action === "reload" ||
		action === "quit"
	) {
		return undefined;
	}
	return action;
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
