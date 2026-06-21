import { useCallback, useEffect, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useGitHubMirrorMutation } from "../client/github-mirror-mutation.ts";
import type { IssueMirrorTarget } from "../issue-api.ts";

// Detail-modal GitHub Mirror action: the `Create GitHub Mirror` /
// `Update GitHub Mirror` button plus its confirmation modal.
//
// The button label reflects whether the Issue already has a Mirror: an Issue with
// `github_issue` shows `Update GitHub Mirror`, an unmirrored Issue shows
// `Create GitHub Mirror`. Mirroring does external GitHub work, so it never fires
// straight from the button. Clicking opens a lightweight global confirmation
// dialog that shows the resolved target repo and the create-vs-update intent
// before any write, with a source-of-truth note that the mikan Markdown Issue
// remains authoritative.
//
// The target repo comes from the detail API's `mirrorTarget`, resolved through
// the shared GitHub Mirror rules (single-project `github.repo`, or workspace
// `repository` -> `repositories[].github.repo`; never Labels or `affects`). When
// the target cannot be resolved, the confirmation explains why and disables the
// confirm button instead of posting a request that would only fail.
//
// There is no optimistic update: confirming posts to the github-mirror endpoint
// and, only on a successful write, the mutation invalidates/refetches Board and
// the selected Issue detail so the refreshed detail shows the new `github_issue`.
// A failed Mirror keeps the confirmation modal open with a structured,
// user-facing error and never touches filter/selection state.
type IssueGitHubMirrorActionProps = {
	issueId: string;
	// Whether the Issue already has a GitHub Mirror (`github_issue`). Drives the
	// button/confirm copy between creating and updating a Mirror.
	isMirrored: boolean;
	// The resolved Mirror target for confirmation display, from the detail API.
	mirrorTarget: IssueMirrorTarget;
};

export function IssueGitHubMirrorAction({
	issueId,
	isMirrored,
	mirrorTarget,
}: IssueGitHubMirrorActionProps) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const mutation = useGitHubMirrorMutation(issueId);

	const actionLabel = isMirrored
		? "Update GitHub Mirror"
		: "Create GitHub Mirror";

	const openConfirm = () => {
		setError(undefined);
		setOpen(true);
	};

	const closeConfirm = useCallback(() => {
		setOpen(false);
		setError(undefined);
	}, []);

	const onConfirm = () => {
		setError(undefined);
		mutation.mutate(undefined, {
			onSuccess: (result) => {
				if (!result.ok) {
					setError(`${result.error.code}: ${result.error.message}`);
					return;
				}
				setOpen(false);
			},
			onError: () => setError("Could not reach the GitHub Mirror API."),
		});
	};

	useEffect(() => {
		if (!open) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			if (!mutation.isPending) closeConfirm();
		};
		document.addEventListener("keydown", closeOnEscape, { capture: true });
		return () => {
			document.removeEventListener("keydown", closeOnEscape, { capture: true });
		};
	}, [closeConfirm, open, mutation.isPending]);

	return (
		<>
			<button
				type="button"
				data-testid="github-mirror-button"
				onClick={openConfirm}
				className="rounded border border-sky-300 px-2 py-1 text-xs text-sky-700 outline-none hover:bg-sky-50 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-sky-700/60 dark:text-sky-300 dark:hover:bg-sky-950/40 dark:hover:text-sky-200"
			>
				{actionLabel}
			</button>
			{open ? (
				<ModalOverlay
					isOpen
					isDismissable={!mutation.isPending}
					onOpenChange={(nextOpen) => {
						if (!nextOpen && !mutation.isPending) closeConfirm();
					}}
					className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
				>
					<Modal className="w-full max-w-md">
						<Dialog
							aria-label={`${actionLabel} for ${issueId}`}
							className="rounded-lg border border-neutral-200 bg-white text-neutral-950 shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
						>
							<div data-testid="github-mirror-confirm" className="p-5">
								<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">
									{actionLabel} for {issueId}?
								</h2>
								<div
									data-testid="github-mirror-confirm-message"
									className="mt-2 space-y-2 text-sm text-neutral-600 dark:text-neutral-400"
								>
									{mirrorTarget.ok ? (
										<p>
											{isMirrored ? "Updates" : "Creates"} the GitHub Issue
											mirror in{" "}
											<code data-testid="github-mirror-target">
												{mirrorTarget.repo}
											</code>
											. The mikan Markdown Issue stays the source of truth.
										</p>
									) : (
										<p data-testid="github-mirror-target-error">
											No GitHub Mirror target is configured for this Issue:{" "}
											{mirrorTarget.code}: {mirrorTarget.message}
										</p>
									)}
								</div>
								{error ? (
									<p
										role="alert"
										data-testid="github-mirror-error"
										className="mt-3 text-sm text-red-400"
									>
										{error}
									</p>
								) : null}
								<div className="mt-4 flex justify-end gap-2">
									<button
										type="button"
										data-testid="github-mirror-cancel"
										disabled={mutation.isPending}
										onClick={closeConfirm}
										className="rounded px-2 py-1 text-xs text-neutral-500 outline-none hover:text-neutral-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-100"
									>
										Cancel
									</button>
									<button
										type="button"
										data-testid="github-mirror-confirm-button"
										disabled={mutation.isPending || !mirrorTarget.ok}
										onClick={onConfirm}
										className="rounded bg-sky-600 px-3 py-1 text-xs text-white outline-none hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-60"
									>
										{mutation.isPending ? "Mirroring…" : actionLabel}
									</button>
								</div>
							</div>
						</Dialog>
					</Modal>
				</ModalOverlay>
			) : null}
		</>
	);
}
