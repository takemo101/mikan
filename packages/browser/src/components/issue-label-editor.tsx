import type { BoardLabelView } from "@mikan/core";
import { useState } from "react";
import { useLabelsMutation } from "../client/labels-mutation.ts";

// Detail-modal Label editor: the `Edit labels` action plus its nested popover.
//
// `Edit labels` toggles a small in-modal popover (a plain positioned container,
// not a second ModalOverlay) that lists every config-defined Label as a checkbox
// in config order with the Issue's current selections checked. Any config-unknown
// Labels already on the Issue are shown read-only so the user can see they will
// be preserved. Saving posts only the selected known Label ids; the endpoint
// re-orders them to config order and re-appends the preserved unknown Labels.
//
// There is no optimistic update: on a successful save the mutation invalidates
// Board and detail, the popover closes, and the modal body re-renders the Labels
// from the refetched detail. A failed save keeps the popover open with a
// form-near error and leaves the current selection in place.
type IssueLabelEditorProps = {
	issueId: string;
	// The Issue's current Labels (frontmatter order), including config-unknown ones.
	currentLabels: string[];
	// All config-defined Labels in config order.
	configLabels: BoardLabelView[];
};

export function IssueLabelEditor({
	issueId,
	currentLabels,
	configLabels,
}: IssueLabelEditorProps) {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | undefined>(undefined);
	const mutation = useLabelsMutation(issueId);

	const knownIds = new Set(configLabels.map((label) => label.id));
	const preservedUnknown = currentLabels.filter(
		(label) => !knownIds.has(label),
	);

	const openPopover = () => {
		// Initialize the checklist from the current known selections each time the
		// popover opens so it always reflects the latest persisted detail.
		setSelected(new Set(currentLabels.filter((label) => knownIds.has(label))));
		setError(undefined);
		setOpen(true);
	};

	const closePopover = () => {
		setOpen(false);
		setError(undefined);
	};

	const toggle = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const onSave = () => {
		setError(undefined);
		mutation.mutate(
			{ labels: [...selected] },
			{
				onSuccess: (result) => {
					if (!result.ok) {
						setError(`${result.error.code}: ${result.error.message}`);
						return;
					}
					setOpen(false);
				},
				onError: () => setError("Could not reach the labels API."),
			},
		);
	};

	return (
		<div className="relative">
			<button
				type="button"
				data-testid="edit-labels-button"
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={() => (open ? closePopover() : openPopover())}
				className="rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300 outline-none hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
			>
				Edit labels
			</button>
			{open ? (
				<div
					data-testid="label-popover"
					className="absolute left-0 z-10 mt-1 w-64 rounded-lg border border-neutral-800 bg-neutral-950 p-3 shadow-xl"
				>
					<fieldset className="m-0 border-0 p-0">
						<legend className="mb-2 text-xs font-medium text-neutral-400">
							Labels
						</legend>
						{configLabels.length > 0 ? (
							<ul className="flex flex-col gap-1">
								{configLabels.map((label) => (
									<li key={label.id}>
										<label className="flex items-center gap-2 text-sm text-neutral-200">
											<input
												type="checkbox"
												data-testid={`label-checkbox-${label.id}`}
												checked={selected.has(label.id)}
												onChange={() => toggle(label.id)}
												className="accent-sky-500"
											/>
											{label.title}
										</label>
									</li>
								))}
							</ul>
						) : (
							<p className="text-xs text-neutral-500">
								No Labels are defined in config.
							</p>
						)}
					</fieldset>
					{preservedUnknown.length > 0 ? (
						<div className="mt-3 border-t border-neutral-800 pt-2">
							<p className="mb-1 text-xs text-neutral-500">
								Preserved (not in config)
							</p>
							<ul
								aria-label="Preserved labels"
								className="flex flex-wrap gap-1"
							>
								{preservedUnknown.map((label) => (
									<li
										key={label}
										data-testid="preserved-label"
										className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400"
									>
										{label}
									</li>
								))}
							</ul>
						</div>
					) : null}
					{error ? (
						<p
							role="alert"
							data-testid="label-error"
							className="mt-2 text-sm text-red-400"
						>
							{error}
						</p>
					) : null}
					<div className="mt-3 flex justify-end gap-2">
						<button
							type="button"
							data-testid="label-cancel"
							onClick={closePopover}
							className="rounded px-2 py-1 text-xs text-neutral-400 outline-none hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
						>
							Cancel
						</button>
						<button
							type="button"
							data-testid="label-save"
							disabled={mutation.isPending}
							onClick={onSave}
							className="rounded bg-sky-600 px-3 py-1 text-xs text-white outline-none hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-60"
						>
							{mutation.isPending ? "Saving…" : "Save"}
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
