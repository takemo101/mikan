# TUI Label Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a keyboard-first TUI modal for editing the selected Issue's Labels.

**Architecture:** Reuse the existing TUI modal pattern: selection state holds modal/draft state, prompt view-models describe modal content, React modal components render it, and mutations call core operations then reload the TUI model while preserving selected Issue. Core remains the writer for Issue Markdown; TUI uses a small core option to preserve existing config-unknown Labels when saving known Label changes.

**Tech Stack:** TypeScript ESM, Bun test, OpenTUI React, existing `@mikan/core` Issue mutations, existing TUI model/navigation/mutation modules.

---

## Agreed behavior

- Press `e` from Board or Detail to open a Label modal for the selected Issue.
- Modal lists all config-defined Labels in `.mikan/config.yaml` order.
- Current Issue Labels are checked.
- `↑`/`↓` changes focused Label.
- Space toggles the focused known Label in a draft.
- Enter saves all draft changes.
- Esc discards draft changes.
- If no Labels are configured, open an explanatory modal instead of an empty editor.
- Config-unknown Labels already present on the Issue are shown read-only and preserved on save.
- Save writes selected known Labels first in config order, followed by preserved unknown Labels in their original order.
- Save updates frontmatter only; it does not append Status Log or Notes and does not push GitHub Mirrors.

## File structure

- Modify `packages/core/src/issue-mutations.ts`: allow `updateIssue` to preserve existing config-unknown Labels when explicitly requested by TUI.
- Modify `packages/tui/src/model.ts`: add ordered config Label list to `TuiModel` so modals can render available Labels.
- Modify `packages/tui/src/selection.ts`: add Label modal state: `labelOpen`, `labelFocusIndex`, `labelDraftIds`.
- Modify `packages/tui/src/navigation.ts`: add `edit-labels` action, modal open/close behavior, Label draft focus/toggle helpers, footer modal detection.
- Modify `packages/tui/src/prompt-view-model.ts`: add `LabelPromptViewModel` builder with known Label options, unknown Labels, and empty-config message.
- Modify `packages/tui/src/modals.ts`: render the Label modal text.
- Modify `packages/tui/src/index.ts`: wire `LabelPrompt`, keyboard handling, exports, and save mutation.
- Modify `packages/tui/src/mutations.ts`: add `updateSelectedIssueLabels` mutation using core `updateIssue`.
- Modify `packages/tui/src/formatting.ts`: include `e labels` in Board/Detail footer and help-oriented strings where applicable.
- Modify `packages/tui/src/text-render.ts`: include Label modal in plain text renderer if modal rendering is represented there.
- Modify `packages/tui/__tests__/tui.test.ts`: add focused tests for model, navigation, modal rendering, mutation, and key mapping.
- Modify `docs/design.md`: already updated with the agreed behavior; adjust only if implementation discovers a wording mismatch.

---

### Task 1: Model configured Labels for the TUI

**Files:**
- Modify: `packages/tui/src/model.ts`
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test near existing TUI label display tests:

```ts
test("TUI model exposes configured Labels in config order", () => {
  const model = buildTuiModel(
    {
      columns: [],
      warnings: [],
    },
    [
      { id: "automation", title: "Automation" },
      { id: "herdr", title: "Herdr" },
    ],
  );

  expect(model.labels).toEqual([
    { id: "automation", title: "Automation" },
    { id: "herdr", title: "Herdr" },
  ]);
  expect(model.labelTitles).toEqual({
    automation: "Automation",
    herdr: "Herdr",
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "TUI model exposes configured Labels"
```

Expected: FAIL because `TuiModel` has no `labels` property.

- [ ] **Step 3: Implement the minimal model change**

In `packages/tui/src/model.ts`, add:

```ts
export type TuiLabel = {
  id: string;
  title: string;
};
```

Update `TuiModel`:

```ts
export type TuiModel = {
  columns: TuiColumn[];
  warnings: string[];
  warningDetails?: TuiWarning[];
  labels: TuiLabel[];
  labelTitles?: Record<string, string>;
  githubRepo?: string;
};
```

Update `buildTuiModel` return value:

```ts
labels: labels.map((label) => ({ id: label.id, title: label.title })),
labelTitles: Object.fromEntries(
  labels.map((label) => [label.id, label.title]),
),
```

