import { readFileSync } from "node:fs";
import { type BoardIssue, type BoardSnapshot, scanBoard } from "@mikan/core";
import { loadProjectConfig } from "@mikan/project-config";
import React from "react";

export type TuiCard = {
	id: string;
	title: string;
	labels: string[];
	status: string;
	path: string;
};

export type TuiColumn = {
	id: string;
	title: string;
	cards: TuiCard[];
};

export type TuiModel = {
	columns: TuiColumn[];
	warnings: string[];
};

export type TuiSelection = {
	columnIndex: number;
	cardIndex: number;
	detailOpen: boolean;
};

export type TuiDetails = {
	card: TuiCard;
	markdown: string;
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
	return buildTuiModel(board.value);
}

export function buildTuiModel(board: BoardSnapshot): TuiModel {
	return {
		columns: board.columns.map((column) => ({
			id: column.id,
			title: column.title,
			cards: column.issues.map(formatCard),
		})),
		warnings: board.warnings.map(
			(warning) => `${warning.kind}: ${warning.message}`,
		),
	};
}

export function moveSelection(
	model: TuiModel,
	selection: TuiSelection,
	direction: "left" | "right" | "up" | "down" | "enter",
): TuiSelection {
	if (direction === "enter") {
		return { ...selection, detailOpen: true };
	}
	const columnIndex = clamp(
		selection.columnIndex +
			(direction === "right" ? 1 : direction === "left" ? -1 : 0),
		0,
		Math.max(0, model.columns.length - 1),
	);
	const maxCardIndex = Math.max(
		0,
		(model.columns[columnIndex]?.cards.length ?? 1) - 1,
	);
	const cardIndex = clamp(
		direction === "up"
			? selection.cardIndex - 1
			: direction === "down"
				? selection.cardIndex + 1
				: Math.min(selection.cardIndex, maxCardIndex),
		0,
		maxCardIndex,
	);
	return { ...selection, columnIndex, cardIndex };
}

export function getSelectedDetails(
	model: TuiModel,
	selection: TuiSelection,
): TuiDetails | undefined {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return undefined;
	const markdown = readFileSync(card.path, "utf8");
	return {
		card,
		markdown,
		statusLog: extractSection(markdown, "Status Log"),
		reports: extractSection(markdown, "Reports"),
		notes: extractSection(markdown, "Notes"),
		herdr:
			extractSection(markdown, "Herdr") || extractSection(markdown, "herdr"),
	};
}

export function renderTuiText(
	model: TuiModel,
	selection: TuiSelection,
): string {
	const lines = ["mikan board"];
	for (const [columnIndex, column] of model.columns.entries()) {
		lines.push(
			`${columnIndex === selection.columnIndex ? "▶" : " "} ${column.title}`,
		);
		for (const [cardIndex, card] of column.cards.entries()) {
			const marker =
				columnIndex === selection.columnIndex &&
				cardIndex === selection.cardIndex
					? "*"
					: " ";
			const labels =
				card.labels.length > 0 ? ` [${card.labels.join(", ")}]` : "";
			lines.push(`  ${marker} ${card.id} ${card.title}${labels}`);
		}
	}
	if (model.warnings.length > 0) {
		lines.push("warnings", ...model.warnings.map((warning) => `! ${warning}`));
	}
	const details = selection.detailOpen
		? getSelectedDetails(model, selection)
		: undefined;
	if (details) {
		lines.push("detail", details.markdown);
	}
	return `${lines.join("\n")}\n`;
}

export async function launchTui(
	options: { cwd?: string; pollMs?: number } = {},
): Promise<void> {
	const { createCliRenderer } = await import("@opentui/core");
	const { createRoot, useKeyboard } = await import("@opentui/react");
	const renderer = await createCliRenderer();
	const pollMs = options.pollMs ?? 1000;

	function App() {
		const [model, setModel] = React.useState(() => loadTuiModel(options.cwd));
		const [selection, setSelection] = React.useState<TuiSelection>({
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
		});

		React.useEffect(() => {
			const interval = setInterval(
				() => setModel(loadTuiModel(options.cwd)),
				pollMs,
			);
			return () => clearInterval(interval);
		}, []);

		useKeyboard((key: { name?: string }) => {
			const direction = keyToDirection(key.name);
			if (!direction) return;
			setSelection((current) => moveSelection(model, current, direction));
		});

		return React.createElement("text", null, renderTuiText(model, selection));
	}

	const root = createRoot(renderer);
	root.render(React.createElement(App));
	process.once("SIGINT", () => renderer.destroy());
}

export function keyToDirection(
	keyName: string | undefined,
): "left" | "right" | "up" | "down" | "enter" | undefined {
	switch (keyName) {
		case "left":
		case "right":
		case "up":
		case "down":
		case "enter":
			return keyName;
		case "return":
			return "enter";
		default:
			return undefined;
	}
}

function formatCard(issue: BoardIssue): TuiCard {
	return {
		id: String(issue.issue.id),
		title: issue.issue.title,
		labels: issue.issue.labels.map(String),
		status: String(issue.status),
		path: issue.path,
	};
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

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
