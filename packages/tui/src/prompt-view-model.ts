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
