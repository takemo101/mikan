import type { BoardLabelView } from "@mikan/core";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { IssueDetailResponse, IssueDetailView } from "../issue-api.ts";
import { IssueAppendForm } from "./issue-append-form.tsx";
import { IssueArchiveAction } from "./issue-archive-action.tsx";
import { IssueLabelEditor } from "./issue-label-editor.tsx";

// The Focused Markdown Modal: a large, accessible dialog centered on reading the
// selected Issue's Markdown. Built on React Aria Components' Dialog/Modal so it
// gets focus management, an Escape/backdrop dismiss, and the dialog role for
// free. Markdown renders through `react-markdown` + `remark-gfm` with Tailwind
// Typography (`prose`); raw HTML is left disabled (react-markdown drops it by
// default), so embedded HTML cannot inject elements.
type IssueDetailModalProps = {
	issueId: string;
	data: IssueDetailResponse | undefined;
	isPending: boolean;
	isError: boolean;
	// All config-defined Labels in config order, sourced from the Board API and
	// used to populate the Label editor popover's checklist.
	configLabels: BoardLabelView[];
	onClose: () => void;
	// Called after a successful archive so the app can close the detail when the
	// archived Issue leaves the visible board.
	onArchived: () => void;
};

export function IssueDetailModal({
	issueId,
	data,
	isPending,
	isError,
	configLabels,
	onClose,
	onArchived,
}: IssueDetailModalProps) {
	return (
		<ModalOverlay
			isOpen
			isDismissable
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
		>
			<Modal className="w-full max-w-3xl">
				<Dialog
					aria-label={`Issue ${issueId}`}
					data-testid="issue-detail"
					className="rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-xl outline-none"
				>
					<header className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
						<span className="font-mono text-xs text-neutral-500">
							{issueId}
						</span>
						<Button
							slot="close"
							data-testid="issue-detail-close"
							onPress={onClose}
							aria-label="Close issue detail"
							className="rounded px-2 py-1 text-sm text-neutral-400 outline-none hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
						>
							✕
						</Button>
					</header>
					{data?.ok ? (
						<div
							data-testid="issue-detail-action-bar"
							className="flex items-center gap-2 border-b border-neutral-800 px-5 py-2"
						>
							<IssueLabelEditor
								issueId={data.issue.id}
								currentLabels={data.issue.labels}
								configLabels={configLabels}
							/>
							<div className="ml-auto">
								<IssueArchiveAction
									issueId={data.issue.id}
									onArchived={onArchived}
								/>
							</div>
						</div>
					) : null}
					<div className="max-h-[75vh] overflow-y-auto px-5 py-4">
						{isPending ? (
							<p data-testid="issue-detail-status" className="text-neutral-500">
								Loading issue…
							</p>
						) : isError ? (
							<p
								data-testid="issue-detail-status"
								role="alert"
								className="text-red-400"
							>
								Could not reach the issue API.
							</p>
						) : data?.ok ? (
							<>
								<IssueDetailBody issue={data.issue} />
								<IssueAppendForm issueId={data.issue.id} />
							</>
						) : (
							<p
								data-testid="issue-detail-status"
								role="alert"
								className="text-red-400"
							>
								{data
									? `${data.error.code}: ${data.error.message}`
									: "Issue unavailable."}
							</p>
						)}
					</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function IssueDetailBody({ issue }: { issue: IssueDetailView }) {
	const blocked = issue.dependencyStatus === "blocked";
	return (
		<article data-testid="issue-detail-content">
			<h2 className="text-lg font-semibold leading-snug text-neutral-100">
				{issue.title}
			</h2>
			<dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-neutral-500">
				<div className="flex gap-1">
					<dt className="text-neutral-600">status</dt>
					<dd data-testid="issue-detail-status-value">{issue.status}</dd>
				</div>
				{issue.repository ? (
					<div className="flex gap-1">
						<dt className="text-neutral-600">repository</dt>
						<dd title={issue.repositoryTitle}>{issue.repository}</dd>
					</div>
				) : null}
				{blocked &&
				issue.unmetDependencies &&
				issue.unmetDependencies.length > 0 ? (
					<div className="flex gap-1 text-amber-400">
						<dt className="text-amber-600">blocked by</dt>
						<dd>{issue.unmetDependencies.join(", ")}</dd>
					</div>
				) : null}
			</dl>
			{issue.labels.length > 0 ? (
				<ul aria-label="labels" className="mt-2 flex flex-wrap gap-1">
					{issue.labels.map((label) => (
						<li
							key={label}
							className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300"
						>
							{issue.labelTitles?.[label] ?? label}
						</li>
					))}
				</ul>
			) : null}
			<div
				data-testid="issue-markdown"
				className="prose prose-invert prose-sm mt-4 max-w-none"
			>
				<ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.body}</ReactMarkdown>
			</div>
		</article>
	);
}
