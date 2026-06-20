import { useCallback, useEffect, useState } from "react";

// URL-backed Repository filter state.
//
// The active Repository filter lives in the `repository` query parameter and an
// optional `includeAffected=1` scope flag, so the view is shareable and survives
// a reload: opening `?repository=backend&includeAffected=1` restores both the
// filter and the expanded scope on mount. Changes are written with
// `history.replaceState` (filtering is a view tweak, not a navigation step), and
// `popstate` keeps the hook in sync with browser back/forward. Selecting
// `All repositories` removes both parameters so the default URL stays clean.
//
// `includeAffected` is only meaningful with a selected Repository, so it is
// normalized away whenever the Repository is cleared and is never written to the
// URL on its own — keeping the default primary-only URL contract intact.
//
// This deliberately uses the native History API rather than scaffolding
// TanStack Router for two parameters; the typed router can be adopted when the
// `issue` route/search param arrives in a later slice.
export const REPOSITORY_PARAM = "repository";
export const INCLUDE_AFFECTED_PARAM = "includeAffected";

export type RepositoryFilterState = {
	repository: string | undefined;
	includeAffected: boolean;
};

function normalize(state: RepositoryFilterState): RepositoryFilterState {
	return state.repository
		? state
		: { repository: undefined, includeAffected: false };
}

function readState(): RepositoryFilterState {
	if (typeof window === "undefined") {
		return { repository: undefined, includeAffected: false };
	}
	const params = new URLSearchParams(window.location.search);
	const repository = params.get(REPOSITORY_PARAM) ?? undefined;
	return normalize({
		repository,
		includeAffected: params.get(INCLUDE_AFFECTED_PARAM) === "1",
	});
}

export function useRepositoryFilter(): [
	RepositoryFilterState,
	(next: RepositoryFilterState) => void,
] {
	const [state, setState] = useState<RepositoryFilterState>(readState);

	useEffect(() => {
		const onPopState = () => setState(readState());
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	const update = useCallback((next: RepositoryFilterState) => {
		const normalized = normalize(next);
		const params = new URLSearchParams(window.location.search);
		if (normalized.repository) {
			params.set(REPOSITORY_PARAM, normalized.repository);
		} else {
			params.delete(REPOSITORY_PARAM);
		}
		if (normalized.includeAffected) {
			params.set(INCLUDE_AFFECTED_PARAM, "1");
		} else {
			params.delete(INCLUDE_AFFECTED_PARAM);
		}
		const query = params.toString();
		const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
		window.history.replaceState(window.history.state, "", url);
		setState(normalized);
	}, []);

	return [state, update];
}
