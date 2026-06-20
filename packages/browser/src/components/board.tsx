import type { BoardViewModel } from "@mikan/core";
import {
	countBoardCards,
	filterBoardByRepository,
} from "../client/board-filter.ts";
import { Column } from "./column.tsx";
import { RepositoryFilter } from "./repository-filter.tsx";
import { Warnings } from "./warnings.tsx";

// The real Kanban board: a toolbar (Repository filter + warning surface) above a
// horizontally scrolling row of Status Columns. Warnings are board-level and so
// read from the unfiltered model; Columns render the primary-Repository-filtered
// view, preserving empty lanes.
type BoardProps = {
	board: BoardViewModel;
	repository: string | undefined;
	onRepositoryChange: (next: string | undefined) => void;
};

export function Board({ board, repository, onRepositoryChange }: BoardProps) {
	const filtered = filterBoardByRepository(board, repository);
	const hasMatches = countBoardCards(filtered) > 0;
	const filtering =
		repository !== undefined &&
		board.repositories !== undefined &&
		board.repositories.length > 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<RepositoryFilter
					repositories={board.repositories}
					value={repository}
					onChange={onRepositoryChange}
				/>
				<Warnings warnings={board.warnings} details={board.warningDetails} />
			</div>
			{filtering && !hasMatches ? (
				<p data-testid="board-no-match" className="text-sm text-neutral-500">
					No issues for this repository.
				</p>
			) : null}
			<div
				data-testid="board-columns"
				className="flex gap-3 overflow-x-auto pb-2"
			>
				{filtered.columns.map((column) => (
					<Column
						key={column.id}
						column={column}
						labelTitles={board.labelTitles}
						repositoryTitles={board.repositoryTitles}
					/>
				))}
			</div>
		</div>
	);
}
