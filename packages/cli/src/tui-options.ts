// Parser/helper types for the `mikan tui` command's `--columns` option.
// MIK-103 validates and surfaces this option on the CLI surface; MIK-104 will
// consume `TuiColumnsOption` to wire the column count into the interactive
// viewport. Keep this free of OpenTUI/runtime imports.

export type TuiColumnsOption = "auto" | 2 | 3 | 4 | 5;

export const DEFAULT_TUI_COLUMNS: TuiColumnsOption = "auto";

const NUMERIC_TUI_COLUMNS: readonly number[] = [2, 3, 4, 5];

export type ParseTuiColumnsResult =
	| { ok: true; value: TuiColumnsOption }
	| { ok: false; error: string };

export function parseTuiColumnsOption(
	raw: string | undefined,
): ParseTuiColumnsResult {
	if (raw === undefined) return { ok: true, value: DEFAULT_TUI_COLUMNS };
	if (raw === "auto") return { ok: true, value: "auto" };
	const numeric = Number(raw);
	if (Number.isInteger(numeric) && NUMERIC_TUI_COLUMNS.includes(numeric)) {
		return { ok: true, value: numeric as TuiColumnsOption };
	}
	return {
		ok: false,
		error: `Invalid --columns value: ${raw}. Expected auto, 2, 3, 4, or 5.`,
	};
}
