import { Board } from "../components/board.tsx";
import { IssueDetailModal } from "../components/issue-detail-modal.tsx";
import { useBoardQuery } from "./board-query.ts";
import { useIssueDetailQuery } from "./issue-detail-query.ts";
import { useBoardMove } from "./move-mutation.ts";
import { useRepositoryFilter } from "./use-repository-filter.ts";
import { useSelectedIssue } from "./use-selected-issue.ts";

// Browser app shell wired to the Board API poll (MIK-151), rendering the real
// Kanban board with primary-Repository filtering (MIK-152), and opening the
// Focused Markdown Modal for the selected Issue (MIK-153). The visual direction
// is the dark, compact, developer-native "Local Command Board", close in spirit
// to the TUI. The active Repository filter (`repository`) and the open Issue
// (`issue`) are independent URL query parameters, both restored on reload; the
// two are managed separately so closing the modal never clears the filter.
export function App() {
	const { data, isPending, isError } = useBoardQuery();
	const [repositoryFilter, setRepositoryFilter] = useRepositoryFilter();
	const [selectedIssue, setSelectedIssue] = useSelectedIssue();
	const detail = useIssueDetailQuery(selectedIssue);
	const { moveIssue, moveError, clearMoveError } = useBoardMove();

	return (
		<main className="min-h-screen bg-neutral-950 text-neutral-100">
			<div className="mx-auto max-w-7xl px-6 py-8">
				<header className="mb-6 flex items-baseline gap-3">
					<h1 className="text-lg font-semibold tracking-tight">
						mikan browser
					</h1>
					{data?.ok ? (
						<span
							data-testid="board-project"
							className="text-sm text-neutral-500"
						>
							{data.project.name} · {data.project.key}
						</span>
					) : null}
				</header>
				{isPending ? (
					<p data-testid="board-status" className="text-neutral-500">
						Loading board…
					</p>
				) : isError ? (
					<p data-testid="board-status" role="alert" className="text-red-400">
						Could not reach the board API.
					</p>
				) : data.ok ? (
					<Board
						board={data.board}
						repository={repositoryFilter.repository}
						includeAffected={repositoryFilter.includeAffected}
						onRepositoryChange={setRepositoryFilter}
						onSelectIssue={setSelectedIssue}
						onMoveIssue={moveIssue}
						moveError={moveError}
						onDismissMoveError={clearMoveError}
					/>
				) : (
					<p data-testid="board-status" role="alert" className="text-red-400">
						{`${data.error.code}: ${data.error.message}`}
					</p>
				)}
			</div>
			{/* A successful archive moves the Issue to `archived`, which this slice
			    never shows on the board, so the archived Issue always leaves the
			    visible board and the detail closes. */}
			{selectedIssue ? (
				<IssueDetailModal
					issueId={selectedIssue}
					data={detail.data}
					isPending={detail.isPending}
					isError={detail.isError}
					configLabels={data?.ok ? (data.board.labels ?? []) : []}
					onClose={() => setSelectedIssue(undefined)}
					onArchived={() => setSelectedIssue(undefined)}
				/>
			) : null}
		</main>
	);
}
