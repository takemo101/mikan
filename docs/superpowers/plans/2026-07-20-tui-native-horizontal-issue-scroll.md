# TUI Native Horizontal Issue-Row Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let native horizontal swipe input reveal untruncated Issue-row content without changing focused Status Columns.

**Architecture:** Revert the TUI callback contract to vertical directions only, so the launcher continues synchronizing selected Cards only for up/down input. Let the OpenTUI ScrollBox handle left/right input natively with `scrollX: true`; make Cards at least viewport-wide, but allow their one-line text to determine a wider scrollable extent.

**Tech Stack:** TypeScript, React 19, OpenTUI React, Bun test, Biome.

## Global Constraints

- Implement only MIK-167; do not change keyboard navigation, Status moves, detail scrolling, or Column viewport behavior.
- Horizontal swipe never changes focused Column or selected Issue.
- Keep native vertical ScrollBox behavior and selected-Issue synchronization for unshifted up/down input.
- Preserve one-line Issue rows; do not wrap titles or add custom scroll state.
- Update `docs/design.md`, the canonical TUI interaction surface.
- Use `but` for version-control mutations and add `--status-after`.

---

### Task 1: Restore native horizontal Issue-row scrolling

**Files:**

- Modify: `packages/tui/src/app-view-props.ts:14-31`
- Modify: `packages/tui/src/board-view.ts:27-37,151-170,201-229`
- Modify: `packages/tui/src/index.ts:404-425`
- Modify: `packages/tui/__tests__/tui.test.ts:1103-1125,1265-1313,1445-1466`
- Modify: `docs/design.md:503`

**Interfaces:**

- Consumes: OpenTUI ScrollBox's native left/right behavior, which changes `scrollLeft` for horizontal input.
- Produces: `TuiColumnScrollDirection = "up" | "down"`; `onColumnScroll` is only a vertical selection-synchronization callback.

- [ ] **Step 1: Write failing regression expectations**

In `packages/tui/__tests__/tui.test.ts`, change the Status Column scrollbox expectation to require horizontal scrolling:

```ts
expect(readyList?.props).toMatchObject({
  scrollY: true,
  scrollX: true,
});
```

Replace the current horizontal-forwarding test with a test that emits `right` on the active list, awaits the microtask, and confirms no callback direction was forwarded. Then emit unshifted `down` and confirm vertical forwarding remains:

```ts
expect(scrollDirections).toEqual([]);

(readyList?.props?.onMouseScroll as (event: unknown) => void)?.({
  scroll: { direction: "down" },
  modifiers: { shift: false },
});
await Promise.resolve();
expect(scrollDirections).toEqual(["down"]);
```

Update the Card rendering test to require a no-wrap Text without a `truncate` prop or `overflow: "hidden"` style, and Card style with `minWidth: "100%"` rather than fixed `width: "100%"` or hidden overflow:

```ts
expect(cardProps.style).toMatchObject({
  height: 1,
  minWidth: "100%",
});
expect(cardProps.style?.overflow).toBeUndefined();
expect(cardText?.props?.truncate).toBeUndefined();
expect(cardText?.props?.wrapMode).toBe("none");
expect(cardText?.props?.style).toBeUndefined();
```

Remove the prior horizontal Column-navigation fixture because horizontal input must not call `moveSelection`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: FAIL because the current view still declares `scrollX: false`, forwards `right` to the callback, and truncates/clips Card text.

- [ ] **Step 3: Revert callback routing and expose native horizontal content**

In `packages/tui/src/app-view-props.ts`, restore the callback type:

```ts
export type TuiColumnScrollDirection = "up" | "down";
```

In `packages/tui/src/board-view.ts`, restore `columnScrollDirection` to accept only unshifted up/down values:

```ts
function columnScrollDirection(
  event: MouseEvent,
): TuiColumnScrollDirection | undefined {
  if (event.modifiers?.shift) return undefined;
  const direction = event.scroll?.direction;
  return direction === "up" || direction === "down" ? direction : undefined;
}
```

Keep the active-Column-only handler and microtask. Change its ScrollBox options to `scrollX: true` and retain `scrollY: true`.

In `IssueCard`, replace the fixed/clipping style and Text props with:

```ts
style: {
  backgroundColor: props.selected
    ? theme.interactive.selectedSurface
    : theme.base.surface,
  flexDirection: "column",
  height: 1,
  minWidth: "100%",
},
```

and:

```ts
React.createElement("text", {
  content: issueCardContent(props.card, props.selected, theme),
  wrapMode: "none",
}),
```

This gives short Cards a viewport-width background while allowing long one-line text to expand the native ScrollBox content width.

In `packages/tui/src/index.ts`, remove the left/right condition and restore the direct vertical-only call:

```ts
const next = moveSelectionFromColumnScroll(board, current, direction);
```

- [ ] **Step 4: Update the canonical interaction design**

In `docs/design.md`, replace horizontal-swipe Column-focus wording with text that keeps `h`/`l` and left/right arrows as Column-focus controls, and explicitly states that horizontal swipe scrolls long Issue rows within the active Column without changing selection.

- [ ] **Step 5: Run focused tests to verify the behavior passes**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: PASS. The regression tests confirm native horizontal capability, no callback forwarding for right input, retained down forwarding, and untruncated/no-clip Card content.

- [ ] **Step 6: Commit the Issue slice**

Run `but diff`, then use its change IDs to commit the five files to `tui-horizontal-swipe-column-focus`:

```sh
but commit tui-horizontal-swipe-column-focus -m "fix: scroll long TUI Issue rows horizontally" --changes <ids> --status-after
```

Expected: the commit includes only MIK-167 behavior, tests, and the canonical design update.

### Task 2: Validate the MIK-167 slice

**Files:**

- Verify: `packages/tui/src/app-view-props.ts`
- Verify: `packages/tui/src/board-view.ts`
- Verify: `packages/tui/src/index.ts`
- Verify: `packages/tui/__tests__/tui.test.ts`
- Verify: `docs/design.md`

**Interfaces:**

- Consumes: Task 1's restored vertical-only callback and native horizontal ScrollBox configuration.
- Produces: validation evidence for MIK-167 with no additional product changes.

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

Run `lens_diagnostics` with `mode: "all"`. If its cache is stale, run `mode: "full"` scoped to the five edited files. Expected: no primary TypeScript diagnostics.

- [ ] **Step 4: Append validation evidence and request review**

Append a `Reports` entry to MIK-167 with the focused test and all checks, then request an independent read-only review before moving the Issue to `completed`.

## Self-review

- **Spec coverage:** Task 1 removes horizontal selection routing, enables native horizontal scrolling, removes Card clipping/truncation, preserves vertical input, updates tests, and updates the canonical design. Task 2 validates and reviews the completed slice.
- **Completeness scan:** Each code change has an exact replacement snippet; tests and expected command results are concrete.
- **Type consistency:** `TuiColumnScrollDirection` is narrowed before the launcher calls `moveSelectionFromColumnScroll`, whose parameter remains `"up" | "down"`.
