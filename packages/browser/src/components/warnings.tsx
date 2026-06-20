import type { BoardWarningView } from "@mikan/core";

// Board warning surface.
//
// Shows a compact summary count that expands to the full warning details from
// the board read model. When structured `warningDetails` are present they are
// preferred (they carry the Issue ID / path context); otherwise the flat
// warning strings are listed.
type WarningsProps = {
	warnings: string[];
	details?: BoardWarningView[];
};

export function Warnings({ warnings, details }: WarningsProps) {
	if (warnings.length === 0) return null;
	const items: { text: string; issueId?: string }[] =
		details && details.length > 0
			? details.map((detail) => ({
					text: detail.text,
					issueId: detail.issueId,
				}))
			: warnings.map((text) => ({ text }));

	return (
		<section
			data-testid="board-warnings"
			role="status"
			className="rounded border border-amber-900/60 bg-amber-950/30 text-amber-200"
		>
			<details>
				<summary
					data-testid="warning-summary"
					className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium"
				>
					{warnings.length} warning{warnings.length === 1 ? "" : "s"}
				</summary>
				<ul className="space-y-1 px-3 pb-2 text-xs">
					{items.map((item) => (
						<li
							key={`${item.issueId ?? "warning"}:${item.text}`}
							data-testid="warning-detail"
							className="font-mono text-amber-300/90"
						>
							{item.text}
						</li>
					))}
				</ul>
			</details>
		</section>
	);
}
