import type { BoardCardView } from "./board-view-model.ts";
import { formatLineRange, visibleDetailLineCount } from "./formatting.ts";
import {
	cardDependencyStatus,
	cardDependsOn,
	cardUnmetDependencies,
	getSelectedDetails,
	stripFrontmatter,
	type TuiCard,
	type TuiModel,
	type TuiWarning,
} from "./model.ts";
import { clamp, type TuiSelection } from "./selection.ts";

export type DetailViewModel = {
	selected: TuiCard & {
		labelsText: string;
	};
	groups: {
		status: string;
		title: string;
		cards: BoardCardView[];
	}[];
	sections: {
		summary: string;
		statusLog: string;
		reports: string;
		notes: string;
		herdr: string;
	};
};

export type DetailPageViewModel = {
	id: string;
	title: string;
	status: string;
	labelsText: string;
	dependsOnText: string;
	unmetDependenciesText: string;
	dependencyStatus: "ready" | "blocked";
	warningCount: number;
	githubText: string;
	repositoryText: string;
	affectsText: string;
	metadataText: string;
	markdown: string;
	visibleMarkdownLines: string[];
	hiddenLinesBefore: number;
	hiddenLinesAfter: number;
	lineRangeText: string;
};

export type DetailPageOptions = {
	visibleLineCount?: number;
	viewportHeight?: number;
};

export function buildDetailPageViewModel(
	model: TuiModel,
	selection: TuiSelection,
	options: DetailPageOptions = {},
): DetailPageViewModel | undefined {
	const details = getSelectedDetails(model, selection);
	if (!details) return undefined;
	const markdown = stripFrontmatter(details.markdown).trimEnd();
	const markdownLines = markdown.split("\n");
	const visibleLineCount =
		options.visibleLineCount ??
		(options.viewportHeight
			? visibleDetailLineCount(options.viewportHeight)
			: 40);
	const offset = clamp(
		selection.detailScrollOffset ?? 0,
		0,
		Math.max(0, markdownLines.length - visibleLineCount),
	);
	const visibleMarkdownLines = markdownLines.slice(
		offset,
		offset + visibleLineCount,
	);
	const lineEnd = offset + visibleMarkdownLines.length;
	return {
		id: details.card.id,
		title: details.card.title,
		status: details.card.status,
		labelsText: formatDetailLabels(model, details.card),
		dependsOnText: cardDependsOn(details.card).join(", "),
		unmetDependenciesText: cardUnmetDependencies(details.card).join(", "),
		dependencyStatus: cardDependencyStatus(details.card),
		warningCount: warningCountForCard(model.warningDetails, details.card),
		githubText: details.card.githubIssue
			? `GitHub #${details.card.githubIssue.number} ${details.card.githubIssue.repo}`
			: "",
		repositoryText: formatRepositoryText(model, details.card),
		affectsText: formatAffectsText(model, details.card),
		metadataText: formatMetadataText(details.card),
		markdown,
		visibleMarkdownLines,
		hiddenLinesBefore: offset,
		hiddenLinesAfter: Math.max(0, markdownLines.length - lineEnd),
		lineRangeText: formatLineRange({
			start: offset + 1,
			end: lineEnd,
			total: markdownLines.length,
			hiddenBefore: offset,
			hiddenAfter: Math.max(0, markdownLines.length - lineEnd),
		}),
	};
}

export function buildDetailViewModel(
	model: TuiModel,
	selection: TuiSelection,
): DetailViewModel | undefined {
	const details = getSelectedDetails(model, selection);
	if (!details) return undefined;
	return {
		selected: {
			...details.card,
			labelsText: formatDetailLabels(model, details.card),
		},
		groups: model.columns.map((column, columnIndex) => ({
			status: column.id,
			title: column.title,
			cards: column.cards.map((card, cardIndex) => ({
				...card,
				selected:
					columnIndex === selection.columnIndex &&
					cardIndex === selection.cardIndex,
				labelsText: card.labels.join(", "),
			})),
		})),
		sections: {
			summary: details.summary,
			statusLog: details.statusLog,
			reports: details.reports,
			notes: details.notes,
			herdr: details.herdr,
		},
	};
}

function repositoryTitle(model: TuiModel, id: string): string {
	return model.repositoryTitles?.[id] ?? id;
}

function formatRepositoryText(model: TuiModel, card: TuiCard): string {
	if (!card.repository) return "";
	const title = model.repositoryTitles?.[card.repository];
	return title ? `${title} (${card.repository})` : card.repository;
}

function formatAffectsText(model: TuiModel, card: TuiCard): string {
	const affects = card.affects ?? [];
	if (affects.length === 0) return "";
	return affects.map((id) => repositoryTitle(model, id)).join(", ");
}

function formatMetadataText(card: TuiCard): string {
	const metadata = card.metadata ?? {};
	return Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : "";
}

function formatDetailLabels(model: TuiModel, card: TuiCard): string {
	return card.labels
		.map((label) => model.labelTitles?.[label] ?? label)
		.join(", ");
}

function warningCountForCard(
	warnings: TuiWarning[] | undefined,
	card: TuiCard,
): number {
	return (warnings ?? []).filter(
		(warning) => warning.issueId === card.id || warning.path === card.path,
	).length;
}
