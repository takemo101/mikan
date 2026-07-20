# TUI Conditional Vertical Selection Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avoid programmatic ScrollBox updates for arrow-key selections that are already visible, while vertically revealing selections that leave the Column viewport.

**Architecture:** Add a pure vertical-geometry helper to the existing navigation Module. The TUI launcher obtains the selected Card renderable from the active ScrollBox and uses that helper to decide whether a vertical adjustment is required; when it is, it calls `scrollBy({ x: 0, y })` so horizontal Issue-row position is untouched. OpenTUI remains responsible for scrollbar visibility based on actual content overflow.

**Tech Stack:** TypeScript, React 19, OpenTUI React, Bun test, Biome.

## Global Constraints

- Implement only MIK-168; do not alter keyboard navigation, Status moves, horizontal Issue-row scrolling, detail scrolling, or custom ScrollBox visibility state.
- Do not call a ScrollBox scroll API when the selected Card is fully inside its viewport.
- When vertical adjustment is necessary, use `scrollBy({ x: 0, y })`; never modify horizontal position.
- Preserve existing `columnScrollTargetKey` and model-only refresh synchronization semantics.
- Update `docs/design.md` with the intended conditional vertical synchronization rule.
- Use `but` for all version-control mutations, including `--status-after`.

---

### Task 1: Make selected-Card scrolling conditional and vertical-only

**Files:**

- Modify: `packages/tui/src/navigation.ts:60-102`
- Modify: `packages/tui/src/index.ts:33-48,389-402,149-169`
- Modify: `packages/tui/__tests__/tui.test.ts:15-82,1184-1200`
- Modify: `docs/design.md` (OpenTUI implementation notes)

**Interfaces:**

- Consumes: `ScrollBoxRenderable.content.findDescendantById(cardId)`, its selected Card `y`/`height`, and `ScrollBoxRenderable.viewport.y`/`height`.
- Produces: `verticalScrollDeltaForBounds(cardTop, cardBottom, viewportTop, viewportBottom): number`, which returns the nearest required vertical delta or zero.

- [ ] **Step 1: Add failing geometry tests**

In `packages/tui/__tests__/tui.test.ts`, import `verticalScrollDeltaForBounds` from `../src/index.ts`. Add one test near the existing column-scroll target tests:

```ts
test("only derives vertical scroll when a selected Card leaves its viewport", () => {
  expect(verticalScrollDeltaForBounds(4, 5, 0, 8)).toBe(0);
  expect(verticalScrollDeltaForBounds(-1, 0, 0, 8)).toBe(-1);
  expect(verticalScrollDeltaForBounds(8, 9, 0, 8)).toBe(1);
});
```

The fully visible case represents ordinary arrow-key movement and must not produce a scroll request. The other cases represent the selected one-line Card immediately above/below the viewport.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: FAIL because `verticalScrollDeltaForBounds` is not exported yet.

- [ ] **Step 3: Add the pure vertical visibility helper**

In `packages/tui/src/navigation.ts`, after `shouldSyncColumnScroll`, add:

```ts
export function verticalScrollDeltaForBounds(
  cardTop: number,
  cardBottom: number,
  viewportTop: number,
  viewportBottom: number,
): number {
  if (cardTop < viewportTop) return cardTop - viewportTop;
  if (cardBottom > viewportBottom) return cardBottom - viewportBottom;
  return 0;
}
```

Add `verticalScrollDeltaForBounds` to the existing navigation exports in `packages/tui/src/index.ts` so the test keeps importing only through the package facade.

- [ ] **Step 4: Replace unconditional `scrollChildIntoView`**

In `packages/tui/src/index.ts`, import `verticalScrollDeltaForBounds` with the other navigation functions. Replace:

```ts
columnScrollBoxRef.current?.scrollChildIntoView(`card-${card.id}`);
```

with code that looks up the Card and conditionally scrolls only vertically:

```ts
const scrollBox = columnScrollBoxRef.current;
const selectedCard = scrollBox?.content.findDescendantById(`card-${card.id}`);
if (!scrollBox || !selectedCard) return;
const verticalDelta = verticalScrollDeltaForBounds(
  selectedCard.y,
  selectedCard.y + selectedCard.height,
  scrollBox.viewport.y,
  scrollBox.viewport.y + scrollBox.viewport.height,
);
if (verticalDelta !== 0) {
  scrollBox.scrollBy({ x: 0, y: verticalDelta });
}
```

Keep the existing `shouldSyncColumnScroll` guard and target-ref assignment. The zero-delta path must not call a ScrollBox scroll method, avoiding the transient vertical scrollbar render for visible selections.

- [ ] **Step 5: Document the selection-scroll contract**

Add an OpenTUI implementation note in `docs/design.md`: programmatic Card selection synchronization must skip ScrollBox updates for Cards already vertically visible; when it scrolls, it must be vertical-only so native horizontal Issue-row position remains unchanged.

- [ ] **Step 6: Run focused tests to verify the behavior passes**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: PASS. The new geometry test confirms no-op for a visible Card and minimal vertical deltas for Cards above/below the viewport.

- [ ] **Step 7: Commit the Issue slice**

Run `but diff`, then commit the four files on branch `tui-horizontal-swipe-column-focus` using the returned change IDs:

```sh
but commit tui-horizontal-swipe-column-focus -m "fix: avoid unnecessary TUI scroll synchronization" --changes <ids> --status-after
```

Expected: only MIK-168 implementation, test, and design documentation changes are committed.

### Task 2: Validate and deliver MIK-168

**Files:**

- Verify: `packages/tui/src/navigation.ts`
- Verify: `packages/tui/src/index.ts`
- Verify: `packages/tui/__tests__/tui.test.ts`
- Verify: `docs/design.md`

**Interfaces:**

- Consumes: Task 1's pure helper and conditional `scrollBy` integration.
- Produces: validation and review evidence ready for the PR.

- [ ] **Step 1: Run static checks and full tests**

Run:

```sh
bun run typecheck
bun run check
bun run test
```

Expected: all three commands exit successfully.

- [ ] **Step 2: Inspect edited-file diagnostics**

Run `lens_diagnostics` with `mode: "all"`; if its cache is stale, run `mode: "full"` scoped to the four edited files. Expected: no primary TypeScript diagnostics.

- [ ] **Step 3: Request an independent read-only review**

Review the MIK-168 code diff against this plan. Address any Critical or Important findings, rerun affected checks, and record the review result in MIK-168.

- [ ] **Step 4: Publish and merge through GitButler**

After clean review and checks, use GitButler commands to push `tui-horizontal-swipe-column-focus`, create/finalize its PR, and merge according to the repository's GitButler flow. Use IDs reported by `but status -fv`/`but show`; do not use Git write commands.

- [ ] **Step 5: Move the Issue to Completed**

Append the implementation, validation, review, PR, and merge evidence to MIK-168, then move it to `completed`.

## Self-review

- **Spec coverage:** Task 1 covers visible no-op behavior, minimal above/below vertical adjustment, horizontal preservation, integration, tests, and the documented rule. Task 2 covers all required checks, diagnostics, review, PR publication, merge, and Issue completion.
- **Completeness scan:** Every production change includes an exact function or integration snippet; all commands and success conditions are explicit.
- **Type consistency:** The helper takes numeric renderable/viewport bounds and returns a number; `scrollBy` receives its result as `y` alongside fixed `x: 0`.
