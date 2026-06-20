import type { BoardCardView } from "@mikan/core";

// A single Issue rendered as a Card.
//
// Compact, developer-native presentation in the spirit of the TUI: a mono
// `repository` prefix, the Issue ID, a dependency readiness marker, the title,
// Label chips, and — only when present — a muted affected-Repository line so the
// extra context never dominates the Card.
type CardProps = {
	card: BoardCardView;
	labelTitles?: Record<string, string>;
	repositoryTitles?: Record<string, string>;
};

export function Card({ card, labelTitles, repositoryTitles }: CardProps) {
	const repositoryTitle = card.repository
		? (repositoryTitles?.[card.repository] ?? card.repository)
		: undefined;
	const affects = card.affects ?? [];
	const blocked = card.dependencyStatus === "blocked";

	return (
		<article
			data-testid="board-card"
			data-issue-id={card.id}
			className="rounded border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-sm"
		>
			<div className="flex items-center gap-2 font-mono text-xs text-neutral-400">
				{card.repository ? (
					<span data-testid="card-repository" title={repositoryTitle}>
						[{card.repository}]
					</span>
				) : null}
				<span className="text-neutral-500">{card.id}</span>
				{card.dependencyStatus ? (
					<span
						data-testid="card-dependency"
						data-dependency-status={card.dependencyStatus}
						role="img"
						aria-label={blocked ? "dependencies blocked" : "dependencies ready"}
						title={
							blocked
								? `Blocked by ${(card.unmetDependencies ?? []).join(", ") || "unmet dependencies"}`
								: "Dependencies ready"
						}
						className={`ml-auto ${blocked ? "text-amber-400" : "text-emerald-400"}`}
					>
						{blocked ? "◆" : "◇"}
					</span>
				) : null}
			</div>
			<h3 className="mt-1 leading-snug text-neutral-100">{card.title}</h3>
			{card.labels.length > 0 ? (
				<ul aria-label="labels" className="mt-1.5 flex flex-wrap gap-1">
					{card.labels.map((label) => (
						<li
							key={label}
							data-testid="card-label"
							className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300"
						>
							{labelTitles?.[label] ?? label}
						</li>
					))}
				</ul>
			) : null}
			{affects.length > 0 ? (
				<p
					data-testid="card-affects"
					className="mt-1.5 font-mono text-xs text-neutral-500"
				>
					+{affects.map((id) => repositoryTitles?.[id] ?? id).join(", ")}
				</p>
			) : null}
		</article>
	);
}
