# mikan browser design

`mikan browser` is the planned local Browser UI adapter for mikan. It is parallel to `mikan tui`: a human-facing view over the same Markdown Issues, not a new source of truth.

## Product boundary

`mikan browser` starts a foreground local server bound to `127.0.0.1`, opens the user's browser by default, and exits when the CLI process stops. It is intentionally not a shared dashboard, hosted service, mandatory daemon, scheduler, GitHub sync surface, database, or agent runtime.

Markdown files under `.mikan/` remain authoritative. Browser reads and writes go through the same project config, board scanning, and core mutation rules as CLI, MCP, and TUI.

## Stack

The Browser adapter lives in a new `packages/browser` package.

- React 19 + Vite for the Web UI.
- Hono for the Bun local HTTP/API server.
- Tailwind CSS v4 plus `@tailwindcss/typography` for UI styling and Markdown typography.
- React Aria Components for accessible buttons, dialogs, forms, and interaction primitives.
- Atlassian Pragmatic Drag and Drop for Kanban Card drag-and-drop.
- `react-markdown` + `remark-gfm` for Markdown detail rendering, with raw HTML disabled or escaped.
- TanStack Query for server-state polling, mutation state, and post-mutation invalidation.
- TanStack Router for typed single-page route/search-param state such as `repository`, `includeAffected`, and `issue`.
- `bun test` + Testing Library + happy-dom for component and client behavior tests.

Published `mikan browser` serves Vite-built static assets copied into the CLI package's `dist/browser/` directory. Development-only scripts may run Hono with Vite/HMR, but that is not part of the public CLI runtime contract.

## CLI shape

```sh
mikan browser
mikan browser --port 4321
mikan browser --no-open
mikan browser --port 4321 --no-open
```

Behavior:

- default port is auto-selected from an available local port;
- server binds to `127.0.0.1` only;
- browser opens automatically unless `--no-open` is passed;
- command prints the local URL;
- process stays in the foreground until Ctrl-C;
- invalid project config fails before opening the browser.

## Released initial scope

The initial Browser product target is split across multiple implementation Issues, but the target Browser UI includes:

- real Kanban board display with configured Columns and Cards;
- the selected **Local Command Board** visual direction: dark, compact, developer-native, and close in spirit to the TUI;
- a compact header warning button, placed left of the theme toggle, that opens
  grouped warning details from board scanning without taking vertical board
  space;
- Card labels, dependency readiness markers, primary Repository prefix, affected Repository context where useful, and workspace Repository filter UI;
- Repository filtering by primary `repository` only; `affects` does not widen results in the initial release;
- URL query state for active Repository filter and selected Issue, for example `?repository=backend&issue=MIK-123`;
- Card click opens a **Focused Markdown Modal**;
- Issue Markdown renders as safe HTML with raw HTML disabled or escaped;
- Reports and Notes can be appended from forms/tabs inside the detail modal;
- Cards can be drag-moved between Status Columns;
- drag-and-drop move is immediate and writes the automatic Status Log entry `Moved via mikan browser`;
- no optimistic write UI initially: successful writes refresh Board/detail data, and failed writes show structured errors.

## Next Browser action scope

The next Browser action scope keeps Browser as a small local UI adapter while exposing a few already-existing mikan mutations from the Issue detail modal.

### Repository filter include-affected mode

Workspace Repository filtering keeps **Primary** as the default. The Browser adds a segmented scope control next to the Repository selector:

```txt
Repository: [ backend v ]   Scope: [ Primary | +Affected ]
```

- `Primary` shows only Issues whose primary `repository` matches the selected Repository.
- `+Affected` shows Issues whose primary `repository` matches, plus Issues whose `affects` contains the selected Repository.
- `affects` still never chooses GitHub Mirror targets.
- URL state uses `includeAffected=1` only when the expanded scope is active, for example `?repository=backend&includeAffected=1&issue=MIK-123`.

### Detail action bar

Issue detail keeps the Markdown body as the main reading surface and adds a top action bar below the modal header:

```txt
[ MIK-123                                      × ]
[ Edit labels ] [ Create/Update GitHub Mirror ]        [ Archive ]
---------------------------------------------------------
Markdown detail body...
```

The board remains focused on display, filtering, selection, and drag-and-drop Status moves. Labels, Archive, and GitHub Mirror actions live in detail so the user acts while reading the Issue context.

### Label editing

`Edit labels` opens a small popover inside the detail modal:

- config-defined Labels appear in config order as checkboxes;
- selected Labels are checked;
- config-unknown existing Labels are shown as read-only preserved Labels;
- saving writes frontmatter Labels only, without adding Status Log or Note entries and without pushing GitHub Mirrors;
- cancel closes the popover without writing.

### Archive action

`Archive` opens a confirmation modal before writing. Confirming moves the Issue to Status `archived` through the existing core move behavior and writes the Status Log entry `Archived via mikan browser`. It does not delete the Markdown file, add an unarchive surface, or show archived Issues by default. After success, Browser refreshes Board/detail data and closes the detail modal if the archived Issue leaves the visible board.

### GitHub Mirror action

The detail action bar shows `Create GitHub Mirror` when the Issue has no Mirror metadata and `Update GitHub Mirror` when it already has `github_issue`. The action opens a confirmation modal that shows the target Repository before writing.

- The mutation is a synchronous request; the button shows pending state until GitHub work completes.
- New Mirrors use the same target rules as `mikan github mirror`: single-project config uses top-level `github.repo`; workspace config uses the Issue's primary `repository` and that Repository's `repositories[].github.repo`.
- Labels and `affects` never choose the target Repository.
- Existing Mirrors keep their stored `github_issue.repo` unless the core GitHub Mirror behavior changes.
- Success refreshes Board/detail data; failures show structured user-facing errors.