Update any tests expecting an empty model to include `labels: []` if they compare the whole object.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "TUI model exposes configured Labels"
```

Expected: PASS.

---

### Task 2: Add Label modal selection and view-model behavior

**Files:**
- Modify: `packages/tui/src/selection.ts`
- Modify: `packages/tui/src/navigation.ts`
- Modify: `packages/tui/src/prompt-view-model.ts`
- Modify: `packages/tui/src/formatting.ts`
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Write failing navigation and view-model tests**

Add tests:

```ts
test("opens a Label editor with selected Labels as a draft", async () => {
  const { keyToTuiAction } = await import("../src/index.ts");
  const model: TuiModel = {
    columns: [
      {
        id: "ready",
        title: "Ready",
        cards: [
          {
            id: "MIK-001",
            title: "Ready issue",
            labels: ["automation", "legacy-label"],
            status: "ready",
            path: "/tmp/MIK-001.md",
          },
        ],
      },
    ],
    warnings: [],
    labels: [
      { id: "automation", title: "Automation" },
      { id: "herdr", title: "Herdr" },
    ],
    labelTitles: { automation: "Automation", herdr: "Herdr" },
  };
  const selection = moveSelection(
    model,
    { columnIndex: 0, cardIndex: 0, detailOpen: false },
    "edit-labels",
  );

  expect(keyToTuiAction("e")).toBe("edit-labels");
  expect(selection.labelOpen).toBe(true);
  expect(selection.labelDraftIds).toEqual(["automation"]);
  expect(selection.labelFocusIndex).toBe(0);
});

