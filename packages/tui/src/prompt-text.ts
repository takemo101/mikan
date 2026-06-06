import type { TuiModel } from "./model.ts";
import {
	buildArchivePromptViewModel,
	buildGitHubMirrorPromptViewModel,
	buildLabelPromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
} from "./prompt-view-model.ts";
import type { TuiSelection } from "./selection.ts";

export function renderMoveInteraction(
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

export function renderNoteInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildNotePromptViewModel(model, selection);
	if (!view) return ["Append note", "No Issue selected"];
	return [
		view.title,
		"",
		"Note:",
		...view.inputLines.map((line) => `  ${line}`),
		...(view.feedback ? ["", view.feedback] : []),
		"",
		view.hint,
	];
}

export function renderLabelInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildLabelPromptViewModel(model, selection);
	if (!view) return ["Edit Labels", "No Issue selected"];
	if (view.emptyMessage) {
		return [view.title, "", view.emptyMessage, "", view.hint];
	}
	return [
		view.title,
		"",
		...view.labels.map(
			(label) =>
				`${label.focused ? "▶" : " "} [${label.checked ? "x" : " "}] ${label.title}`,
		),
		...(view.unknownLabels.length > 0
			? ["", `Unknown Labels (read-only): ${view.unknownLabels.join(", ")}`]
			: []),
		"",
		view.hint,
	];
}

export function renderArchiveInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildArchivePromptViewModel(model, selection);
	if (!view) return ["Archive", "No Issue selected"];
	return [view.title, view.body, view.hint];
}

export function renderGitHubMirrorInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const view = buildGitHubMirrorPromptViewModel(model, selection);
	if (!view) return ["GitHub Mirror", "No Issue selected"];
	return [view.title, view.body, view.hint];
}

export function renderWarningDetails(model: TuiModel): string[] {
	return [
		"Warning details",
		...(model.warnings.length > 0
			? model.warnings.map((warning) => `! ${warning}`)
			: ["No warnings"]),
	];
}

export function renderKeyHelp(): string[] {
	return [
		"Key help",
		"↑/↓ or j/k card/scroll",
		"←/→ or h/l column",
		"enter detail/confirm",
		"esc back/cancel",
		"H/L move Issue",
		"m move menu",
		"n append Note",
		"note: enter newline, ctrl+s save",
		"e edit Labels",
		"a archive Issue",
		"g GitHub Mirror",
		"w warning details",
		"r reload",
		"q quit",
	];
}
