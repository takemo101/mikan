import { readFileSync } from "node:fs";
import {
	appendIssue,
	type BoardIssue,
	type BoardSnapshot,
	moveIssue,
	scanBoard,
} from "@mikan/core";
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
	moveOpen?: boolean;
	moveTargetIndex?: number;
	noteOpen?: boolean;
	noteDraft?: string;
	message?: string;
};

export type MoveTarget = {
	id: string;
	title: string;
};

export type TuiMutationResult = {
	ok: boolean;
	model: TuiModel;
	selection: TuiSelection;
	message: string;
};

export type MoveSelectedIssueResult = TuiMutationResult;

export type TuiRefreshResult = {
	model: TuiModel;
	selection: TuiSelection;
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
	direction: TuiSelectionAction,
): TuiSelection {
	if (direction === "enter") {
		return { ...selection, detailOpen: true };
	}
	if (direction === "escape") {
		return {
			...selection,
			detailOpen: false,
			moveOpen: false,
			noteOpen: false,
		};
	}
	if (direction === "move") {
		return {
			...selection,
			detailOpen: false,
			noteOpen: false,
			moveOpen: true,
			moveTargetIndex: 0,
		};
	}
	if (direction === "append-note") {
		return {
			...selection,
			detailOpen: false,
			moveOpen: false,
			noteOpen: true,
		};
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

export function refreshTuiModel(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
}): TuiRefreshResult {
	const selectedCard =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	const model = loadTuiModel(options.cwd);
	const foundSelection = selectedCard
		? findSelectionByCardId(model, selectedCard.id)
		: undefined;
	const selection = foundSelection ?? clampSelection(model, options.selection);
	const stillSelected = Boolean(foundSelection);
	return {
		model,
		selection: {
			...selection,
			detailOpen: stillSelected ? options.selection.detailOpen : false,
			moveOpen: stillSelected ? options.selection.moveOpen : false,
			moveTargetIndex: stillSelected
				? options.selection.moveTargetIndex
				: undefined,
			noteOpen: stillSelected ? options.selection.noteOpen : false,
			noteDraft: stillSelected ? options.selection.noteDraft : undefined,
			message: options.selection.message,
		},
	};
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
		summary: extractSection(markdown, "Summary") || card.title,
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
	const lines = ["mikan board", ...renderBoard(model, selection)];
	if (model.warnings.length > 0) {
		lines.push(
			"",
			"Warnings",
			...model.warnings.map((warning) => `! ${warning}`),
		);
	}
	if (selection.moveOpen) {
		lines.push("", ...renderMoveInteraction(model, selection));
	}
	if (selection.noteOpen) {
		lines.push("", ...renderNoteInteraction(model, selection));
	}
	if (selection.message) {
		lines.push("", selection.message);
	}
	lines.push(
		"",
		"↑/↓ select  ←/→ column  enter details  m move  a append note  q quit",
	);
	const details = selection.detailOpen
		? getSelectedDetails(model, selection)
		: undefined;
	if (details) {
		lines.push("", ...renderDetails(details));
	}
	return `${lines.join("\n")}\n`;
}

export function getMoveTargets(
	model: TuiModel,
	selection: TuiSelection,
): MoveTarget[] {
	const currentStatus = model.columns[selection.columnIndex]?.id;
	return model.columns
		.filter((column) => column.id !== currentStatus)
		.map((column) => ({ id: column.id, title: column.title }));
}

export function applyNoteInput(
	selection: TuiSelection,
	keyName: string | undefined,
	shift = false,
): TuiSelection {
	if (!selection.noteOpen || !keyName) return selection;
	if (keyName === "backspace") {
		return {
			...selection,
			noteDraft: (selection.noteDraft ?? "").slice(0, -1),
		};
	}
	const character = keyName === "space" ? " " : keyName;
	if (character.length !== 1) return selection;
	const value =
		shift && /[a-z]/.test(character) ? character.toUpperCase() : character;
	return { ...selection, noteDraft: `${selection.noteDraft ?? ""}${value}` };
}

export function moveSelectedIssue(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
	targetStatus: string;
	log?: string;
	now?: () => Date;
}): MoveSelectedIssueResult {
	const card =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	if (!card) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, moveOpen: false },
			message: "No Issue selected",
		};
	}
	const loaded = loadProjectConfig(options.cwd ?? process.cwd());
	if (!loaded.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, moveOpen: false },
			message: loaded.error.message,
		};
	}
	const moved = moveIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: card.id,
		status: options.targetStatus,
		log: options.log ?? "Moved via TUI",
		now: options.now,
	});
	if (!moved.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, moveOpen: false },
			message: moved.error.message,
		};
	}
	const model = loadTuiModel(options.cwd);
	const selection =
		findSelectionByCardId(model, card.id) ??
		clampSelection(model, options.selection);
	return {
		ok: true,
		model,
		selection: {
			...selection,
			detailOpen: false,
			moveOpen: false,
		},
		message: `${card.id} moved to ${options.targetStatus}`,
	};
}

