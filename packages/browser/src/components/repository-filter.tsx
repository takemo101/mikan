import type { BoardRepositoryView } from "@mikan/core";
import type { RepositoryFilterState } from "../client/use-repository-filter.ts";

// Workspace Repository filter control.
//
// Lists `All repositories` plus the configured Repositories in config order
// (the order the Board API returns them). Only rendered in workspace mode — when
// no Repositories are configured there is nothing to filter by. A segmented
// `Primary | +Affected` scope control sits beside the selector: `Primary`
// filters by the primary `repository` only, while `+Affected` also surfaces
// Cards whose `affects` contains the selected Repository. The scope only makes
// sense once a Repository is chosen, so it is disabled while `All repositories`
// is active.
type RepositoryFilterProps = {
	repositories?: BoardRepositoryView[];
	value: string | undefined;
	includeAffected: boolean;
	onChange: (next: RepositoryFilterState) => void;
};

export function RepositoryFilter({
	repositories,
	value,
	includeAffected,
	onChange,
}: RepositoryFilterProps) {
	if (!repositories || repositories.length === 0) return null;
	// Guard against a stale/unknown `?repository=` value so the control falls back
	// to "All repositories" while filtering still yields a graceful no-match.
	const selectValue = repositories.some((repository) => repository.id === value)
		? value
		: "";
	const scopeDisabled = selectValue === "";

	return (
		<div className="flex items-center gap-3">
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
						onChange({
							repository:
								event.target.value === "" ? undefined : event.target.value,
							includeAffected,
						})
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
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Scope
				</span>
				<fieldset
					data-testid="repository-scope"
					aria-label="Repository scope"
					className="inline-flex overflow-hidden rounded border border-neutral-700 p-0"
				>
					<ScopeButton
						label="Primary"
						active={!includeAffected}
						disabled={scopeDisabled}
						onClick={() =>
							onChange({ repository: value, includeAffected: false })
						}
					/>
					<ScopeButton
						label="+Affected"
						active={includeAffected}
						disabled={scopeDisabled}
						onClick={() =>
							onChange({ repository: value, includeAffected: true })
						}
					/>
				</fieldset>
			</div>
		</div>
	);
}

type ScopeButtonProps = {
	label: string;
	active: boolean;
	disabled: boolean;
	onClick: () => void;
};

function ScopeButton({ label, active, disabled, onClick }: ScopeButtonProps) {
	return (
		<button
			type="button"
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={`px-2 py-1 text-sm ${
				active
					? "bg-neutral-200 text-neutral-900"
					: "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
			} disabled:cursor-not-allowed disabled:opacity-50`}
		>
			{label}
		</button>
	);
}