Still deferred:

- unarchive and show-archived Browser views;
- editing `repository` or `affects` from Browser;
- full keyboard shortcut parity with TUI;
- shared or remote dashboard mode;
- background daemon mode.

## API shape

Route names may be refined during implementation, but keep the API small:

- `GET /` — Browser app shell.
- `GET /assets/*` — Vite-built static assets.
- `GET /api/board` — current shared `BoardViewModel` plus project/browser metadata.
- `GET /api/issues/:id` — Issue Markdown/detail payload for the selected Card.
- `POST /api/issues/:id/append` — append to `Reports` or `Notes` using existing core append behavior.
- `POST /api/issues/:id/move` — move to a Status using existing core move behavior and the browser Status Log message.
- `POST /api/issues/:id/labels` — update config-defined Labels while preserving config-unknown existing Labels.
- `POST /api/issues/:id/archive` — move to `archived` and write `Archived via mikan browser`.
- `POST /api/issues/:id/github-mirror` — create or update the Issue's GitHub Mirror through the existing GitHub Mirror behavior.

Write APIs must:

- reload current project state from disk for each mutation;
- avoid optimistic UI updates in the initial implementation;
- return errors as `{ ok: false, error: { code, message } }`;
- preserve core/user-fixable error codes where possible and map unexpected failures to `internal_error`;
- show errors in the browser as global toast/banner messages for board/move failures and form-near messages for append failures;
- reject requests whose Host/Origin does not match the local server origin;
- never write outside the active project root.

## Shared view model

Extract TUI-neutral board display data from `TuiModel` into a shared `BoardViewModel` used by both TUI and Browser. Shared semantics include Columns, Cards, labels, warnings, Repository fields, GitHub Mirror metadata, Issue Metadata, and dependency readiness.

The Browser should poll the Board API through TanStack Query every few seconds so changes made by CLI, MCP, TUI, or agents become visible without a manual reload. Append, move, label, archive, and GitHub Mirror mutations invalidate/refetch Board and selected Issue detail queries after success.

## Implementation slices

1. **Browser foundation and CLI command**
   - Add `packages/browser`.
   - Add `mikan browser`, `--port`, and `--no-open`.
   - Start a foreground Hono server bound to `127.0.0.1`.
   - Serve a minimal Vite app shell from CLI dist assets.
   - Add development-only Hono + Vite/HMR scripts.

2. **Shared BoardViewModel and board API**
   - Extract TUI-neutral `BoardViewModel` from `TuiModel`.
   - Update TUI to consume it without behavior changes.
   - Add `GET /api/board` and short-polling client behavior.

3. **Real Web board display**
   - Render Columns and Cards in React.
   - Show labels, dependency status, a compact warning button/modal,
     Repository prefix/context, empty Columns, and Repository filter UI.
   - Persist `repository` filter in URL query state.

4. **Markdown Issue detail**
   - Add `GET /api/issues/:id`.
   - Open details in a modal from Card click.
   - Persist selected `issue` in URL query state.
   - Render Markdown with `react-markdown`, `remark-gfm`, and Tailwind Typography, with raw HTML disabled or escaped.

5. **Append Reports/Notes**
   - Add append API and forms/tabs inside the Issue detail modal.
   - Use existing append semantics and timestamp/source conventions.
   - Refresh Board/detail after success.

6. **Drag-and-drop Status move**
   - Add move API.
   - Implement drag-and-drop between Status Columns.
   - Move immediately on drop and write `Moved via mikan browser`.
   - Refresh Board after success and show errors without losing state.

7. **Repository filter include-affected mode**
   - Add the `Primary | +Affected` segmented scope control.
   - Keep primary-only as the default.
   - Persist expanded scope as `includeAffected=1` in URL state.
   - Keep `affects` display/filter-only; it must not influence GitHub Mirror targets.

8. **Detail Label editing**
   - Add `Edit labels` to the detail action bar.
   - Open a label checklist popover for config-defined Labels.
   - Preserve config-unknown existing Labels as read-only values when saving.
   - Refresh Board/detail after success.

9. **Detail Archive action**
   - Add `Archive` to the detail action bar.
   - Confirm through a modal before writing.
   - Move to `archived` and write `Archived via mikan browser`.
   - Do not add unarchive or show-archived Browser views in this slice.

10. **Detail GitHub Mirror action**
    - Add `Create GitHub Mirror` / `Update GitHub Mirror` to the detail action bar.
    - Confirm through a modal that shows the target Repository.
    - Use a synchronous POST backed by existing GitHub Mirror behavior.
    - Refresh Board/detail after success and show structured errors on failure.

## Verification

Each slice should run the normal project gates plus focused tests:

- `bun run typecheck`
- `bun run test`
- `bun run check`
- `bun run docs:build` when docs/site changes
- CLI parse/help tests for `mikan browser`, `--port`, and `--no-open`.
- Server startup tests in no-open/test mode.
- API tests for Board, Issue detail, append, move, label update, archive, GitHub Mirror, and Host/Origin rejection.
- Browser component tests with Testing Library + happy-dom for board rendering, warning display, Card metadata, Repository filter scope, Markdown detail, label popover, confirmation modals, append forms, and non-browser-specific drag/drop behavior.
- Package dry-run tests proving Browser assets are included in the published CLI package.
- Manual smoke: `mikan browser` opens the local board, shows detail, appends a Note/Report, and drag-moves a Card.
