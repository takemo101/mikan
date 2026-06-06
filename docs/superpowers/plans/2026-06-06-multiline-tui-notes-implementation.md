# Multiline TUI Notes Implementation Plan

> **Status:** Superseded by MIK-128 / GitHub Issue #84.

The original MIK-125 → MIK-126 → MIK-127 plan implemented multiline Notes by building a small custom editor model in mikan: draft text, cursor offset, a rendered cursor marker, and a 5-line projected input window.

After implementation, that approach proved more complex than necessary because OpenTUI already provides a native `textarea` renderable. MIK-128 replaces the custom Note editor model with OpenTUI's textarea while keeping the user-facing Note behavior:

- Enter inserts a newline.
- Ctrl+S saves.
- Esc cancels.
- Empty saves keep the modal open with `Note cannot be empty` feedback.
- Saved Markdown preserves internal newlines and trims only leading/trailing blank space.

## Current implementation direction

Use OpenTUI's native `textarea` inside the Note modal. Let the textarea own multiline editing, cursor movement, wrapping, paste handling, and visible input behavior. On submit, read the textarea's `plainText` and pass it to the existing `appendSelectedIssueNote` mutation.

## Relevant Issues

- MIK-125 / #77: Implement multiline Note save semantics — completed.
- MIK-126 / #78: Add line-local cursor editing for TUI Notes — completed, then superseded by MIK-128.
- MIK-127 / #79: Render multiline Note input window — completed, then superseded by MIK-128.
- MIK-128 / #84: Use OpenTUI textarea for TUI Notes — current replacement direction.
