import type { BoardRepositoryView } from "@mikan/core";

// Workspace Repository filter control.
//
// Lists `All repositories` plus the configured Repositories in config order
// (the order the Board API returns them). Only rendered in workspace mode — when
// no Repositories are configured there is nothing to filter by. Filtering acts
// on the primary `repository` only.
type RepositoryFilterProps = {
	repositories?: BoardRepositoryView[];
	value: string | undefined;
	onChange: (next: string | undefined) => void;
};

export function RepositoryFilter({
	repositories,
	value,
	onChange,
}: RepositoryFilterProps) {
	if (!repositories || repositories.length === 0) return null;
	// Guard against a stale/unknown `?repository=` value so the control falls back
	// to "All repositories" while filtering still yields a graceful no-match.
	const selectValue = repositories.some((repository) => repository.id === value)
		? value
		: "";

	return (
		<div className="flex items-center gap-2">
			<label
				htmlFor="repository-filter"
				className="text-xs font-medium uppercase tracking-wide text-neutral-500"
			>
				Repository
			</label>
			<select
				id="repository-filter"
				data-testid="repository-filter"
				value={selectValue}
				onChange={(event) =>
					onChange(event.target.value === "" ? undefined : event.target.value)
				}
				className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
			>
				<option value="">All repositories</option>
				{repositories.map((repository) => (
					<option key={repository.id} value={repository.id}>
						{repository.title}
					</option>
				))}
			</select>
		</div>
	);
}
