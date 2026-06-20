import { Board } from "../components/board.tsx";
import { useBoardQuery } from "./board-query.ts";
import { useRepositoryFilter } from "./use-repository-filter.ts";

// Browser app shell wired to the Board API poll (MIK-151) and rendering the real
// Kanban board with primary-Repository filtering (MIK-152). The visual direction
// is the dark, compact, developer-native "Local Command Board", close in spirit
// to the TUI. The active Repository filter is mirrored in the `repository` URL
// query parameter and restored on reload.
export function App() {
	const { data, isPending, isError } = useBoardQuery();
	const [repository, setRepository] = useRepositoryFilter();

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
						repository={repository}
						onRepositoryChange={setRepository}
					/>
				) : (
					<p data-testid="board-status" role="alert" className="text-red-400">
						{`${data.error.code}: ${data.error.message}`}
					</p>
				)}
			</div>
		</main>
	);
}