test("builds Label prompt view model with checked known Labels and read-only unknown Labels", () => {
  const model: TuiModel = {
    columns: [
      {
        id: "ready",
        title: "Ready",
        cards: [
          {
            id: "MIK-001",
            title: "Ready issue",
            labels: ["automation", "legacy-label"],
            status: "ready",
            path: "/tmp/MIK-001.md",
          },
        ],
      },
    ],
    warnings: [],
    labels: [
      { id: "automation", title: "Automation" },
      { id: "herdr", title: "Herdr" },
    ],
    labelTitles: { automation: "Automation", herdr: "Herdr" },
  };

  const view = buildLabelPromptViewModel(model, {
    columnIndex: 0,
    cardIndex: 0,
    detailOpen: false,
    labelOpen: true,
    labelFocusIndex: 1,
    labelDraftIds: ["automation", "herdr"],
  });

  expect(view).toMatchObject({
    title: "Edit Labels for MIK-001",
    focused: true,
    hint: "space toggle  enter save  esc cancel",
    unknownLabels: ["legacy-label"],
  });
  expect(view?.labels).toEqual([
    { id: "automation", title: "Automation", checked: true, focused: false },
    { id: "herdr", title: "Herdr", checked: true, focused: true },
  ]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "Label"
```

Expected: FAIL because `edit-labels`, Label selection fields, and `buildLabelPromptViewModel` do not exist.

- [ ] **Step 3: Add selection state**

In `packages/tui/src/selection.ts`, extend `TuiSelection`:

```ts
labelOpen?: boolean;
labelFocusIndex?: number;
labelDraftIds?: string[];
```

- [ ] **Step 4: Add navigation behavior**

In `packages/tui/src/navigation.ts`:

- Add `"edit-labels"` to `TuiAction` and `TuiSelectionAction`.
- Map `keyToTuiAction("e")` to `"edit-labels"`.
- Add `labelOpen` to `footerMode` modal detection.
- Add escape close behavior for `labelOpen`.
- Add `edit-labels` open behavior:

```ts
if (direction === "edit-labels") {
  const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
  const knownLabelIds = new Set(model.labels.map((label) => label.id));
  return {
    ...selection,
    archiveOpen: false,
    githubConfirmOpen: false,
    moveOpen: false,
    noteOpen: false,
    labelOpen: true,
    labelFocusIndex: 0,
    labelDraftIds: card?.labels.filter((label) => knownLabelIds.has(label)) ?? [],
  };
}
```

Add helpers:

```ts
export function moveLabelFocus(
  model: TuiModel,
  selection: TuiSelection,
  direction: "up" | "down",
): TuiSelection {
  if (!selection.labelOpen) return selection;
  return {
    ...selection,
    labelFocusIndex: clamp(
      (selection.labelFocusIndex ?? 0) + (direction === "down" ? 1 : -1),
      0,
      Math.max(0, model.labels.length - 1),
    ),
  };
}

export function toggleFocusedLabel(
  model: TuiModel,
  selection: TuiSelection,
): TuiSelection {
  if (!selection.labelOpen) return selection;
  const label = model.labels[selection.labelFocusIndex ?? 0];
  if (!label) return selection;
  const current = new Set(selection.labelDraftIds ?? []);
  if (current.has(label.id)) current.delete(label.id);
  else current.add(label.id);
  return { ...selection, labelDraftIds: [...current] };
}
```

- [ ] **Step 5: Add Label prompt view-model**

In `packages/tui/src/prompt-view-model.ts`, add types and builder:

```ts
export type LabelPromptViewModel = {
  title: string;
  focused: boolean;
  labels: {
    id: string;
    title: string;
    checked: boolean;
    focused: boolean;
  }[];
  unknownLabels: string[];
  emptyMessage?: string;
  hint: string;
};

export function buildLabelPromptViewModel(
  model: TuiModel,
  selection: TuiSelection,
): LabelPromptViewModel | undefined {
  const card = model.columns[selection.columnIndex]?.cards[selection.cardIndex];
  if (!card) return undefined;
  const draft = new Set(selection.labelDraftIds ?? card.labels);
  const known = new Set(model.labels.map((label) => label.id));
  return {
    title: `Edit Labels for ${card.id}`,
    focused: Boolean(selection.labelOpen),
    labels: model.labels.map((label, index) => ({
      id: label.id,
      title: label.title,
      checked: draft.has(label.id),
      focused: index === (selection.labelFocusIndex ?? 0),
    })),
    unknownLabels: card.labels.filter((label) => !known.has(label)),
    ...(model.labels.length === 0
      ? { emptyMessage: "No Labels configured. Add Labels in .mikan/config.yaml." }
      : {}),
    hint:
      model.labels.length === 0
        ? "esc close"
        : "space toggle  enter save  esc cancel",
  };
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "Label"
```

Expected: PASS for new model/navigation/view-model tests.

---

### Task 3: Render and wire the Label modal

**Files:**
- Modify: `packages/tui/src/modals.ts`
- Modify: `packages/tui/src/index.ts`
- Modify: `packages/tui/src/text-render.ts`
- Modify: `packages/tui/src/formatting.ts`
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Write failing rendering tests**

Add tests:

```ts
test("renders Label editor modal with checked and unknown Labels", () => {
  const model: TuiModel = {
    columns: [
      {
        id: "ready",
        title: "Ready",
        cards: [
          {
            id: "MIK-001",
            title: "Ready issue",
            labels: ["automation", "legacy-label"],
            status: "ready",
            path: "/tmp/MIK-001.md",
          },
        ],
      },
    ],
    warnings: [],
    labels: [
      { id: "automation", title: "Automation" },
      { id: "herdr", title: "Herdr" },
    ],
    labelTitles: { automation: "Automation", herdr: "Herdr" },
  };

  const tree = TuiAppView({
    model,
    selection: {
      columnIndex: 0,
      cardIndex: 0,
      detailOpen: false,
      labelOpen: true,
      labelFocusIndex: 0,
      labelDraftIds: ["automation"],
    },
  });
  const text = collectTextContent(tree);

  expect(collectElementTypes(tree)).toContain(LabelPrompt);
  expect(text).toContain("Edit Labels for MIK-001");
  expect(text).toContain("▶ [x] Automation");
  expect(text).toContain("  [ ] Herdr");
  expect(text).toContain("Unknown Labels (read-only): legacy-label");
});

test("renders explanatory Label modal when no Labels are configured", () => {
  const model: TuiModel = {
    columns: [
      {
        id: "ready",
        title: "Ready",
        cards: [
          {
            id: "MIK-001",
            title: "Ready issue",
            labels: [],
            status: "ready",
            path: "/tmp/MIK-001.md",
          },
        ],
      },
    ],
    warnings: [],
    labels: [],
    labelTitles: {},
  };

  const text = renderTuiText(model, {
    columnIndex: 0,
    cardIndex: 0,
    detailOpen: false,
    labelOpen: true,
  });

  expect(text).toContain("No Labels configured. Add Labels in .mikan/config.yaml.");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "Label editor modal|explanatory Label modal"
```

Expected: FAIL because `LabelPrompt` and text rendering are not wired.

- [ ] **Step 3: Implement modal rendering**

In `packages/tui/src/modals.ts`, import `buildLabelPromptViewModel` and add:

```ts
export function LabelPrompt(props: TuiAppViewProps): React.ReactElement {
  const theme = props.theme ?? buildTuiTheme();
  return React.createElement(
    "box",
    {
      id: "label-modal-backdrop",
      style: modalBackdropStyle(theme),
    },
    React.createElement(
      "box",
      {
        id: "label-prompt",
        title: "Edit Labels",
        border: true,
        style: modalStyle(theme),
      },
      React.createElement("text", {
        content: renderLabelInteraction(props.model, props.selection).join("\n"),
      }),
    ),
  );
}

export function renderLabelInteraction(
  model: TuiModel,
  selection: TuiSelection,
): string[] {
  const view = buildLabelPromptViewModel(model, selection);
  if (!view) return ["No Issue selected"];
  if (view.emptyMessage) return [view.title, "", view.emptyMessage, "", view.hint];
  return [
    view.title,
    "",
    ...view.labels.map(
      (label) => `${label.focused ? "▶" : " "} [${label.checked ? "x" : " "}] ${label.title}`,
    ),
    ...(view.unknownLabels.length > 0
      ? ["", `Unknown Labels (read-only): ${view.unknownLabels.join(", ")}`]
      : []),
    "",
    view.hint,
  ];
}
```

- [ ] **Step 4: Wire modal in `TuiAppView` and exports**

In `packages/tui/src/index.ts`:

- Import and export `LabelPrompt`.
- Import and export `buildLabelPromptViewModel`, `LabelPromptViewModel`, `moveLabelFocus`, and `toggleFocusedLabel`.
- Render `LabelPrompt` when `selection.labelOpen` is true.

- [ ] **Step 5: Update footer text**

In `packages/tui/src/formatting.ts`, update footer text:

```ts
if (mode === "detail") {
  return "Detail | ↑↓ scroll | e labels | g github | esc board | ? keys";
}
return "Board | ↑↓ card | ←→ column | enter detail | e labels | g github | ? keys";
```

- [ ] **Step 6: Wire `renderTuiText`**

If `packages/tui/src/text-render.ts` has explicit modal branches, add a branch for `selection.labelOpen` that uses `renderLabelInteraction(model, selection)`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "Label editor modal|explanatory Label modal"
```

Expected: PASS.

---

### Task 4: Save Label changes while preserving unknown Labels

**Files:**
- Modify: `packages/core/src/issue-mutations.ts`
- Modify: `packages/tui/src/mutations.ts`
- Modify: `packages/tui/src/index.ts`
- Test: `packages/core/__tests__/mutation.test.ts`
- Test: `packages/tui/__tests__/tui.test.ts`

- [ ] **Step 1: Write failing core test for preserving existing unknown Labels**

Add this test in `packages/core/__tests__/mutation.test.ts` near the existing `updateIssue` tests:

```ts
test("updateIssue can preserve existing config-unknown Labels when requested", () => {
  const root = tempProject();
  seed(root);
  const issuePath = join(root, ".mikan", "backlog", "MIK-001.md");
  writeFileSync(
    issuePath,
    readIssue(root, "backlog").replace(
      "labels:\n  - automation",
      "labels:\n  - legacy-label",
    ),
  );

  const result = updateIssue({
    projectRoot: root,
    config,
    id: "MIK-001",
    labels: ["automation", "legacy-label"],
    preserveUnknownLabels: true,
    now: t2,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected update");
  expect(readIssue(root, "backlog")).toContain(
    "labels:\n  - automation\n  - legacy-label",
  );
});
```

- [ ] **Step 2: Run core test and verify RED**

Run:

```sh
bun test packages/core/__tests__/mutation.test.ts --test-name-pattern "preserve existing config-unknown Labels"
```

Expected: FAIL because `preserveUnknownLabels` does not exist and `updateIssue` rejects `legacy-label`.

- [ ] **Step 3: Implement core preservation option**

In `packages/core/src/issue-mutations.ts`, extend `UpdateIssueOptions`:

```ts
preserveUnknownLabels?: boolean;
```

Update label validation inside `updateIssue`:

```ts
const existingLabels = target.value.issue.labels.map(String);
const configuredLabelIds = new Set(options.config.labels.map((label) => label.id));
const existingUnknownLabels = new Set(
  existingLabels.filter((label) => !configuredLabelIds.has(label)),
);
const labels = options.labels ?? existingLabels;
const labelsToValidate = options.preserveUnknownLabels
  ? labels.filter((label) => !existingUnknownLabels.has(label))
  : labels;
const labelsValidation = validateLabels(options.config, labelsToValidate);
if (!labelsValidation.ok) return labelsValidation;
```

This allows only unknown Labels that were already present on the target Issue. New unknown Labels still fail validation.

- [ ] **Step 4: Write failing TUI mutation test**

Add test:

```ts
test("updates selected Issue Labels through core mutation and preserves unknown Labels", () => {
  const cwd = tempProject();
  const init = initProject(cwd, { key: "MIK", name: "mikan" });
  expect(init.ok).toBe(true);
  if (!init.ok) throw new Error("expected init");
  writeFileSync(
    join(cwd, ".mikan", "config.yaml"),
    `project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: ready\n      title: Ready\nlabels:\n  - id: automation\n    title: Automation\n  - id: herdr\n    title: Herdr\n`,
  );
  writeFileSync(
    join(cwd, ".mikan", "ready", "MIK-001.md"),
    `---\nid: MIK-001\ntitle: Ready issue\nlabels:\n  - legacy-label\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Ready issue\n`,
  );
  const model = loadTuiModel(cwd);
  const result = updateSelectedIssueLabels({
    cwd,
    model,
    selection: {
      columnIndex: 0,
      cardIndex: 0,
      detailOpen: false,
      labelOpen: true,
      labelDraftIds: ["herdr", "automation"],
    },
    now: () => new Date("2026-05-30T01:00:00Z"),
  });

  expect(result.ok).toBe(true);
  expect(result.message).toBe("MIK-001 Labels updated");
  const markdown = readFileSync(join(cwd, ".mikan", "ready", "MIK-001.md"), "utf8");
  expect(markdown).toContain("labels:\n  - automation\n  - herdr\n  - legacy-label");
  expect(markdown).not.toContain("Labels updated via TUI");
});
```

- [ ] **Step 5: Run TUI mutation test and verify RED**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "updates selected Issue Labels"
```

Expected: FAIL because `updateSelectedIssueLabels` does not exist.

- [ ] **Step 6: Implement TUI Label mutation**

In `packages/tui/src/mutations.ts`, import `updateIssue` from `@mikan/core` and add:

```ts
export function updateSelectedIssueLabels(options: {
  cwd?: string;
  model: TuiModel;
  selection: TuiSelection;
  now?: () => Date;
}): TuiMutationResult {
  const card = selectedCard(options.model, options.selection);
  if (!card) {
    return {
      ok: false,
      model: options.model,
      selection: { ...options.selection, labelOpen: false },
      message: "No Issue selected",
    };
  }
  const loaded = loadProjectConfig(options.cwd ?? process.cwd());
  if (!loaded.ok) {
    return {
      ok: false,
      model: options.model,
      selection: { ...options.selection, labelOpen: false },
      message: loaded.error.message,
    };
  }
  const selectedKnown = new Set(options.selection.labelDraftIds ?? []);
  const configuredIds = loaded.value.config.labels.map((label) => label.id);
  const configuredSet = new Set(configuredIds);
  const knownLabels = configuredIds.filter((label) => selectedKnown.has(label));
  const unknownLabels = card.labels.filter((label) => !configuredSet.has(label));
  const updated = updateIssue({
    projectRoot: loaded.value.projectRoot,
    config: loaded.value.config,
    id: card.id,
    labels: [...knownLabels, ...unknownLabels],
    preserveUnknownLabels: true,
    now: options.now,
  });
  if (!updated.ok) {
    return {
      ok: false,
      model: options.model,
      selection: { ...options.selection, labelOpen: false },
      message: updated.error.message,
    };
  }
  const model = loadTuiModel(options.cwd);
  const selection = findSelectionByCardId(model, card.id) ?? clampSelection(model, options.selection);
  return {
    ok: true,
    model,
    selection: { ...selection, labelOpen: false },
    message: `${card.id} Labels updated`,
  };
}
```

- [ ] **Step 7: Wire Enter save in `launchTui`**

In `packages/tui/src/index.ts`, before move modal handling, add a `selection.labelOpen` branch:

```ts
if (selection.labelOpen) {
  if (action === "help") {
    setSelection((current) => moveSelection(model, current, action));
    return;
  }
  if (action === "escape") {
    setSelection((current) => moveSelection(model, current, action));
    return;
  }
  if (action === "up" || action === "down") {
    setSelection((current) => moveLabelFocus(model, current, action));
    return;
  }
  if (key.name === "space") {
    setSelection((current) => toggleFocusedLabel(model, current));
    return;
  }
  if (action === "enter") {
    const result = updateSelectedIssueLabels({ cwd: options.cwd, model, selection });
    setModel(result.model);
    setSelection({ ...result.selection, message: result.message });
    return;
  }
  return;
}
```

- [ ] **Step 8: Run focused core and TUI tests and verify GREEN**

Run:

```sh
bun test packages/core/__tests__/mutation.test.ts --test-name-pattern "preserve existing config-unknown Labels"
bun test packages/tui/__tests__/tui.test.ts --test-name-pattern "updates selected Issue Labels|Label"
```

Expected: PASS.

---

### Task 5: Final TUI integration and validation

**Files:**
- Modify: `packages/tui/__tests__/tui.test.ts`
- Modify: `packages/tui/src/index.ts`
- Modify: `packages/tui/src/modals.ts`
- Modify: `packages/tui/src/navigation.ts`
- Modify: `packages/tui/src/formatting.ts`
- Modify: `README.md` if user-facing key help examples mention TUI keys

- [ ] **Step 1: Add regression tests for cancellation and empty Label config**

Add tests:

```ts
test("escape closes Label editor without changing draft state into a save", () => {
  const model: TuiModel = {
    columns: [
      {
        id: "ready",
        title: "Ready",
        cards: [
          { id: "MIK-001", title: "Ready issue", labels: ["automation"], status: "ready", path: "/tmp/MIK-001.md" },
        ],
      },
    ],
    warnings: [],
    labels: [{ id: "automation", title: "Automation" }],
    labelTitles: { automation: "Automation" },
  };

  const closed = moveSelection(
    model,
    {
      columnIndex: 0,
      cardIndex: 0,
      detailOpen: false,
      labelOpen: true,
      labelDraftIds: [],
    },
    "escape",
  );

  expect(closed.labelOpen).toBe(false);
});

test("Label editor empty config keeps modal mode", () => {
  const selection: TuiSelection = {
    columnIndex: 0,
    cardIndex: 0,
    detailOpen: false,
    labelOpen: true,
  };

  expect(footerMode(selection)).toBe("modal");
});
```

- [ ] **Step 2: Run full TUI tests**

Run:

```sh
bun test packages/tui/__tests__/tui.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run proactive diagnostics**

Run LSP diagnostics on touched TS files:

```ts
lsp_diagnostics({
  filePaths: [
    "packages/core/src/issue-mutations.ts",
    "packages/tui/src/model.ts",
    "packages/tui/src/selection.ts",
    "packages/tui/src/navigation.ts",
    "packages/tui/src/prompt-view-model.ts",
    "packages/tui/src/modals.ts",
    "packages/tui/src/mutations.ts",
    "packages/tui/src/index.ts",
    "packages/tui/src/formatting.ts",
    "packages/tui/src/text-render.ts",
    "packages/tui/__tests__/tui.test.ts",
  ],
  severity: "all",
  concurrency: 8,
})
```

Expected: no diagnostics.

- [ ] **Step 4: Run project checks**

Run:

```sh
bun run typecheck
bun run test
bun run check
```

Expected: all pass.

- [ ] **Step 5: Review the final diff**

Run:

```sh
but status -fv
but diff
```

Expected: only files in this plan changed. No generated files or `.mikan/.state/*` files are included.

- [ ] **Step 6: Commit with GitButler**

Use IDs from `but status -fv`:

```sh
but commit la -m "Add TUI label editing" --changes aa,bb,cc --status-after
```

Replace `la` and `aa,bb,cc` with the branch and change IDs reported by `but status -fv` immediately before committing.

Expected: a commit on the current implementation branch with no unassigned changes.

---

## Self-review

- Spec coverage: every agreed behavior maps to Tasks 1-5.
- Placeholder scan: the plan contains no unfinished-marker placeholders; code snippets are concrete and file paths are exact.
- Type consistency: `labelOpen`, `labelFocusIndex`, `labelDraftIds`, `LabelPromptViewModel`, `moveLabelFocus`, `toggleFocusedLabel`, and `updateSelectedIssueLabels` are consistently named across tasks.
