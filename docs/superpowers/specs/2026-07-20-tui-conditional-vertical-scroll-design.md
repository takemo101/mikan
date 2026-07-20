# TUI Conditional Vertical Selection Scroll Design

## Goal

Prevent transient vertical scrollbar rendering during arrow-key Issue selection changes while keeping the selected Issue visible when it leaves the Column viewport.

## Interaction design

- Moving selection with up/down arrows does not invoke ScrollBox scrolling when the selected Issue row is already fully visible.
- When the selected row is above or below the visible viewport, the TUI scrolls vertically just enough to reveal it.
- Native vertical scrollbar visibility remains controlled by OpenTUI's actual content overflow. Columns that do not need vertical scrolling do not show a scrollbar; overflowing Columns retain their normal scrollbar.
- Horizontal Issue-row scrolling, horizontal swipe behavior, keyboard Column navigation, and detail scrolling are unchanged.

## Implementation boundary

The TUI launcher currently calls `scrollChildIntoView()` for every changed selection. Replace that unconditional call with a focused helper that locates the selected Card in the active ScrollBox, compares its vertical bounds against the viewport, and calls `scrollBy({ x: 0, y })` only when a non-zero vertical adjustment is necessary. The helper must never alter `scrollLeft`.

No custom scrollbar visibility state, timers, animation, or change to OpenTUI ScrollBox internals is introduced.

## Tests

Focused tests will verify:

1. a fully visible selected Card causes no programmatic scroll;
2. Cards above and below the viewport cause the smallest vertical `scrollBy` adjustment;
3. the adjustment has `x: 0`, preserving horizontal Issue-row position; and
4. existing selection-target synchronization remains stable across model-only refreshes.

## Acceptance criteria

- Arrow-key selection changes within the viewport do not force a ScrollBox update or transient vertical scrollbar.
- Selection remains visible when it moves beyond the viewport.
- Native scrollbar visibility remains determined by actual overflow.
- Focused tests and repository checks pass.
