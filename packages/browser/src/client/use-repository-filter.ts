import { useCallback, useEffect, useState } from "react";

// URL-backed Repository filter state.
//
// The active Repository filter lives in the `repository` query parameter so the
// view is shareable and survives a reload: opening `?repository=backend`
// restores the filter on mount. Changes are written with `history.replaceState`
// (filtering is a view tweak, not a navigation step), and `popstate` keeps the
// hook in sync with browser back/forward. Selecting `All repositories` removes
// the parameter entirely so the default URL stays clean.
//
// This deliberately uses the native History API rather than scaffolding
// TanStack Router for a single parameter; the typed router can be adopted when
// the `issue` route/search param arrives in a later slice.
export const REPOSITORY_PARAM = "repository";

function readRepositoryParam(): string | undefined {
	if (typeof window === "undefined") return undefined;
	const value = new URLSearchParams(window.location.search).get(
		REPOSITORY_PARAM,
	);
	return value ?? undefined;
}

export function useRepositoryFilter(): [
	string | undefined,
	(next: string | undefined) => void,
] {
	const [filter, setFilter] = useState<string | undefined>(readRepositoryParam);

	useEffect(() => {
		const onPopState = () => setFilter(readRepositoryParam());
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	const update = useCallback((next: string | undefined) => {
		const params = new URLSearchParams(window.location.search);
		if (next) {
			params.set(REPOSITORY_PARAM, next);
		} else {
			params.delete(REPOSITORY_PARAM);
		}
		const query = params.toString();
		const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
		window.history.replaceState(window.history.state, "", url);
		setFilter(next);
	}, []);

	return [filter, update];
}
