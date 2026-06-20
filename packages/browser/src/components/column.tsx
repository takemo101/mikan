import type { BoardColumnView } from "@mikan/core";
import { useRef } from "react";
import type { MoveCommand } from "../client/board-dnd.ts";
import { useColumnDropTarget } from "../client/use-board-dnd.ts";
import { Card } from "./card.tsx";

// A Status Column lane. Always renders, even with zero Cards, so the board keeps
// its full Status structure and surfaces a clear empty state. When `onMoveIssue`
// is provided the whole lane becomes a drag-and-drop target: dropping a Card from
// another Column moves the Issue to this Column's Status.
type ColumnProps = {
	column: BoardColumnView;
	labelTitles?: Record<string, string>;
	repositoryTitles?: Record<string, string>;
	onSelectIssue?: (id: string) => void;
	onMoveIssue?: (command: MoveCommand) => void;
};

export function Column({
	column,
	labelTitles,
	repositoryTitles,
	onSelectIssue,
	onMoveIssue,
}: ColumnProps) {
	const ref = useRef<HTMLElement | null>(null);
	const isOver = useColumnDropTarget(ref, {
		columnId: column.id,
		// A no-op handler keeps the hook's deps stable when DnD is disabled; the
		// lane simply never fires a move.
		onMove: onMoveIssue ?? (() => {}),
	});
	const draggable = onMoveIssue !== undefined;

	return (
		<section
			ref={ref}
			data-testid="board-column"
			data-column-id={column.id}
			data-drop-over={draggable && isOver ? "true" : undefined}
			aria-label={column.title}
			className={`flex w-64 shrink-0 flex-col rounded-md border bg-neutral-900/40 ${
				draggable && isOver
					? "border-sky-500 bg-sky-500/5"
					: "border-neutral-800"
			}`}
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
								onSelect={onSelectIssue}
								columnId={draggable ? column.id : undefined}
							/>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
