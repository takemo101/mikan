import type { BoardViewModel } from "@mikan/core";
import type { MoveCommand } from "../client/board-dnd.ts";
import {
	countBoardCards,
	filterBoardByRepository,
} from "../client/board-filter.ts";
import type { RepositoryFilterState } from "../client/use-repository-filter.ts";
import type { ApiError } from "../config-error.ts";
import { Column } from "./column.tsx";
import { RepositoryFilter } from "./repository-filter.tsx";
import { Warnings } from "./warnings.tsx";

// The real Kanban board: a toolbar (Repository filter + warning surface) above a
// horizontally scrolling row of Status Columns. Warnings are board-level and so
// read from the unfiltered model; Columns render the primary-Repository-filtered
// view, preserving empty lanes.
//
// When `onMoveIssue` is provided, Columns become drag-and-drop targets for
// cross-Column Status moves (MIK-155). A failed move surfaces as the board-level
// banner read from `moveError`; the banner sits above the lanes and does not
// disturb the Repository filter or any open Issue detail, both of which live in
// URL state owned by the app shell.
type BoardProps = {
	board: BoardViewModel;
	repository: string | undefined;
	includeAffected?: boolean;
	onRepositoryChange: (next: RepositoryFilterState) => void;
	onSelectIssue?: (id: string) => void;
	onMoveIssue?: (command: MoveCommand) => void;
	moveError?: ApiError;
	onDismissMoveError?: () => void;
};

export function Board({
	board,
	repository,
	includeAffected = false,
	onRepositoryChange,
	onSelectIssue,
	onMoveIssue,
	moveError,
	onDismissMoveError,
}: BoardProps) {
	const filtered = filterBoardByRepository(board, repository, includeAffected);
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
					includeAffected={includeAffected}
					onChange={onRepositoryChange}
				/>
				<Warnings warnings={board.warnings} details={board.warningDetails} />
			</div>
			{moveError ? (
				<div
					data-testid="board-move-error"
					role="alert"
					className="flex items-start justify-between gap-3 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300"
				>
					<span>{`Move failed — ${moveError.code}: ${moveError.message}`}</span>
					{onDismissMoveError ? (
						<button
							type="button"
							data-testid="board-move-error-dismiss"
							onClick={onDismissMoveError}
							aria-label="Dismiss move error"
							className="shrink-0 rounded px-1 text-red-400 outline-none hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
						>
							✕
						</button>
					) : null}
				</div>
			) : null}
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
						onSelectIssue={onSelectIssue}
						onMoveIssue={onMoveIssue}
					/>
				))}
			</div>
		</div>
	);
}
