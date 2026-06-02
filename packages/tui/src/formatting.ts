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
	return Math.max(1, viewportHeight - 10);
}

export function visibleDetailLineCount(viewportHeight: number): number {
	return Math.max(1, viewportHeight - 11);
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
