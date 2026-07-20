# TUI Horizontal Swipe Column Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route board horizontal swipes to adjacent Column focus while preserving existing vertical Column scrolling.

**Architecture:** Extend the board scroll-direction contract to include `left` and `right`. The OpenTUI board component forwards horizontal input only from the active Column, and the launcher's existing state update delegates left/right to `moveSelection`, which already clamps Columns and preserves/clamps the Issue row. Keep up/down on `moveSelectionFromColumnScroll` so native vertical scroll synchronization is unchanged.

**Tech Stack:** TypeScript, React 19, OpenTUI React, Bun test, Biome.

## Global Constraints

- Implement only MIK-166; do not change keyboard shortcuts, Issue Status mutation, detail scrolling, or configuration.
- Keep Status/Column vocabulary and Markdown as the source of truth.
- Preserve the active-Column-only scroll handler and `scrollX: false` on Issue lists.
- Preserve vertical up/down behavior and shift-modified scrolling rejection.
- Update `docs/design.md`, because this changes a documented TUI interaction surface.
- Use `but` for all version-control mutations, with `--status-after`.

---

### Task 1: Route horizontal input through existing Column navigation

**Files:**

- Modify: `packages/tui/src/app-view-props.ts:14-31`
- Modify: `packages/tui/src/board-view.ts:27-33,147-158`
- Modify: `packages/tui/src/index.ts:404-423`
- Modify: `packages/tui/__tests__/tui.test.ts:1210-1286`
- Modify: `docs/design.md` (TUI design keyboard/gesture interaction list)

**Interfaces:**

- Consumes: `moveSelection(model, selection, "left" | "right")` in `packages/tui/src/navigation.ts`, which preserves `cardIndex` when available and clamps it against the destination Column.
- Produces: `TuiColumnScrollDirection = "up" | "down" | "left" | "right"`; `onColumnScroll(direction)` now forwards all four board scroll directions.

- [ ] **Step 1: Replace the horizontal-input regression test with a failing expectation**

In `packages/tui/__tests__/tui.test.ts`, replace the `ignores horizontal and shifted Column mouse scrolling` test with a test that invokes the active `readyList.props.onMouseScroll` with `{ scroll: { direction: "right" }, modifiers: { shift: false } }`, awaits the queued microtask, then expects:

```ts
expect(scrollDirections).toEqual(["right"]);
```

Keep the shifted vertical event in the same test and assert it adds no second direction:

```ts
(readyList?.props?.onMouseScroll as (event: unknown) => void)?.({
  scroll: { direction: "down" },
  modifiers: { shift: true },
});
await Promise.resolve();
expect(scrollDirections).toEqual(["right"]);
```

Add a navigation assertion using two Columns where the second has fewer Cards:

```ts
expect(moveSelection(model, { columnIndex: 0, cardIndex: 3, detailOpen: false }, "right"))
  .toMatchObject({ columnIndex: 1, cardIndex: 1 });
```

Use the existing `moveSelection` import and a local `TuiModel` fixture with 4 Cards in the first Column and 2 in the second. This proves row preservation plus final-Card clamping independently of rendering.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: FAIL because `TuiColumnScrollDirection` rejects `"right"` and/or the board handler does not append it.

- [ ] **Step 3: Extend the scroll-direction contract and forward horizontal input**

In `packages/tui/src/app-view-props.ts`, replace the direction union with:

```ts
export type TuiColumnScrollDirection = "up" | "down" | "left" | "right";
```

In `packages/tui/src/board-view.ts`, retain shift-modifier rejection but accept each OpenTUI directional value:

```ts
function columnScrollDirection(
  event: MouseEvent,
): TuiColumnScrollDirection | undefined {
  if (event.modifiers?.shift) return undefined;
  const direction = event.scroll?.direction;
  return direction === "up" ||
    direction === "down" ||
    direction === "left" ||
    direction === "right"
    ? direction
    : undefined;
}
```

Leave `onMouseScroll` attached only to the active Column and retain its `queueMicrotask` handoff. It now consumes recognized horizontal directions instead of dropping them. Do not enable `scrollX`.

In `packages/tui/src/index.ts`, split the existing callback behavior by direction:

```ts
const next =
  direction === "left" || direction === "right"
    ? moveSelection(board, current, direction)
    : moveSelectionFromColumnScroll(board, current, direction);
```

Keep the current no-change guard and `selectionRef.current` update unchanged. This reuses established Column bounds and same-row/final-Card clamping rather than duplicating selection logic.

- [ ] **Step 4: Document horizontal swipe navigation**

In the TUI interaction list in `docs/design.md`, amend the board navigation requirement to state that `h`/`l`, left/right arrows, **and horizontal swipe input** focus the adjacent Status Column. State that horizontal swipe preserves the Issue row where possible and clamps it to the last Issue in shorter Columns. Leave the existing `j`/`k`/up/down behavior unchanged.

- [ ] **Step 5: Run focused tests to verify the behavior passes**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: PASS. The test suite confirms right swipe forwarding, shifted vertical rejection, preserved Issue row, and clamping to the last Issue.

- [ ] **Step 6: Commit the Issue slice**

Run `but diff` and use the returned change IDs to commit the five files on branch `tui-horizontal-swipe-column-focus`:

```sh
but commit tui-horizontal-swipe-column-focus -m "fix: navigate TUI Columns by horizontal swipe" --changes <ids> --status-after
```

Expected: the branch contains the swipe behavior, regression coverage, and canonical interaction documentation with no unrelated changes.

### Task 2: Validate the TUI slice

**Files:**

- Verify: `packages/tui/src/app-view-props.ts`
- Verify: `packages/tui/src/board-view.ts`
- Verify: `packages/tui/src/index.ts`
- Verify: `packages/tui/__tests__/tui.test.ts`
- Verify: `docs/design.md`

**Interfaces:**

- Consumes: Task 1's four-direction scroll contract and launcher routing.
- Produces: validation evidence for MIK-166 without additional product code.

- [ ] **Step 1: Run static checks**

Run:

```sh
bun run typecheck
bun run check
```

Expected: both commands exit successfully with no TypeScript or Biome findings.

- [ ] **Step 2: Run the complete test suite**

Run:

```sh
bun run test
```

Expected: all workspace tests pass.

- [ ] **Step 3: Inspect edited-file diagnostics**

Run `lens_diagnostics` with `mode: "all"` after the changes. Expected: no blocking diagnostics for the edited TUI and documentation files.

- [ ] **Step 4: Append validation evidence and request review**

Append a `Reports` entry to MIK-166 that names the focused test and the three full checks. Request an independent review of the completed Issue slice before moving it to `completed`.

## Self-review

- **Spec coverage:** Task 1 covers left/right routing, row preservation/clamping, vertical compatibility, no `scrollX` change, tests, and canonical design documentation. Task 2 covers type, style, test, and diagnostics validation.
- **Completeness scan:** Every implementation step contains explicit code or an exact validation command; command outcomes and code snippets are concrete.
- **Type consistency:** `TuiColumnScrollDirection` is expanded in the shared props Module; the same union is consumed by `BoardView`, `TuiAppView`, and launcher routing. `moveSelectionFromColumnScroll` retains its narrower up/down parameter.
