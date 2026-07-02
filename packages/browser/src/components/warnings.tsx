import type { BoardWarningView } from "@mikan/core";
import { useState } from "react";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";

// Board warning surface.
//
// Shows a compact toolbar warning button instead of expanding inline details.
// Long warning details live in a modal so they never consume the Kanban lanes'
// vertical space. Structured `warningDetails` are grouped by Issue ID when
// available, with config/board-level warnings grouped together.
type WarningsProps = {
	warnings: string[];
	details?: BoardWarningView[];
};

type WarningItem = {
	text: string;
	message: string;
	issueId?: string;
};

type WarningGroup = {
	id: string;
	title: string;
	items: WarningItem[];
};

export function Warnings({ warnings, details }: WarningsProps) {
	const [open, setOpen] = useState(false);
	if (warnings.length === 0) return null;
	const groups = groupWarnings(warnings, details);
	const countLabel = `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;

	return (
		<section data-testid="board-warnings" role="status" className="shrink-0">
			<Button
				type="button"
				data-testid="warning-trigger"
				aria-label={`Open ${warnings.length} board warning${warnings.length === 1 ? "" : "s"}`}
				onPress={() => setOpen(true)}
				className="relative inline-flex size-8 items-center justify-center rounded-full border border-amber-500/70 bg-amber-100 text-base text-amber-800 shadow-sm outline-none hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
			>
				<span aria-hidden="true">⚠</span>
				<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-500 px-1 text-center text-[0.65rem] font-bold leading-5 text-amber-950 dark:bg-amber-300">
					{warnings.length}
				</span>
			</Button>
			{open ? (
				<WarningsModal
					countLabel={countLabel}
					groups={groups}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</section>
	);
}

function WarningsModal({
	countLabel,
	groups,
	onClose,
}: {
	countLabel: string;
	groups: WarningGroup[];
	onClose: () => void;
}) {
	return (
		<ModalOverlay
			isOpen
			isDismissable
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
			data-testid="warning-overlay"
			className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/45 p-4 dark:bg-black/65"
		>
			<Modal className="flex max-h-full w-full max-w-2xl">
				<Dialog
					aria-label="Board warnings"
					data-testid="warning-dialog"
					className="flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-lg border border-amber-300 bg-amber-50 text-amber-950 shadow-xl outline-none dark:border-amber-900/70 dark:bg-amber-950 dark:text-amber-100"
				>
					<header className="flex items-center justify-between gap-3 border-b border-amber-200 px-5 py-3 dark:border-amber-900/70">
						<div className="flex items-center gap-2">
							<span aria-hidden="true">⚠</span>
							<h2 className="font-semibold">Board warnings</h2>
							<span className="rounded-full bg-amber-200 px-2 py-0.5 font-mono text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
								{countLabel}
							</span>
						</div>
						<Button
							slot="close"
							data-testid="warning-close"
							onPress={onClose}
							aria-label="Close board warnings"
							className="rounded px-2 py-1 text-sm text-amber-700 outline-none hover:text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 dark:text-amber-300 dark:hover:text-amber-100"
						>
							✕
						</Button>
					</header>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
						<p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
							Warnings come from the current board scan. Fix the Markdown or
							config, then the Browser will refresh them from disk.
						</p>
						<div className="grid gap-3">
							{groups.map((group) => (
								<section
									key={group.id}
									data-testid={`warning-group-${group.id}`}
									className="rounded-md border border-amber-200 bg-white/70 p-3 dark:border-amber-900/70 dark:bg-amber-950/40"
								>
									<h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
										{group.title}
									</h3>
									<ul className="space-y-1">
										{group.items.map((item) => (
											<li
												key={item.text}
												data-testid="warning-detail"
												className="break-words font-mono text-xs leading-5 text-amber-900 dark:text-amber-200"
											>
												{item.message}
											</li>
										))}
									</ul>
								</section>
							))}
						</div>
					</div>
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}

function groupWarnings(
	warnings: string[],
	details: BoardWarningView[] | undefined,
): WarningGroup[] {
	const items: WarningItem[] =
		details && details.length > 0
			? details.map((detail) => ({
					text: detail.text,
					message: detail.message || detail.text,
					issueId: detail.issueId,
				}))
			: warnings.map((text) => ({ text, message: text }));
	const byGroup = new Map<string, WarningGroup>();
	for (const item of items) {
		const id = item.issueId ?? "board";
		const existing = byGroup.get(id);
		if (existing) {
			existing.items.push(item);
			continue;
		}
		byGroup.set(id, {
			id,
			title: item.issueId ?? "Board/config",
			items: [item],
		});
	}
	return Array.from(byGroup.values());
}
