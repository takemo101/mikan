import { useState } from "react";
import { useArchiveMutation } from "../client/archive-mutation.ts";

// Detail-modal Archive action: the right-aligned `Archive` button plus its
// confirmation modal.
//
// Archiving writes, so it never fires straight from the button. Clicking
// `Archive` opens a lightweight global confirmation dialog that explains the
// consequences before any write: the Issue moves to Status `archived`, it stays a
// Markdown file (it is not deleted), and it disappears from the default board
// once archived Issues are filtered out.
//
// There is no optimistic update: confirming posts to the archive endpoint and,
// only on a successful write, the mutation invalidates Board/detail and the
// component calls `onArchived` so the app can close the detail when the archived
// Issue leaves the visible board. A failed archive keeps the confirmation modal
// open with a structured, user-facing error and never touches filter/selection
// state.
type IssueArchiveActionProps = {
	issueId: string;
	// Called after a successful archive so the app can refetch-driven close the
	// detail modal when the archived Issue leaves the visible board.
	onArchived: () => void;
};

export function IssueArchiveAction({
	issueId,
	onArchived,
}: IssueArchiveActionProps) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const mutation = useArchiveMutation(issueId);

	const openConfirm = () => {
		setError(undefined);
		setOpen(true);
	};

	const closeConfirm = () => {
		setOpen(false);
		setError(undefined);
	};

	const onConfirm = () => {
		setError(undefined);
		mutation.mutate(undefined, {
			onSuccess: (result) => {
				if (!result.ok) {
					setError(`${result.error.code}: ${result.error.message}`);
					return;
				}
				setOpen(false);
				onArchived();
			},
			onError: () => setError("Could not reach the archive API."),
		});
	};

	return (
		<>
			<button
				type="button"
				data-testid="archive-button"
				onClick={openConfirm}
				className="rounded border border-amber-700/60 px-2 py-1 text-xs text-amber-300 outline-none hover:bg-amber-950/40 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
			>
				Archive
			</button>
			{open ? (
				<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
					<div
						role="dialog"
						aria-modal="true"
						aria-label={`Archive issue ${issueId}`}
						data-testid="archive-confirm"
						className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-5 text-neutral-100 shadow-xl outline-none"
					>
						<h2 className="text-sm font-semibold text-neutral-100">
							Archive {issueId}?
						</h2>
						<p
							data-testid="archive-confirm-message"
							className="mt-2 text-sm text-neutral-400"
						>
							This moves the Issue to Status <code>archived</code>. It stays a
							Markdown file under your project — it is not deleted — and
							disappears from the default board once archived Issues are
							filtered out.
						</p>
						{error ? (
							<p
								role="alert"
								data-testid="archive-error"
								className="mt-3 text-sm text-red-400"
							>
								{error}
							</p>
						) : null}
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								data-testid="archive-cancel"
								disabled={mutation.isPending}
								onClick={closeConfirm}
								className="rounded px-2 py-1 text-xs text-neutral-400 outline-none hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60"
							>
								Cancel
							</button>
							<button
								type="button"
								data-testid="archive-confirm-button"
								disabled={mutation.isPending}
								onClick={onConfirm}
								className="rounded bg-amber-600 px-3 py-1 text-xs text-white outline-none hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-60"
							>
								{mutation.isPending ? "Archiving…" : "Archive"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
