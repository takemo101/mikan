import { appendIssue, moveIssue } from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import { loadTuiModel, type TuiModel } from "./model.ts";
import { getAdjacentMoveTarget } from "./navigation.ts";
import {
	clampSelection,
	findSelectionByCardId,
	type TuiSelection,
} from "./selection.ts";

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
			warningsOpen: options.selection.warningsOpen,
			helpOpen: options.selection.helpOpen,
		},
	};
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
