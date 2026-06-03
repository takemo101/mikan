import React from "react";
import type { TuiAppViewProps } from "./app-view-props.ts";
import type { TuiModel } from "./model.ts";
import {
	buildArchivePromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
} from "./prompt-view-model.ts";
import type { TuiSelection } from "./selection.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

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
		`Note: ${view.draft}`,
		...(view.feedback ? [view.feedback] : []),
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
		"a archive Issue",
		"w warning details",
		"r reload",
		"q quit",
	];
}
