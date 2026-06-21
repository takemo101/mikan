import { type FormEvent, useId, useState } from "react";
import { APPENDABLE_SECTIONS, type AppendableSection } from "../append-api.ts";
import { useAppendMutation } from "../client/append-mutation.ts";

// Append Reports/Notes from inside the Focused Markdown Modal.
//
// A small tablist switches the active section between Reports and Notes; a single
// shared textarea/form below posts to the append endpoint. Empty input is caught
// client-side and shown as a form-near error before any request; API failures
// are shown in the same spot. There is no optimistic update — on success the
// mutation invalidates Board and detail so the modal refreshes from disk, and the
// textarea is cleared. The surrounding modal owns the `issue`/`repository` URL
// state, so append success or failure never disturbs it.
type IssueAppendFormProps = {
	issueId: string;
};

export function IssueAppendForm({ issueId }: IssueAppendFormProps) {
	const [section, setSection] = useState<AppendableSection>("Reports");
	const [text, setText] = useState("");
	const [formError, setFormError] = useState<string | undefined>(undefined);
	const mutation = useAppendMutation(issueId);
	const inputId = useId();

	const selectSection = (next: AppendableSection) => {
		setSection(next);
		setFormError(undefined);
	};

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (text.trim().length === 0) {
			setFormError(`${section} text cannot be empty.`);
			return;
		}
		setFormError(undefined);
		mutation.mutate(
			{ section, body: text },
			{
				onSuccess: (result) => {
					if (!result.ok) {
						setFormError(`${result.error.code}: ${result.error.message}`);
						return;
					}
					setText("");
				},
				onError: () => setFormError("Could not reach the append API."),
			},
		);
	};

	return (
		<section
			data-testid="issue-append"
			className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800"
		>
			<div
				role="tablist"
				aria-label="Append section"
				className="mb-2 flex gap-1"
			>
				{APPENDABLE_SECTIONS.map((name) => (
					<button
						key={name}
						type="button"
						role="tab"
						aria-selected={section === name}
						data-testid={`append-tab-${name.toLowerCase()}`}
						onClick={() => selectSection(name)}
						className={`rounded px-2 py-1 text-xs outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${
							section === name
								? "bg-neutral-900 text-white dark:bg-neutral-800 dark:text-neutral-100"
								: "text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
						}`}
					>
						{name}
					</button>
				))}
			</div>
			<form data-testid="append-form" onSubmit={onSubmit}>
				<label className="sr-only" htmlFor={inputId}>
					{`Add ${section}`}
				</label>
				<textarea
					id={inputId}
					data-testid="append-input"
					aria-label={`Add ${section}`}
					value={text}
					onChange={(event) => setText(event.currentTarget.value)}
					rows={3}
					className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-950 outline-none focus-visible:border-sky-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
				/>
				{formError ? (
					<p
						role="alert"
						data-testid="append-error"
						className="mt-1 text-sm text-red-400"
					>
						{formError}
					</p>
				) : null}
				<div className="mt-2 flex justify-end">
					<button
						type="submit"
						data-testid="append-submit"
						disabled={mutation.isPending}
						className="rounded bg-sky-600 px-3 py-1 text-sm text-white outline-none hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-60"
					>
						{mutation.isPending ? "Adding…" : `Add ${section}`}
					</button>
				</div>
			</form>
		</section>
	);
}
