import type { BoardColumnView } from "@mikan/core";
import { Card } from "./card.tsx";

// A Status Column lane. Always renders, even with zero Cards, so the board keeps
// its full Status structure and surfaces a clear empty state.
type ColumnProps = {
	column: BoardColumnView;
	labelTitles?: Record<string, string>;
	repositoryTitles?: Record<string, string>;
};

export function Column({ column, labelTitles, repositoryTitles }: ColumnProps) {
	return (
		<section
			data-testid="board-column"
			data-column-id={column.id}
			aria-label={column.title}
			className="flex w-64 shrink-0 flex-col rounded-md border border-neutral-800 bg-neutral-900/40"
		>
			<header className="flex items-baseline justify-between border-b border-neutral-800 px-3 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
					{column.title}
				</h2>
				<span
					data-testid="column-count"
					className="font-mono text-xs text-neutral-500"
				>
					{column.cards.length}
				</span>
			</header>
			{column.cards.length === 0 ? (
				<p
					data-testid="column-empty"
					className="px-3 py-6 text-center text-xs text-neutral-600"
				>
					No issues
				</p>
			) : (
				<ul className="flex flex-col gap-2 p-2">
					{column.cards.map((card) => (
						<li key={card.id}>
							<Card
								card={card}
								labelTitles={labelTitles}
								repositoryTitles={repositoryTitles}
							/>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
