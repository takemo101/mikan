# TUI Horizontal Swipe Column Focus Design

## Goal

Make horizontal trackpad or mouse swipe input on the board move the focused Column, instead of reaching native horizontal scrolling for Issue rows.

## Scope

This change affects board-mode pointer/trackpad scrolling only. It does not alter keyboard shortcuts, Issue Status moves, detail-page scrolling, or vertical Column scrolling.

## Interaction design

- A horizontal swipe to the right focuses the next visible/configured Column; a swipe to the left focuses the previous Column.
- Column focus is clamped at the first and last Column.
- The selected Issue row index is preserved when the destination Column has that row. If it has fewer Issues, focus its final Issue. Empty Columns retain Column focus with row index `0`.
- The existing sliding Column viewport follows the new focus using its current view-model behavior.
- A vertical swipe continues to use the active Column scrollbox and synchronized Issue selection exactly as before.
- Horizontal swipe events are consumed by the board handler so they cannot cause native horizontal scrolling of Issue rows.

## Implementation boundary

`packages/tui/src/board-view.ts` will classify horizontal scroll directions as left/right and forward them from the active Column scrollbox. `packages/tui/src/index.ts` will translate them through the existing selection navigation path rather than directly manipulating rendering state. `packages/tui/src/navigation.ts` remains the owner of the existing row-preserving, bounds-clamped Column selection behavior.

No new gestures, persistent state, or configuration are added.

## Tests

Focused TUI regression tests will verify that:

1. left/right scroll events emitted from the active Column call the board scroll handler;
2. the handler maps those events to adjacent Column focus through existing navigation;
3. destination selection preserves the current row, clamps to the final Issue when necessary, and supports an empty Column;
4. up/down scrolling still performs its current Column-local behavior; and
5. the prior regression expectation that horizontal/shifted input is ignored is removed or narrowed so it only covers unsupported input.

## Acceptance criteria

- Horizontal swipes move focused Columns left/right without native row scrolling.
- The selected Issue row is preserved where possible and clamped where necessary.
- Vertical scrolling behavior remains unchanged.
- Focused tests and repository checks pass.
