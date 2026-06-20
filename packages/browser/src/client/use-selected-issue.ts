import { useCallback, useEffect, useState } from "react";

// URL-backed selected-Issue state for the Focused Markdown Modal.
//
// The open Issue lives in the `issue` query parameter so the detail view is
// shareable and survives a reload: opening `?issue=MIK-123` restores the modal
// on mount. Changes are written with `history.replaceState` (opening/closing the
// modal is a view tweak, not a navigation step), and `popstate` keeps the hook
// in sync with browser back/forward. Closing the modal removes only the `issue`
// parameter, so an active `repository` filter is preserved.
//
// This mirrors `use-repository-filter` and deliberately uses the native History
// API rather than scaffolding TanStack Router for two independent query
// parameters; the typed router can be adopted later without changing this
// surface. See the MIK-153 report for the rationale.
export const ISSUE_PARAM = "issue";

function readIssueParam(): string | undefined {
	if (typeof window === "undefined") return undefined;
	const value = new URLSearchParams(window.location.search).get(ISSUE_PARAM);
	return value ?? undefined;
}

export function useSelectedIssue(): [
	string | undefined,
	(next: string | undefined) => void,
] {
	const [selected, setSelected] = useState<string | undefined>(readIssueParam);

	useEffect(() => {
		const onPopState = () => setSelected(readIssueParam());
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	const update = useCallback((next: string | undefined) => {
		const params = new URLSearchParams(window.location.search);
		if (next) {
			params.set(ISSUE_PARAM, next);
		} else {
			params.delete(ISSUE_PARAM);
		}
		const query = params.toString();
		const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
		window.history.replaceState(window.history.state, "", url);
		setSelected(next);
	}, []);

	return [selected, update];
}
