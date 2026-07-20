# TUI Native Horizontal Issue-Row Scroll Design

## Goal

Make long Issue rows readable through native horizontal scrolling while removing horizontal swipe navigation between Status Columns.

## Interaction design

- Left/right swipe input on an active Issue list is handled by OpenTUI's native ScrollBox and changes only that list's horizontal scroll position.
- Horizontal swipe does not change the focused Column or selected Issue.
- Issue rows remain one line and do not truncate their title, Labels, Repository prefix, or dependency marker.
- Vertical swipe remains native vertical scrolling in the active Column and retains synchronized selected-Issue movement.
- Keyboard `h`/`l` and left/right arrows retain Column-focus behavior.

## Implementation boundary

- Revert the public TUI scroll callback to its vertical-only `"up" | "down"` contract.
- Remove the left/right branch from the launcher callback so it only synchronizes vertical native scrolling to Issue selection.
- Configure Issue-list ScrollBoxes with `scrollX: true` and keep `scrollY: true`.
- Remove Card/Text truncation and horizontal clipping while keeping a one-line, no-wrap layout.
- Update the documented TUI interaction contract and replace the previous horizontal-focus regression tests with tests for native horizontal scrolling and untruncated Issue-row content.

No custom horizontal scroll state, gesture mapping, Column viewport changes, or keyboard changes are introduced.

## Tests

Focused TUI tests will verify:

1. the active Issue-list ScrollBox enables both horizontal and vertical scrolling;
2. horizontal mouse-scroll input is not forwarded through the Column-selection callback;
3. vertical input remains forwarded through that callback;
4. long Issue-row content has no truncation or hidden horizontal overflow; and
5. keyboard Column navigation continues to be covered by existing tests.

## Acceptance criteria

- Horizontal swipes never change Column focus.
- Long Issue-row text can be revealed by horizontal scrolling rather than truncation.
- Vertical scrolling and keyboard navigation retain their current behavior.
- Focused tests and repository checks pass.
