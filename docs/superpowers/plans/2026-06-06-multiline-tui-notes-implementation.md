# Multiline TUI Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the documented multiline TUI Note modal behavior in three small, AI-grabbable Issues.

**Architecture:** Keep Note editing as a lightweight TUI prompt, not a full Markdown editor. Put pure draft-editing behavior in `packages/tui/src/navigation.ts`, keep save behavior in `packages/tui/src/mutations.ts`, and keep prompt projection/rendering in `packages/tui/src/prompt-view-model.ts` plus `packages/tui/src/prompt-text.ts`.

**Tech Stack:** Bun, TypeScript, OpenTUI React renderer, `bun:test`, mikan Markdown Issue mutations.

---

## Source spec

- Issues: `MIK-125` (<https://github.com/takemo101/mikan/issues/77>), `MIK-126` (<https://github.com/takemo101/mikan/issues/78>), `MIK-127` (<https://github.com/takemo101/mikan/issues/79>)
- Design docs: `docs/design.md`, `site/tui.md`, `docs/smoke.md`
- Required user-facing behavior:
  - `n` opens the Note modal.
  - `Enter` inserts a newline while the Note modal is open.
  - `Ctrl+S` saves the Note.
  - `Esc` cancels.
  - Note body Markdown is saved as typed, trimming only leading/trailing blank space.
  - Empty saves keep the modal open and show `Note cannot be empty`.
  - Cursor editing is line-local: left/right only, no vertical movement.
  - Render a `▌` cursor marker and a trailing 5-line input window.

## File map

- Modify `packages/tui/src/selection.ts`
  - Add optional Note cursor state, likely `noteCursorOffset?: number`, to `TuiSelection`.
- Modify `packages/tui/src/navigation.ts`
  - Extend key/action typing for Ctrl+S.
  - Update `applyNoteInput` to support newline insertion and, later, cursor-aware editing.
  - Ensure modal open/cancel paths reset cursor state where appropriate.
- Modify `packages/tui/src/index.ts`
  - Accept `ctrl?: boolean` from OpenTUI keyboard events.
  - Save Note on Ctrl+S instead of Enter.
  - Treat Enter as draft input while `selection.noteOpen` is true.
- Modify `packages/tui/src/mutations.ts`
  - Keep `noteOpen: true` on empty save errors.
  - Preserve detail mode and draft state on empty save.
- Modify `packages/tui/src/prompt-view-model.ts`
  - Replace single-line Note prompt projection with rendered input lines, hint, and feedback.
- Modify `packages/tui/src/prompt-text.ts`
  - Render Note input lines and updated hint text.
- Modify `packages/tui/__tests__/tui.test.ts`
  - Add/adjust unit tests for Note input behavior, mutation behavior, and prompt rendering.
- Modify docs only if implementation changes wording from the already documented behavior:
  - `docs/smoke.md`
  - `site/tui.md`
  - `docs/design.md`

---

## MIK-125: Implement multiline Note save semantics

**Files:**
- Modify: `packages/tui/src/index.ts`
- Modify: `packages/tui/src/navigation.ts`
- Modify: `packages/tui/src/mutations.ts`
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Create a branch for MIK-125**

Run:

```sh
but status -fv
but branch new mik-125-multiline-note-save --status-after
```

Expected: clean workspace with a new active branch.

- [ ] **Step 2: Write failing tests for Enter newline and Ctrl+S save intent**

In `packages/tui/__tests__/tui.test.ts`, update the existing `opens an append-note interaction for the selected Issue` test or add a nearby test with these assertions:

```ts
expect(applyNoteInput({ ...selection, noteDraft: "A" }, "enter").noteDraft).toBe(
	"A\n",
);
expect(keyToTuiAction("s", false, true)).toBe("save-note");
```

If `keyToTuiAction` does not yet accept a `ctrl` argument, write the assertion in the desired final shape first so the test fails for the right reason.

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --grep "append-note"
```

Expected: fail because Enter is still treated as save and/or Ctrl+S is not mapped.

- [ ] **Step 3: Add a Note save action and newline draft input**

In `packages/tui/src/navigation.ts`, extend `TuiAction` with `"save-note"`, update `keyToTuiAction` to accept `ctrl = false`, and map Ctrl+S:

```ts
export function keyToTuiAction(
	keyName: string | undefined,
	shift = false,
	ctrl = false,
): TuiAction | undefined {
	if (ctrl && keyName === "s") return "save-note";
	// existing mappings stay below
}
```

In `applyNoteInput`, handle Enter as a newline:

```ts
if (keyName === "enter" || keyName === "return") {
	return {
		...selection,
		noteDraft: `${selection.noteDraft ?? ""}\n`,
	};
}
```

Keep existing character, Space, Shift, and Backspace behavior for this Issue.

- [ ] **Step 4: Wire Ctrl+S save in the TUI app**

In `packages/tui/src/index.ts`, widen the key event type:

```ts
useKeyboard((key: { name?: string; shift?: boolean; ctrl?: boolean }) => {
	const action = keyToTuiAction(key.name, key.shift, key.ctrl);
```

Inside `if (selection.noteOpen)`, replace Enter-save handling with save-note handling:

```ts
if (action === "save-note") {
	const result = appendSelectedIssueNote({
		cwd: options.cwd,
		model,
		selection,
		body: selection.noteDraft ?? "",
	});
	setModel(result.model);
	setSelection({ ...result.selection, message: result.message });
	return;
}
```

Let Enter fall through to `applyNoteInput` so it inserts `\n`.

- [ ] **Step 5: Keep empty saves in the Note modal**

In `packages/tui/src/mutations.ts`, change the empty body branch in `appendSelectedIssueNote` from closing the modal to preserving it:

```ts
if (!body) {
	return {
		ok: false,
		model: options.model,
		selection: { ...options.selection, noteOpen: true },
		message: "Note cannot be empty",
	};
}
```

- [ ] **Step 6: Add failing/passing tests for empty save and multiline persistence**

In `packages/tui/__tests__/tui.test.ts`, add assertions near the existing append tests:

```ts
const empty = appendSelectedIssueNote({
	cwd,
	model,
	selection: { columnIndex: 1, cardIndex: 0, detailOpen: false, noteOpen: true, noteDraft: "   " },
	body: "   ",
	now,
});
expect(empty.ok).toBe(false);
expect(empty.selection.noteOpen).toBe(true);
expect(empty.message).toContain("Note cannot be empty");
```

Add a multiline append assertion:

```ts
const result = appendSelectedIssueNote({
	cwd,
	model,
	selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
	body: "Line one\n- Line two",
	now,
});
expect(result.ok).toBe(true);
const markdown = readFileSync(join(cwd, ".mikan", "ready", "MIK-001.md"), "utf8");
expect(markdown).toContain("Line one\n- Line two");
```

- [ ] **Step 7: Run checks for MIK-125**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --grep "note"
bun run typecheck
bun run check
```

Expected: all pass.

- [ ] **Step 8: Commit MIK-125**

Run:

```sh
but status -fv
but commit <branch-id> -m "Implement multiline Note save semantics" --changes <file-ids> --status-after
```

Use the branch ID and file IDs from `but status -fv`.

---

## MIK-126: Add line-local cursor editing for TUI Notes

**Files:**
- Modify: `packages/tui/src/selection.ts`
- Modify: `packages/tui/src/navigation.ts`
- Modify: `packages/tui/src/mutations.ts`
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Start from MIK-125**

Run:

```sh
but status -fv
but branch new mik-126-note-cursor-editing --status-after
```

If MIK-125 is still active, stack this branch above it with the branch IDs from `but status -fv`:

```sh
but status -fv
but move <mik-126-branch-id> <mik-125-branch-id>
```

Expected: MIK-126 changes build on MIK-125.

- [ ] **Step 2: Add cursor state to selection**

In `packages/tui/src/selection.ts`, add:

```ts
noteCursorOffset?: number;
```

to `TuiSelection` near `noteDraft?: string`.

- [ ] **Step 3: Write failing tests for cursor insertion and bounds**

In `packages/tui/__tests__/tui.test.ts`, add a focused pure-input test near the existing `applyNoteInput` assertions:

```ts
const base: TuiSelection = {
	columnIndex: 1,
	cardIndex: 0,
	detailOpen: false,
	noteOpen: true,
	noteDraft: "abc",
	noteCursorOffset: 1,
};
expect(applyNoteInput(base, "X").noteDraft).toBe("aXbc");
expect(applyNoteInput(base, "X").noteCursorOffset).toBe(2);
expect(applyNoteInput(base, "left").noteCursorOffset).toBe(0);
expect(applyNoteInput({ ...base, noteCursorOffset: 0 }, "left").noteCursorOffset).toBe(0);
expect(applyNoteInput(base, "right").noteCursorOffset).toBe(2);
```

Add current-line bounds around newlines, Backspace at the cursor, and Enter insertion at the cursor:

```ts
const multiline: TuiSelection = {
	...base,
	noteDraft: "ab\ncd",
	noteCursorOffset: 3,
};
expect(applyNoteInput(multiline, "left").noteCursorOffset).toBe(3);
expect(applyNoteInput({ ...multiline, noteCursorOffset: 5 }, "right").noteCursorOffset).toBe(5);

const backspaced = applyNoteInput(
	{ ...base, noteDraft: "abcd", noteCursorOffset: 2 },
	"backspace",
);
expect(backspaced.noteDraft).toBe("acd");
expect(backspaced.noteCursorOffset).toBe(1);

const newlineInserted = applyNoteInput(
	{ ...base, noteDraft: "abcd", noteCursorOffset: 2 },
	"enter",
);
expect(newlineInserted.noteDraft).toBe("ab\ncd");
expect(newlineInserted.noteCursorOffset).toBe(3);
```

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --grep "append-note"
```

Expected: fail until cursor-aware input exists.

- [ ] **Step 4: Implement cursor helpers in navigation**

In `packages/tui/src/navigation.ts`, add small pure helpers near `applyNoteInput`:

```ts
function noteCursor(selection: TuiSelection): number {
	const draft = selection.noteDraft ?? "";
	return clamp(selection.noteCursorOffset ?? draft.length, 0, draft.length);
}

function currentLineStart(value: string, cursor: number): number {
	return value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
}

function currentLineEnd(value: string, cursor: number): number {
	const end = value.indexOf("\n", cursor);
	return end === -1 ? value.length : end;
}
```

Use the existing `clamp` helper if already available in this module.

- [ ] **Step 5: Make input cursor-aware**

Update `applyNoteInput` to:

- clamp cursor with `noteCursor(selection)`;
- move left only when `cursor > currentLineStart(draft, cursor)`;
- move right only when `cursor < currentLineEnd(draft, cursor)`;
- insert normal characters and newline at `cursor`;
- Backspace removes the character before `cursor` and decrements the cursor.

The core insertion shape should be:

```ts
const nextDraft = `${draft.slice(0, cursor)}${value}${draft.slice(cursor)}`;
return { ...selection, noteDraft: nextDraft, noteCursorOffset: cursor + value.length };
```

- [ ] **Step 6: Preserve/reset cursor through modal lifecycle**

Update Note open/cancel/save paths so:

- opening a Note starts with `noteDraft: ""` and `noteCursorOffset: 0`;
- Esc closes the modal and clears `noteDraft` plus `noteCursorOffset`;
- successful save closes the modal and clears `noteDraft` plus `noteCursorOffset`;
- empty save keeps both `noteDraft` and `noteCursorOffset`.

Likely files:

- `packages/tui/src/navigation.ts` for `moveSelection` open/cancel behavior.
- `packages/tui/src/mutations.ts` for mutation result selections.

- [ ] **Step 7: Run checks for MIK-126**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --grep "note"
bun run typecheck
bun run check
```

Expected: all pass.

- [ ] **Step 8: Commit MIK-126**

Run:

```sh
but status -fv
but commit <branch-id> -m "Add line-local Note cursor editing" --changes <file-ids> --status-after
```

Use IDs from `but status -fv`.

---

## MIK-127: Render multiline Note input window

**Files:**
- Modify: `packages/tui/src/prompt-view-model.ts`
- Modify: `packages/tui/src/prompt-text.ts`
- Modify: `packages/tui/src/modals.ts` only if the Note modal needs a fixed height style.
- Modify: `docs/smoke.md` only if manual smoke wording needs final adjustment.
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Start from MIK-126**

Run:

```sh
but status -fv
but branch new mik-127-note-input-window --status-after
but status -fv
but move <mik-127-branch-id> <mik-126-branch-id>
```

Use branch IDs from `but status -fv`. Expected: MIK-127 is stacked above MIK-126 if both are still active.

- [ ] **Step 2: Update Note prompt view model type**

In `packages/tui/src/prompt-view-model.ts`, change `NotePromptViewModel` from a single `draft: string` to rendered lines:

```ts
export type NotePromptViewModel = {
	title: string;
	focused: boolean;
	inputLines: string[];
	feedback?: string;
	hint: string;
};
```

Set hint to:

```ts
hint: "enter newline  ctrl+s save  esc cancel",
```

- [ ] **Step 3: Write failing tests for cursor marker and 5-line clipping**

In `packages/tui/__tests__/tui.test.ts`, update prompt view-model assertions:

```ts
const prompt = buildNotePromptViewModel(model, {
	columnIndex: 1,
	cardIndex: 0,
	detailOpen: false,
	noteOpen: true,
	noteDraft: "one\ntwo\nthree\nfour\nfive\nsix",
	noteCursorOffset: "one\ntwo\nthree\nfour\nfive\nsix".length,
});
expect(prompt?.inputLines).toEqual(["two", "three", "four", "five", "six▌"]);
expect(prompt?.hint).toBe("enter newline  ctrl+s save  esc cancel");

const cursorAboveTail = buildNotePromptViewModel(model, {
	columnIndex: 1,
	cardIndex: 0,
	detailOpen: false,
	noteOpen: true,
	noteDraft: "one\ntwo\nthree\nfour\nfive\nsix",
	noteCursorOffset: "one\ntwo".length,
});
expect(cursorAboveTail?.inputLines).toEqual(["one", "two▌"]);
```

The second assertion keeps the active edit location visible if cursor-aware editing ever places the cursor above the final draft lines.

Add a saved-body assertion near append mutation tests:

```ts
expect(markdown).not.toContain("▌");
```

- [ ] **Step 4: Implement Note input line projection**

In `packages/tui/src/prompt-view-model.ts`, add helpers:

```ts
const NOTE_INPUT_VISIBLE_LINES = 5;

function renderNoteDraftLines(draft: string, cursorOffset: number): string[] {
	const cursor = Math.max(0, Math.min(cursorOffset, draft.length));
	const beforeCursor = draft.slice(0, cursor);
	const cursorLineIndex = beforeCursor.split("\n").length - 1;
	const withCursor = `${beforeCursor}▌${draft.slice(cursor)}`;
	const lines = withCursor.split("\n");
	const endExclusive = cursorLineIndex + 1;
	const start = Math.max(0, endExclusive - NOTE_INPUT_VISIBLE_LINES);
	return lines.slice(start, endExclusive);
}
```

This renders the 5-line trailing window ending at the active edit line, not necessarily the final line in the draft.

Use `selection.noteCursorOffset ?? (selection.noteDraft ?? "").length` when building the view model.

- [ ] **Step 5: Render multiline Note content**

In `packages/tui/src/prompt-text.ts`, update `renderNoteInteraction` to output a small input block instead of `Note: ${view.draft}`:

```ts
return [
	view.title,
	"",
	"Note:",
	...view.inputLines.map((line) => `  ${line}`),
	...(view.feedback ? ["", view.feedback] : []),
	"",
	view.hint,
];
```

- [ ] **Step 6: Update existing tests that expect `Note: Draft`**

Replace expectations such as:

```ts
expect(collectTextContent(noteTree)).toContain("Note: Draft");
```

with expectations matching the new block:

```ts
const text = collectTextContent(noteTree);
expect(text).toContain("Note:");
expect(text).toContain("Draft▌");
expect(text).toContain("enter newline  ctrl+s save  esc cancel");
```

- [ ] **Step 7: Run checks for MIK-127**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --grep "note"
bun run typecheck
bun run test
bun run check
```

Expected: all pass.

- [ ] **Step 8: Commit MIK-127**

Run:

```sh
but status -fv
but commit <branch-id> -m "Render multiline Note input window" --changes <file-ids> --status-after
```

Use IDs from `but status -fv`.

---

## Final integration

- [ ] Run full validation:

```sh
bun run typecheck
bun run test
bun run check
```

- [ ] Request review with focus on:
  - Does implementation match `docs/design.md`, `site/tui.md`, and `docs/smoke.md`?
  - Does Note editing remain lightweight rather than becoming a full editor?
  - Are empty-save and cursor-state edge cases tested?

- [ ] Create PR(s). Prefer one PR per Issue if using independent AFK agents, or one stacked PR series if using GitButler stacking.

## Self-review

- Spec coverage: MIK-125 covers save/newline/empty behavior; MIK-126 covers line-local editing; MIK-127 covers cursor marker, 5-line display, and hints.
- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: vertical movement, full Markdown body editing, and external editor integration are intentionally out of scope.
- GitButler note: use `but` for all branch/commit/push/PR mutations; do not use raw git write commands.
