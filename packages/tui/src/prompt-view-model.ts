import type { TuiModel } from "./model.ts";
import { getMoveTargets } from "./navigation.ts";
import type { MoveTarget, TuiSelection } from "./selection.ts";

export type MovePromptViewModel = {
	title: string;
	focused: boolean;
	targets: (MoveTarget & { selected: boolean })[];
	hint: string;
};

export type NotePromptViewModel = {
	title: string;
	focused: boolean;
	inputLines: string[];
	feedback?: string;
	hint: string;
};

export type LabelPromptViewModel = {
	title: string;
	focused: boolean;
	labels: {
		id: string;
		title: string;
		checked: boolean;
		focused: boolean;
	}[];
	unknownLabels: string[];
	emptyMessage?: string;
	hint: string;
};

export type ArchivePromptViewModel = {
	title: string;
	focused: boolean;
	body: string;
	hint: string;
};

export type GitHubMirrorPromptViewModel = {
	title: string;
	focused: boolean;
	body: string;
	hint: string;
};

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

const NOTE_INPUT_VISIBLE_LINES = 5;

export function buildNotePromptViewModel(
	model: TuiModel,
	selection: TuiSelection,
): NotePromptViewModel | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	const draft = selection.noteDraft ?? "";
	return {
		title: `Append note to ${card.id}`,
		focused: Boolean(selection.noteOpen),
		inputLines: renderNoteDraftLines(
			draft,
			selection.noteCursorOffset ?? draft.length,
		),
		hint: "enter newline  ctrl+s save  esc cancel",
	};
}

function renderNoteDraftLines(draft: string, cursorOffset: number): string[] {
	const cursor = Math.max(0, Math.min(cursorOffset, draft.length));
	const beforeCursor = draft.slice(0, cursor);
	const cursorLineIndex = beforeCursor.split("\n").length - 1;
	const withCursor = `${beforeCursor}▌${draft.slice(cursor)}`;
	const lines = withCursor.split("\n");
	const endExclusive = cursorLineIndex + 1;
	const start = Math.max(0, endExclusive - NOTE_INPUT_VISIBLE_LINES);
	return lines.slice(start, endExclusive);
}

export function buildLabelPromptViewModel(
	model: TuiModel,
	selection: TuiSelection,
): LabelPromptViewModel | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	const configuredLabels = model.labels ?? [];
	const draft = new Set(selection.labelDraftIds ?? card.labels);
	const known = new Set(configuredLabels.map((label) => label.id));
	return {
		title: `Edit Labels for ${card.id}`,
		focused: Boolean(selection.labelOpen),
		labels: configuredLabels.map((label, index) => ({
			id: label.id,
			title: label.title,
			checked: draft.has(label.id),
			focused: index === (selection.labelFocusIndex ?? 0),
		})),
		unknownLabels: card.labels.filter((label) => !known.has(label)),
		...(configuredLabels.length === 0
			? {
					emptyMessage:
						"No Labels configured. Add Labels in .mikan/config.yaml.",
				}
			: {}),
		hint:
			configuredLabels.length === 0
				? "esc close"
				: "space toggle  enter save  esc cancel",
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

export function buildGitHubMirrorPromptViewModel(
	model: TuiModel,
	selection: TuiSelection,
): GitHubMirrorPromptViewModel | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	return {
		title: `Create GitHub Mirror for ${card.id}?`,
		focused: Boolean(selection.githubConfirmOpen),
		body: `${card.title}\nRepo: ${model.githubRepo ?? "(not configured)"}\nLocal Markdown remains the source of truth.`,
		hint: "enter create  esc cancel",
	};
}