export function appendSelectedIssueNote(options: {
	cwd?: string;
	model: TuiModel;
	selection: TuiSelection;
	body: string;
	now?: () => Date;
}): TuiMutationResult {
	const body = options.body.trim();
	if (!body) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: "Note cannot be empty",
		};
	}
	const card =
		options.model.columns[options.selection.columnIndex]?.cards[
			options.selection.cardIndex
		];
	if (!card) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: "No Issue selected",
		};
	}
	const loaded = loadProjectConfig(options.cwd ?? process.cwd());
	if (!loaded.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: loaded.error.message,
		};
	}
	const appended = appendIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: card.id,
		section: "Notes",
		body,
		source: "mikan-tui",
		now: options.now,
	});
	if (!appended.ok) {
		return {
			ok: false,
			model: options.model,
			selection: { ...options.selection, noteOpen: false },
			message: appended.error.message,
		};
	}
	const model = loadTuiModel(options.cwd);
	const selection =
		findSelectionByCardId(model, card.id) ??
		clampSelection(model, options.selection);
	return {
		ok: true,
		model,
		selection: {
			...selection,
			detailOpen: options.selection.detailOpen,
			noteOpen: false,
		},
		message: `${card.id} note appended`,
	};
}

function renderMoveInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return ["Move", "No Issue selected"];
	const targetIndex = selection.moveTargetIndex ?? 0;
	const targets = getMoveTargets(model, selection);
	return [
		`Move ${card.id} to Status`,
		...targets.map(
			(target, index) =>
				`${index === targetIndex ? ">" : " "} ${target.id} (${target.title})`,
		),
		"enter move  esc cancel",
	];
}

function renderNoteInteraction(
	model: TuiModel,
	selection: TuiSelection,
): string[] {
	const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
	if (!card) return ["Append note", "No Issue selected"];
	return [
		`Append note to ${card.id}`,
		`Note: ${selection.noteDraft ?? ""}`,
		"enter append  esc cancel",
	];
}

function renderDetails(details: TuiDetails): string[] {
	return [
		`Detail: ${details.card.id} ${details.card.title}`,
		"esc back",
		"",
		"## Summary",
		details.summary || "(empty)",
		"",
		"## Status Log",
		details.statusLog || "(empty)",
		"",
		"## Reports",
		details.reports || "(empty)",
		"",
		"## Notes",
		details.notes || "(empty)",
		"",
		"## Herdr",
		details.herdr || "(empty)",
	];
}

function renderBoard(model: TuiModel, selection: TuiSelection): string[] {
	const width = 26;
	const columns = model.columns.map((column, columnIndex) => {
		const cards = column.cards.length > 0 ? column.cards : undefined;
		const rows = cards
			? cards.flatMap((card, cardIndex) => {
					const selected =
						columnIndex === selection.columnIndex &&
						cardIndex === selection.cardIndex;
					const labels =
						card.labels.length > 0 ? [`  [${card.labels.join(", ")}]`] : [];
					return [
						`${selected ? ">" : " "} ${card.id} ${card.title}`,
						...labels,
					];
				})
			: ["  (empty)"];
		return {
			header: boxLine(`─ ${column.title} `, width, "┌", "┐"),
			rows: rows.map((row) => contentLine(row, width)),
			footer: boxLine("", width, "└", "┘"),
		};
	});
	const columnGroups = chunk(columns, 4);
	const lines: string[] = [];
	for (const group of columnGroups) {
		const maxRows = Math.max(0, ...group.map((column) => column.rows.length));
		lines.push(group.map((column) => column.header).join(" "));
		for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
			lines.push(
				group
					.map((column) => column.rows[rowIndex] ?? contentLine("", width))
					.join(" "),
			);
		}
		lines.push(group.map((column) => column.footer).join(" "));
	}
	return lines;
}

function chunk<T>(items: T[], size: number): T[][] {
	const groups: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		groups.push(items.slice(index, index + size));
	}
	return groups;
}

function boxLine(
	label: string,
	width: number,
	left: string,
	right: string,
): string {
	return `${left}${truncate(label.padEnd(width - 2, "─"), width - 2)}${right}`;
}

