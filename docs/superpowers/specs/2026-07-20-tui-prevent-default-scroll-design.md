# TUI Prevent Default Arrow Scroll Design

## Goal

Prevent OpenTUI ScrollBoxes from handling arrow keys after mikan has already handled the same key for board navigation, detail scrolling, or modal navigation.

## Root cause

`useKeyboard` receives global `KeyEvent` objects before focused renderables. The TUI currently updates its own selection state but does not call `preventDefault()`, so the focused ScrollBox then runs its native `handleKeyPress()` for the same arrow key. That extra native scroll produces the transient vertical scrollbar.

## Interaction design

- Board `up`/`down` changes the selected Issue only; the active ScrollBox must not also natively scroll from the same key.
- Board `left`/`right` changes focused Column only; it must not horizontally scroll the active Issue list.
- Detail `up`/`down` continues to use the existing explicit `detailScrollBoxRef.current.scrollBy()` call, without a second native scroll.
- Move, Label, and Repository filter modal `up`/`down` remain application-owned navigation.
- Note input retains native arrow-key cursor movement and is excluded from default prevention.
- Mouse/trackpad scrolling and native scrollbar visibility based on actual overflow remain unchanged.

## Implementation boundary

Type the `useKeyboard` callback parameter as OpenTUI `KeyEvent`. Before application-level navigation dispatch, call `key.preventDefault()` only for arrow-key actions when `selection.noteOpen` is false. No ScrollBox configuration, visibility state, or geometry calculation changes are added.

## Tests

Focused tests will verify a small pure action predicate that identifies application-owned arrow navigation while excluding Note input. Existing keyboard mapping tests continue to cover board, detail, and modal navigation.

## Acceptance criteria

- Arrow-key navigation no longer triggers a duplicate focused-ScrollBox scroll.
- Native Note cursor movement remains available.
- Mouse/trackpad scrolling and overflow-based scrollbars are unchanged.
- Focused tests and repository checks pass.
