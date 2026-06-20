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
- TanStack Router for typed single-page route/search-param state such as `repository` and `issue`.
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

## Initial scope

The initial product target is split across multiple implementation Issues, but the target Browser UI includes:

- real Kanban board display with configured Columns and Cards;
- the selected **Local Command Board** visual direction: dark, compact, developer-native, and close in spirit to the TUI;
- warning summary/details from board scanning;
- Card labels, dependency readiness markers, primary Repository prefix, affected Repository context where useful, and workspace Repository filter UI;
- Repository filtering by primary `repository` only; `affects` does not widen results;
- URL query state for active Repository filter and selected Issue, for example `?repository=backend&issue=MIK-123`;
- Card click opens a **Focused Markdown Modal**;
- Issue Markdown renders as safe HTML with raw HTML disabled or escaped;
- Reports and Notes can be appended from forms/tabs inside the detail modal;
- Cards can be drag-moved between Status Columns;
- drag-and-drop move is immediate and writes the automatic Status Log entry `Moved via mikan browser`;
- no optimistic write UI initially: successful writes refresh Board/detail data, and failed writes show structured errors.

Deferred from the initial target:

- GitHub Mirror actions;
- Label editing;
- archive/unarchive;
- advanced Repository filtering such as include-affected mode;
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

The Browser should poll the Board API through TanStack Query every few seconds so changes made by CLI, MCP, TUI, or agents become visible without a manual reload. Append and move mutations invalidate/refetch Board and selected Issue detail queries after success.

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
   - Show labels, dependency status, warnings, Repository prefix/context, empty Columns, and Repository filter UI.
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

## Verification

Each slice should run the normal project gates plus focused tests:

- `bun run typecheck`
- `bun run test`
- `bun run check`
- `bun run docs:build` when docs/site changes
- CLI parse/help tests for `mikan browser`, `--port`, and `--no-open`.
- Server startup tests in no-open/test mode.
- API tests for Board, Issue detail, append, move, and Host/Origin rejection.
- Browser component tests with Testing Library + happy-dom for board rendering, warning display, Card metadata, Markdown detail, append forms, and non-browser-specific drag/drop behavior.
- Package dry-run tests proving Browser assets are included in the published CLI package.
- Manual smoke: `mikan browser` opens the local board, shows detail, appends a Note/Report, and drag-moves a Card.
