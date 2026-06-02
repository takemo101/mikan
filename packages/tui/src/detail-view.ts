import { fg, StyledText } from "@opentui/core";
import React from "react";
import type { TuiAppViewProps } from "./app-view-props.ts";
import {
	buildDetailPageViewModel,
	buildDetailViewModel,
	type DetailPageViewModel,
} from "./detail-view-model.ts";
import { formatLabels } from "./formatting.ts";
import { getSelectedDetails, type TuiDetails } from "./model.ts";
import { buildTuiTheme, type TuiTheme } from "./theme.ts";

function detailLabelsText(page: DetailPageViewModel): string {
	return page.labelsText
		? formatLabels(page.labelsText.split(", ").filter(Boolean))
		: "none";
}

function detailDependencyText(page: DetailPageViewModel): string {
	if (page.unmetDependenciesText)
		return `deps unmet ${page.unmetDependenciesText}`;
	return page.dependsOnText ? `deps ${page.dependencyStatus}` : "";
}

function detailStatusColor(status: string, theme: TuiTheme): string {
	if (status === "completed") return theme.feedback.success;
	if (status === "blocked") return theme.feedback.warning;
	if (status === "active") return theme.interactive.accent;
	return theme.base.muted;
}

function detailTitleContent(
	page: DetailPageViewModel,
	theme: TuiTheme,
): StyledText {
	const chunks = [
		fg(theme.interactive.accent)(page.id),
		fg(theme.base.muted)(" │ "),
		fg(theme.base.text)(page.title),
	];
	if (page.lineRangeText) {
		chunks.push(fg(theme.base.muted)(" │ "));
		chunks.push(fg(theme.base.muted)(page.lineRangeText));
	}
	return new StyledText(chunks);
}

function detailMetaContent(
	page: DetailPageViewModel,
	theme: TuiTheme,
): StyledText {
	const chunks = [
		fg(detailStatusColor(page.status, theme))(page.status),
		fg(theme.base.muted)(" · labels "),
		fg(theme.base.muted)(detailLabelsText(page)),
	];
	const dependency = detailDependencyText(page);
	if (dependency) chunks.push(fg(theme.feedback.warning)(` · ${dependency}`));
	if (page.warningCount > 0) {
		chunks.push(fg(theme.feedback.warning)(` · warnings ${page.warningCount}`));
	}
	return new StyledText(chunks);
}

export function DetailPage(props: TuiAppViewProps): React.ReactElement {
	const page = buildDetailPageViewModel(props.model, props.selection, {
		viewportHeight: props.viewportHeight,
	});
	const theme = props.theme ?? buildTuiTheme();
	if (!page)
		return React.createElement("text", { content: "No Issue selected" });
	return React.createElement(
		"box",
		{
			id: "detail-page",
			title: "Detail",
			border: true,
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.interactive.accent,
				flexDirection: "column",
				flexGrow: 1,
				overflow: "hidden",
			},
		},
		React.createElement(
			"box",
			{
				id: "detail-header",
				style: {
					backgroundColor: theme.base.surface,
					flexDirection: "column",
					flexShrink: 0,
				},
			},
			React.createElement("text", {
				content: detailTitleContent(page, theme),
			}),
			React.createElement("text", {
				content: detailMetaContent(page, theme),
			}),
		),
		React.createElement(
			"box",
			{
				id: "detail-markdown-body",
				style: {
					flexDirection: "column",
					flexGrow: 1,
					minHeight: 0,
					overflow: "hidden",
				},
			},
			React.createElement("markdown", {
				id: "detail-markdown",
				content: page.visibleMarkdownLines.join("\n"),
				style: {
					flexGrow: 1,
					minHeight: 0,
					overflow: "hidden",
				},
			}),
		),
	);
}

export function DetailView(props: TuiAppViewProps): React.ReactElement {
	const view = buildDetailViewModel(props.model, props.selection);
	const details = getSelectedDetails(props.model, props.selection);
	const theme = props.theme ?? buildTuiTheme();
	if (!view || !details) {
		return React.createElement("text", { content: "No Issue selected" });
	}
	const issueList = React.createElement(
		"box",
		{
			id: "detail-issue-list",
			title: "Issues",
			style: { flexDirection: "column", flexGrow: 1 },
		},
		...view.groups.map((group) =>
			React.createElement("text", {
				key: group.status,
				content: [
					`${group.title} (${group.cards.length})`,
					...group.cards.map(
						(card) => `${card.selected ? ">" : " "} ${card.id} ${card.title}`,
					),
				].join("\n"),
			}),
		),
	);
	return React.createElement(
		"box",
		{ id: "mikan-detail-layout", style: { flexDirection: "row" } },
		issueList,
		React.createElement(
			"box",
			{
				id: "detail-right-panes",
				style: { flexDirection: "column", flexGrow: 3 },
			},
			React.createElement(DetailPane, { details, theme }),
			React.createElement(LogPane, { details, theme }),
		),
	);
}

export function DetailPane(props: {
	details: TuiDetails;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "detail-pane",
			title: "Details",
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.interactive.accent,
				flexDirection: "column",
				flexGrow: 2,
			},
		},
		React.createElement("text", {
			content: `${props.details.card.id} ${props.details.card.title}`,
		}),
		React.createElement("text", {
			content: `Status: ${props.details.card.status}`,
		}),
		React.createElement("text", {
			content: `Labels: ${props.details.card.labels.join(", ") || "(none)"}`,
		}),
		React.createElement("markdown", { content: props.details.summary }),
	);
}

export function LogPane(props: {
	details: TuiDetails;
	theme?: TuiTheme;
}): React.ReactElement {
	const theme = props.theme ?? buildTuiTheme();
	return React.createElement(
		"box",
		{
			id: "log-pane",
			title: "Status Log / Reports / Notes",
			style: {
				backgroundColor: theme.base.surface,
				borderColor: theme.base.muted,
				flexDirection: "column",
				flexGrow: 1,
			},
		},
		React.createElement("markdown", {
			content: [
				"## Status Log",
				props.details.statusLog || "(empty)",
				"## Reports",
				props.details.reports || "(empty)",
				"## Notes",
				props.details.notes || "(empty)",
				"## Herdr",
				props.details.herdr || "(empty)",
			].join("\n\n"),
		}),
	);
}
