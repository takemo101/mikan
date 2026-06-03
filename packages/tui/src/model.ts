import { readFileSync } from "node:fs";
import {
	type BoardIssue,
	type BoardSnapshot,
	type BoardWarning,
	scanBoard,
} from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";

export type TuiCard = {
	id: string;
	title: string;
	labels: string[];
	status: string;
	path: string;
	dependsOn?: string[];
	unmetDependencies?: string[];
	dependencyStatus?: "ready" | "blocked";
};

export type TuiColumn = {
	id: string;
	title: string;
	cards: TuiCard[];
};

export type TuiWarning = {
	text: string;
	kind: string;
	message: string;
	issueId?: string;
	path?: string;
};

export type TuiModel = {
	columns: TuiColumn[];
	warnings: string[];
	warningDetails?: TuiWarning[];
	labelTitles?: Record<string, string>;
};

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
	return buildTuiModel(board.value, loaded.value.config.labels);
}

export function buildTuiModel(
	board: BoardSnapshot,
	labels: { id: string; title: string }[] = [],
): TuiModel {
	return {
		columns: board.columns.map((column) => ({
			id: column.id,
			title: column.title,
			cards: column.issues.map(formatCard),
		})),
		warnings: board.warnings.map(formatWarning),
		...(board.warnings.length > 0
			? { warningDetails: board.warnings.map(formatTuiWarning) }
			: {}),
		labelTitles: Object.fromEntries(
			labels.map((label) => [label.id, label.title]),
		),
	};
}

function formatWarning(warning: BoardWarning): string {
	return `${warning.kind}: ${warning.message}`;
}

function formatTuiWarning(warning: BoardWarning): TuiWarning {
	return {
		text: formatWarning(warning),
		kind: warning.kind,
		message: warning.message,
		issueId: warning.issueId,
		path: warning.path,
	};
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

function formatCard(issue: BoardIssue): TuiCard {
	return {
		id: String(issue.issue.id),
		title: issue.issue.title,
		labels: issue.issue.labels.map(String),
		status: String(issue.status),
		path: issue.path,
		dependsOn: issue.issue.dependencies.map(String),
		unmetDependencies: issue.unmetDependencies.map(String),
		dependencyStatus: issue.dependencyStatus,
	};
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
