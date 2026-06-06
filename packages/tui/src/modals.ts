import React from "react";
import type { TuiAppViewProps } from "./app-view-props.ts";
import type { TuiModel } from "./model.ts";
import {
	renderArchiveInteraction,
	renderGitHubMirrorInteraction,
	renderKeyHelp,
	renderLabelInteraction,
	renderMoveInteraction,
	renderNoteInteraction,
	renderWarningDetails,
} from "./prompt-text.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

export function MovePrompt(props: TuiAppViewProps): React.ReactElement {
	return renderModalText({
		theme: props.theme,
		backdropId: "move-modal-backdrop",
		panelId: "move-prompt",
		title: "Move Issue",
		content: renderMoveInteraction(props.model, props.selection),
	});
}

export function NotePrompt(props: TuiAppViewProps): React.ReactElement {
	const content = renderNoteInteraction(props.model, props.selection);
	const initialValue = props.selection.noteDraft ?? "";
	return renderModalShell(
		{
			theme: props.theme,
			backdropId: "note-modal-backdrop",
			panelId: "note-prompt",
			title: "Append Note",
			panelStyle: { height: 11 },
		},
		React.createElement("text", {
			content: content.slice(0, 3).join("\n"),
		}),
		React.createElement("textarea", {
			id: "note-textarea",
			ref: props.noteTextareaRef,
			focused: true,
			initialValue,
			placeholder: "Write a Note...",
			height: 5,
			wrapMode: "word",
			keyBindings: [{ name: "s", ctrl: true, action: "submit" }],
			onSubmit: () => {
				props.onNoteSubmit?.(props.noteTextareaRef?.current?.plainText ?? "");
			},
			style: {
				alignSelf: "stretch",
				backgroundColor: props.theme?.base.canvas,
				textColor: props.theme?.base.text,
				focusedBackgroundColor: props.theme?.base.canvas,
				focusedTextColor: props.theme?.base.text,
				width: "auto",
			},
		}),
		React.createElement("text", {
			content: ["", content.at(-1) ?? ""].join("\n"),
		}),
	);
}

export function LabelPrompt(props: TuiAppViewProps): React.ReactElement {
	return renderModalText({
		theme: props.theme,
		backdropId: "label-modal-backdrop",
		panelId: "label-prompt",
		title: "Edit Labels",
		content: renderLabelInteraction(props.model, props.selection),
	});
}

export function ArchivePrompt(props: TuiAppViewProps): React.ReactElement {
	return renderModalText({
		theme: props.theme,
		backdropId: "archive-modal-backdrop",
		panelId: "archive-prompt",
		title: "Archive Issue",
		content: renderArchiveInteraction(props.model, props.selection),
	});
}

export function GitHubMirrorPrompt(props: TuiAppViewProps): React.ReactElement {
	return renderModalText({
		theme: props.theme,
		backdropId: "github-mirror-modal-backdrop",
		panelId: "github-mirror-prompt",
		title: "GitHub Mirror",
		content: renderGitHubMirrorInteraction(props.model, props.selection),
	});
}

function renderModalText(options: {
	theme?: TuiTheme;
	backdropId: string;
	panelId: string;
	title: string;
	content: string[];
	panelStyle?: Record<string, string | number>;
}): React.ReactElement {
	return renderModalShell(
		options,
		React.createElement("text", {
			content: options.content.join("\n"),
		}),
	);
}

function renderModalShell(
	options: {
		theme?: TuiTheme;
		backdropId: string;
		panelId: string;
		title: string;
		panelStyle?: Record<string, string | number>;
	},
	...children: React.ReactNode[]
): React.ReactElement {
	const theme = options.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: options.backdropId,
			style: modalBackdropStyle(theme),
		},
		React.createElement(
			"box",
			{
				id: options.panelId,
				title: options.title,
				border: true,
				style: {
					...modalStyle(theme),
					...(options.panelStyle ?? {}),
				},
			},
			...children,
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
	return renderModalText({
		theme: props.theme,
		backdropId: "help-panel-backdrop",
		panelId: "help-panel",
		title: "Key help",
		content: renderKeyHelp(),
	});
}

export function WarningPanel(props: {
	model: TuiModel;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return renderModalText({
		theme,
		backdropId: "warning-panel-backdrop",
		panelId: "warning-panel",
		title: "Warning details",
		content: renderWarningDetails(props.model).slice(1),
		panelStyle: { borderColor: theme.feedback.warning },
	});
}
