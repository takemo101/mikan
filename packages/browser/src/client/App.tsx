// Minimal Browser app shell (MIK-150). The real Kanban board, Repository
// filter, Markdown detail, and write actions arrive in later Browser Issues.
// The visual direction is the dark, compact, developer-native "Local Command
// Board"; this shell only establishes the package, build, and mount point.
export function App() {
	return (
		<main className="min-h-screen bg-neutral-950 text-neutral-100">
			<div className="mx-auto max-w-3xl px-6 py-16">
				<h1 className="text-2xl font-semibold tracking-tight">mikan browser</h1>
				<p className="mt-3 text-neutral-400">
					Local board UI is starting. The Kanban board loads in an upcoming
					release.
				</p>
			</div>
		</main>
	);
}