function contentLine(content: string, width: number): string {
	return `│ ${truncate(content, width - 4).padEnd(width - 4)} │`;
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export async function launchTui(
	options: { cwd?: string; pollMs?: number } = {},
): Promise<void> {
	const { createCliRenderer } = await import("@opentui/core");
	const { createRoot, useKeyboard } = await import("@opentui/react");
	const renderer = await createCliRenderer();
	const pollMs = options.pollMs ?? 1000;
	const root = createRoot(renderer);
	const stop = () => {
		root.unmount();
		renderer.destroy();
	};

	function App() {
		const [model, setModel] = React.useState(() => loadTuiModel(options.cwd));
		const [selection, setSelection] = React.useState<TuiSelection>({
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
		});
		const modelRef = React.useRef(model);
		const selectionRef = React.useRef(selection);
		modelRef.current = model;
		selectionRef.current = selection;

		React.useEffect(() => {
			const interval = setInterval(() => {
				const refreshed = refreshTuiModel({
					cwd: options.cwd,
					model: modelRef.current,
					selection: selectionRef.current,
				});
				modelRef.current = refreshed.model;
				selectionRef.current = refreshed.selection;
				setModel(refreshed.model);
				setSelection(refreshed.selection);
			}, pollMs);
			return () => clearInterval(interval);
		}, []);

		useKeyboard((key: { name?: string; shift?: boolean }) => {
			const action = keyToTuiAction(key.name);
			if (selection.noteOpen) {
				if (action === "escape") {
					setSelection((current) => moveSelection(model, current, action));
					return;
				}
				if (action === "enter") {
					const result = appendSelectedIssueNote({
						cwd: options.cwd,
						model,
						selection,
						body: selection.noteDraft ?? "",
					});
					setModel(result.model);
					setSelection({ ...result.selection, message: result.message });
					return;
				}
				setSelection((current) => applyNoteInput(current, key.name, key.shift));
				return;
			}
			if (!action) return;
			if (action === "quit") {
				stop();
				return;
			}
			if (selection.moveOpen && (action === "up" || action === "down")) {
				setSelection((current) => ({
					...current,
					moveTargetIndex: clamp(
						(current.moveTargetIndex ?? 0) + (action === "down" ? 1 : -1),
						0,
						Math.max(0, getMoveTargets(model, current).length - 1),
					),
				}));
				return;
			}
			if (selection.moveOpen && action === "enter") {
				const targets = getMoveTargets(model, selection);
				const target = targets[selection.moveTargetIndex ?? 0];
				if (!target) return;
				const result = moveSelectedIssue({
					cwd: options.cwd,
					model,
					selection,
					targetStatus: target.id,
				});
				setModel(result.model);
				setSelection({ ...result.selection, message: result.message });
				return;
			}
			setSelection((current) => moveSelection(model, current, action));
		});

		return React.createElement("text", null, renderTuiText(model, selection));
	}

	root.render(React.createElement(App));
	process.once("SIGINT", stop);
}

type TuiAction =
	| "left"
	| "right"
	| "up"
	| "down"
	| "enter"
	| "escape"
	| "move"
	| "append-note"
	| "quit";

type TuiDirection = "left" | "right" | "up" | "down" | "enter" | "escape";

type TuiSelectionAction = TuiDirection | "move" | "append-note";

export function keyToTuiAction(
	keyName: string | undefined,
): TuiAction | undefined {
	switch (keyName) {
		case "left":
		case "right":
		case "up":
		case "down":
		case "enter":
		case "escape":
			return keyName;
		case "return":
			return "enter";
		case "m":
			return "move";
		case "a":
			return "append-note";
		case "q":
			return "quit";
		default:
			return undefined;
	}
}

export function keyToDirection(
	keyName: string | undefined,
): TuiDirection | undefined {
	const action = keyToTuiAction(keyName);
	if (action === "move" || action === "append-note" || action === "quit") {
		return undefined;
	}
	return action;
}

function clampSelection(
	model: TuiModel,
	selection: TuiSelection,
): TuiSelection {
	const columnIndex = clamp(
		selection.columnIndex,
		0,
		Math.max(0, model.columns.length - 1),
	);
	const maxCardIndex = Math.max(
		0,
		(model.columns[columnIndex]?.cards.length ?? 1) - 1,
	);
	return {
		...selection,
		columnIndex,
		cardIndex: clamp(selection.cardIndex, 0, maxCardIndex),
	};
}

function findSelectionByCardId(
	model: TuiModel,
	cardId: string,
): TuiSelection | undefined {
	for (const [columnIndex, column] of model.columns.entries()) {
		const cardIndex = column.cards.findIndex((card) => card.id === cardId);
		if (cardIndex !== -1) {
			return { columnIndex, cardIndex, detailOpen: false };
		}
	}
	return undefined;
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
