import { useBoardQuery } from "./board-query.ts";

// Minimal Browser app shell (MIK-150) now wired to the Board API poll (MIK-151).
// The visual direction is the dark, compact, developer-native "Local Command
// Board". This slice only renders a debug board summary; the real Kanban board,
// Repository filter, Markdown detail, and write actions arrive in later Issues.
export function App() {
	const { data, isPending, isError } = useBoardQuery();
	return (
		<main className="min-h-screen bg-neutral-950 text-neutral-100">
			<div className="mx-auto max-w-3xl px-6 py-16">
				<h1 className="text-2xl font-semibold tracking-tight">mikan browser</h1>
				<p className="mt-3 text-neutral-400">
					Local board UI is starting. The Kanban board renders in an upcoming
					release.
				</p>
				{isPending ? (
					<p data-testid="board-status" className="mt-6 text-neutral-500">
						Loading board…
					</p>
				) : isError ? (
					<p
						data-testid="board-status"
						role="alert"
						className="mt-6 text-red-400"
					>
						Could not reach the board API.
					</p>
				) : data.ok ? (
					<p data-testid="board-status" className="mt-6 text-neutral-400">
						{`${data.project.key} · ${data.board.columns.length} columns · ${data.board.warnings.length} warnings`}
					</p>
				) : (
					<p
						data-testid="board-status"
						role="alert"
						className="mt-6 text-red-400"
					>
						{`${data.error.code}: ${data.error.message}`}
					</p>
				)}
			</div>
		</main>
	);
}
