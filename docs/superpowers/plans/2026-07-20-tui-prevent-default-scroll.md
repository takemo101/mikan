# TUI Prevent Default Arrow Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop duplicate focused-ScrollBox arrow scrolling after mikan has handled the same key for board, detail, or modal navigation.

**Architecture:** Add a pure navigation predicate that identifies application-owned arrow actions outside Note input. Type the global keyboard hook callback as OpenTUI `KeyEvent` and call `preventDefault()` for exactly those actions before existing navigation branches run. The existing explicit detail `scrollBy`, pointer scrolling, and overflow-based scrollbar visibility remain unchanged.

**Tech Stack:** TypeScript, React 19, OpenTUI React/Core, Bun test, Biome.

## Global Constraints

- Implement only MIK-168; do not change Issue mutation, horizontal swipe scrolling, Column viewport behavior, or scrollbar visibility state.
- Prevent native default handling only for arrow actions that mikan owns and only when Note input is closed.
- Note input retains native arrow-key cursor movement.
- Board, Detail, and modal arrow behavior retain their current application-level paths.
- Update `docs/design.md` with the default-prevention rule.
- Use `but` for version-control mutations with `--status-after`.

---

### Task 1: Prevent duplicate native ScrollBox arrow handling

**Files:**

- Modify: `packages/tui/src/navigation.ts:12-45,69-86`
- Modify: `packages/tui/src/index.ts:1-7,33-48,468-475,149-169`
- Modify: `packages/tui/__tests__/tui.test.ts:15-82,1184-1210`
- Modify: `docs/design.md` (OpenTUI implementation notes)

**Interfaces:**

- Consumes: `KeyEvent.preventDefault()` from `@opentui/core` and `keyToTuiAction` output.
- Produces: `shouldPreventNativeArrowScroll(action: unknown, noteOpen: boolean): boolean` from `navigation.ts`.

- [ ] **Step 1: Write a failing predicate test**

In `packages/tui/__tests__/tui.test.ts`, import `shouldPreventNativeArrowScroll` from `../src/index.ts`. Add a test beside the existing scroll-target tests:

```ts
test("prevents native ScrollBox arrows only outside Note input", () => {
  expect(shouldPreventNativeArrowScroll("up", false)).toBe(true);
  expect(shouldPreventNativeArrowScroll("down", false)).toBe(true);
  expect(shouldPreventNativeArrowScroll("left", false)).toBe(true);
  expect(shouldPreventNativeArrowScroll("right", false)).toBe(true);
  expect(shouldPreventNativeArrowScroll("up", true)).toBe(false);
  expect(shouldPreventNativeArrowScroll("enter", false)).toBe(false);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: FAIL because the predicate is not exported.

- [ ] **Step 3: Add the pure predicate and facade export**

In `packages/tui/src/navigation.ts`, add after `shouldSyncColumnScroll`:

```ts
export function shouldPreventNativeArrowScroll(
  action: unknown,
  noteOpen: boolean,
): boolean {
  return !noteOpen &&
    (action === "up" ||
      action === "down" ||
      action === "left" ||
      action === "right");
}
```

Re-export it from `packages/tui/src/index.ts` with the existing navigation functions.

- [ ] **Step 4: Prevent the default before application navigation dispatch**

In `packages/tui/src/index.ts`, add:

```ts
import type { KeyEvent } from "@opentui/core";
```

Change the keyboard hook signature to `useKeyboard((key: KeyEvent) => { ... })`. Immediately after building `action`, `board`, and `fullSelection`, add:

```ts
if (shouldPreventNativeArrowScroll(action, Boolean(selection.noteOpen))) {
  key.preventDefault();
}
```

Import `shouldPreventNativeArrowScroll` from `navigation.ts`. Keep all subsequent branches unchanged. This lets mikan own Board, Detail, and modal arrows while leaving Note input arrows unprevented.

- [ ] **Step 5: Document the keyboard ownership rule**

Add an OpenTUI implementation note to `docs/design.md`: when mikan handles non-Note arrow-key navigation, it must prevent the default focused-renderable key action so ScrollBoxes do not perform a duplicate native scroll.

- [ ] **Step 6: Run focused tests to verify the behavior passes**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: PASS. The new predicate test proves native default prevention applies to application-owned arrows and excludes Note input.

- [ ] **Step 7: Commit the corrective slice**

Run `but diff`, then use returned IDs to commit the four files to `tui-horizontal-swipe-column-focus`:

```sh
but commit tui-horizontal-swipe-column-focus -m "fix: prevent duplicate TUI arrow scrolling" --changes <ids> --status-after
```

Expected: the branch contains only MIK-168's root-cause correction, test, and documentation.

### Task 2: Validate, review, and merge MIK-168

**Files:**

- Verify: `packages/tui/src/navigation.ts`
- Verify: `packages/tui/src/index.ts`
- Verify: `packages/tui/__tests__/tui.test.ts`
- Verify: `docs/design.md`

**Interfaces:**

- Consumes: Task 1's predicate and `KeyEvent.preventDefault()` integration.
- Produces: review evidence and a GitButler PR/merge outcome.

- [ ] **Step 1: Run repository checks**

Run:

```sh
bun run typecheck
bun run check
bun run test
```

Expected: every command exits successfully.

- [ ] **Step 2: Inspect diagnostics**

Run `lens_diagnostics` with `mode: "all"`; if stale, run `mode: "full"` scoped to the four edited files. Expected: no primary TypeScript diagnostics.

- [ ] **Step 3: Obtain an independent read-only review**

Review the corrective diff against this plan. Address any Critical or Important findings and rerun affected checks.

- [ ] **Step 4: Create and merge the PR through GitButler**

Use the branch ID reported by `but status -fv` with `but pr new <branch-id> -m "..." --status-after`, then merge through `but merge <branch-id> --status-after`. If GitButler reports missing forge authentication, leave the Issue active and report the exact blocker instead of bypassing GitButler.

- [ ] **Step 5: Complete the Issue only after merge**

Append commits, checks, reviewer verdict, PR, and merge evidence to MIK-168. Move it to `completed` only when merge succeeds.

## Self-review

- **Spec coverage:** Task 1 prevents the duplicate default path, preserves Note arrows, keeps existing explicit behavior, updates tests, and documents the rule. Task 2 validates, reviews, creates/merges the PR, and records completion evidence.
- **Completeness scan:** All production changes have concrete snippets and all validation/merge commands and expected outcomes are specified.
- **Type consistency:** The predicate accepts the full action union via `unknown`; the OpenTUI hook receives its native `KeyEvent`, which owns `preventDefault()`.
