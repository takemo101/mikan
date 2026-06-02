import {
	buildBoardViewModel,
	formatWarningSummary,
} from "./board-view-model.ts";
import {
	boxLine,
	contentLine,
	footerText,
	formatLabels,
} from "./formatting.ts";
import {
	renderArchiveInteraction,
	renderKeyHelp,
	renderMoveInteraction,
	renderNoteInteraction,
	renderWarningDetails,
} from "./modals.ts";
import {
	cardDependencyStatus,
	cardDependsOn,
	cardUnmetDependencies,
	getSelectedDetails,
	type TuiDetails,
	type TuiModel,
} from "./model.ts";
import { footerMode } from "./navigation.ts";
import type { TuiSelection } from "./selection.ts";

export function renderTuiText(
	model: TuiModel,
	selection: TuiSelection,
): string {
	const lines = [
		"mikan board",
		formatWarningSummary(model.warnings),
		...renderBoard(model, selection),
	].filter(Boolean);
	if (selection.moveOpen) {
		lines.push("", ...renderMoveInteraction(model, selection));
	}
	if (selection.noteOpen) {
		lines.push("", ...renderNoteInteraction(model, selection));
	}
	if (selection.archiveOpen) {
		lines.push("", ...renderArchiveInteraction(model, selection));
	}
	if (selection.warningsOpen) {
		lines.push("", ...renderWarningDetails(model));
	}
	if (selection.helpOpen) {
		lines.push("", ...renderKeyHelp());
	}
	lines.push(
		"",
		[footerText(footerMode(selection)), selection.message]
			.filter(Boolean)
			.join("    "),
	);
	const details = selection.detailOpen
		? getSelectedDetails(model, selection)
		: undefined;
	if (details) {
		lines.push("", ...renderDetails(details));
	}
	return `${lines.join("\n")}\n`;
}

function renderDetails(details: TuiDetails): string[] {
	return [
		`Detail: ${details.card.id} ${details.card.title}`,
		"esc back",
		"",
		"## Dependencies",
		`Depends On: ${cardDependsOn(details.card).length > 0 ? cardDependsOn(details.card).join(", ") : "none"}`,
		`Unmet: ${cardUnmetDependencies(details.card).length > 0 ? cardUnmetDependencies(details.card).join(", ") : "none"}`,
		`Dependency readiness: ${cardDependencyStatus(details.card)}`,
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
	const view = buildBoardViewModel(model, selection);
	const columns = view.visibleColumns.map((column) => {
		const rows = column.empty
			? ["  (empty)"]
			: [
					...(column.cardRangeText ? [`  ${column.cardRangeText}`] : []),
					...column.visibleCards.map(
						(card) =>
							`${card.selected ? "▶" : " "} ${card.id}${
								cardDependencyStatus(card) === "blocked" ? " deps!" : ""
							} ${card.title}${card.labels.length > 0 ? ` ${formatLabels(card.labels)}` : ""}`,
					),
				];
		return {
			header: boxLine(
				`─ ${column.active ? "▶ " : ""}${column.title} `,
				width,
				"┌",
				"┐",
			),
			rows: rows.map((row) => contentLine(row, width)),
			footer: boxLine("", width, "└", "┘"),
		};
	});
	const maxRows = Math.max(0, ...columns.map((column) => column.rows.length));
	const lines: string[] = [];
	lines.push(view.columnViewportText);
	lines.push(columns.map((column) => column.header).join(" "));
	for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
		lines.push(
			columns
				.map((column) => column.rows[rowIndex] ?? contentLine("", width))
				.join(" "),
		);
	}
	lines.push(columns.map((column) => column.footer).join(" "));
	return lines;
}
