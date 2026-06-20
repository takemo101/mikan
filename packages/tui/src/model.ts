import { readFileSync } from "node:fs";
import {
	type BoardCardView,
	type BoardColumnView,
	type BoardGithubIssue,
	type BoardLabelView,
	type BoardRepositoryView,
	type BoardViewModel,
	type BoardWarningView,
	buildBoardViewModel,
	scanBoard,
} from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";

// The TUI consumes the shared, TUI-neutral `BoardViewModel` from `@mikan/core`
// (see packages/core/src/board-view-model.ts). These aliases preserve the
// existing `Tui*` names used throughout the TUI package and its tests while the
// underlying shapes and `buildTuiModel` behavior are now the shared model.
export type TuiGithubIssue = BoardGithubIssue;
export type TuiCard = BoardCardView;
export type TuiColumn = BoardColumnView;
export type TuiWarning = BoardWarningView;
export type TuiLabel = BoardLabelView;
export type TuiRepository = BoardRepositoryView;
export type TuiModel = BoardViewModel;

export const buildTuiModel = buildBoardViewModel;

export type TuiDetails = {
	card: TuiCard;
	markdown: string;
	summary: string;
	statusLog: string;
	reports: string;
	notes: string;
	herdr: string;
};

export function loadTuiModel(cwd = process.cwd()): TuiModel {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) throw new Error(loaded.error.message);
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
	});
	if (!board.ok) throw new Error(board.error.message);
	return buildTuiModel(
		board.value,
		loaded.value.config.labels,
		loaded.value.config.github?.repo,
		loaded.value.config.repositories,
	);
}

export function getSelectedDetails(
	model: TuiModel,
	selection: { columnIndex: number; cardIndex: number },
): TuiDetails | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	const markdown = readFileSync(card.path, "utf8");
	return {
		card,
		markdown,
		summary: extractSection(markdown, "Summary") || card.title,
		statusLog: extractSection(markdown, "Status Log"),
		reports: extractSection(markdown, "Reports"),
		notes: extractSection(markdown, "Notes"),
		herdr:
			extractSection(markdown, "Herdr") || extractSection(markdown, "herdr"),
	};
}

export function cardDependsOn(card: TuiCard): string[] {
	return card.dependsOn ?? [];
}

export function cardUnmetDependencies(card: TuiCard): string[] {
	return card.unmetDependencies ?? [];
}

export function cardDependencyStatus(card: TuiCard): "ready" | "blocked" {
	return card.dependencyStatus ?? "ready";
}

export function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---\n")) return markdown;
	const end = markdown.indexOf("\n---\n", 4);
	if (end === -1) return markdown;
	return markdown.slice(end + "\n---\n".length).trimStart();
}

function extractSection(markdown: string, section: string): string {
	const lines = markdown.split("\n");
	const start = lines.findIndex(
		(line) => line.trim().toLowerCase() === `## ${section}`.toLowerCase(),
	);
	if (start === -1) return "";
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index++) {
		if (/^##\s+/.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines
		.slice(start + 1, end)
		.join("\n")
		.trim();
}
