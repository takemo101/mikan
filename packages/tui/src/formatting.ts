export type FooterMode = "board" | "detail" | "modal";

export function formatLabels(labels: string[]): string {
	return labels.map((label) => `#${label}`).join(" ");
}

export function formatLineRange(options: {
	start: number;
	end: number;
	total: number;
	hiddenBefore: number;
	hiddenAfter: number;
}): string {
	const scrollIndicators = [
		options.hiddenBefore > 0 ? `↑${options.hiddenBefore}` : "",
		options.hiddenAfter > 0 ? `↓${options.hiddenAfter}` : "",
	].filter(Boolean);
	return [
		`Lines: ${options.start}-${options.end}/${options.total}`,
		scrollIndicators.join(" "),
	]
		.filter(Boolean)
		.join(" | ");
}

export function visibleCardCountForViewport(viewportHeight: number): number {
	return Math.max(1, viewportHeight - 6);
}

/** Minimum width, in terminal columns, a single board Column needs to stay readable. */
export const MIN_COLUMN_WIDTH = 40;

/** Minimum number of board Columns kept visible on narrow viewports. */
export const MIN_VISIBLE_COLUMNS = 2;

/** Maximum number of board Columns shown at once on wide viewports. */
export const MAX_VISIBLE_COLUMNS = 5;

/**
 * Derive how many board Columns fit in a viewport of the given width, clamped to
 * the responsive 2..5 range. Only affects the visible viewport, not configured Statuses.
 */
export function visibleColumnCountForViewport(viewportWidth: number): number {
	const fitted = Math.floor(viewportWidth / MIN_COLUMN_WIDTH);
	return Math.min(MAX_VISIBLE_COLUMNS, Math.max(MIN_VISIBLE_COLUMNS, fitted));
}

export function visibleDetailLineCount(viewportHeight: number): number {
	return Math.max(1, viewportHeight - 8);
}

export function footerText(mode: FooterMode): string {
	if (mode === "modal") {
		return "Modal | enter confirm | esc cancel | ? keys";
	}
	if (mode === "detail") {
		return "Detail | ↑↓ scroll | esc board | ? keys";
	}
	return "Board | ↑↓ card | ←→ column | enter detail | ? keys";
}

export function boxLine(
	label: string,
	width: number,
	left: string,
	right: string,
): string {
	return `${left}${truncate(label.padEnd(width - 2, "─"), width - 2)}${right}`;
}

export function contentLine(content: string, width: number): string {
	return `│ ${truncate(content, width - 4).padEnd(width - 4)} │`;
}

export function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
