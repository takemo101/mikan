# mikan browser design plan

## Context

The user wants a new `mikan browser` command that opens a Web board for the current mikan project. The command should eventually reach TUI parity, but the implementation should be split into multiple Issues rather than attempted as one large change.

mikan's existing design constraints still apply:

- Markdown files in `.mikan/` remain the source of truth.
- `mikan browser` is not a GitHub sync surface, scheduler, agent runtime, database-backed state machine, shared dashboard, or mandatory daemon.
- CLI/MCP/TUI are adapters over core board scanning and mutations; Browser should be another adapter, parallel to TUI.
- The public command surface should stay small and primitive.

## Approach

Add `mikan browser` as a local UI adapter. Running the command starts a foreground local server bound to `127.0.0.1`, opens the user's browser by default, serves a React Web board, and exits when the CLI process is stopped with Ctrl-C.

Use a new `packages/browser` package for the Browser adapter:

- **React 19 + Vite** for the Web UI.
- **Tailwind CSS v4** plus `@tailwindcss/typography` for styling and Markdown typography.
- **React Aria Components** for accessible buttons, dialogs, forms, and interaction primitives.
- **Atlassian Pragmatic Drag and Drop** for Kanban Card drag-and-drop.
- **react-markdown + remark-gfm** for Markdown detail rendering, with raw HTML disabled/escaped.
- **TanStack Query** for client-side server-state, polling, mutation state, and post-mutation invalidation.
- **TanStack Router** for typed single-page route/search-param state (`repository` filter and selected `issue`).
- **Hono** for the Bun local HTTP/API server.
- Browser static assets are built and copied into `packages/cli/dist/browser/` so the published `@takemo101/mikan` CLI package contains everything needed at runtime.
- Published `mikan browser` always serves built static assets. Development-only scripts in `packages/browser` may run Hono with Vite/HMR for Web UI iteration, but that dev behavior is not part of the public CLI runtime contract.
- The CLI package exposes `mikan browser [--port <port>] [--no-open]` and calls `launchBrowser({ cwd, port, open })` from `@mikan/browser`.

Extract the TUI-neutral parts of `TuiModel` into a shared `BoardViewModel` so TUI and Browser share display semantics for columns, cards, labels, warnings, Repository fields, GitHub Mirror metadata, and dependency readiness.

The Browser client uses TanStack Query to poll the Board API every few seconds so changes made by CLI/MCP/TUI/agents become visible without manual reload. Append and move mutations invalidate/refetch Board and selected Issue detail queries after success. It is not a persistent watcher or daemon.

## Initial product scope

The first browser feature set is split across multiple implementation Issues, but the agreed initial product target is:

- Real kanban board display with configured Columns and Cards using the selected **Local Command Board** visual direction: dark, developer-native, compact, and TUI-adjacent without becoming a generic SaaS dashboard.
- Warning summary/details surfaced from board scanning.
- Card labels, dependency-blocked indicators, primary Repository prefix, affected Repository context where available, and workspace Repository filter UI.
- Repository filter and selected Issue detail are reflected in URL query parameters, e.g. `?repository=backend&issue=MIK-123`.
- Click a Card to open Issue Markdown detail in a **Focused Markdown Modal**.
- Markdown detail is rendered to HTML, but raw HTML in Issue Markdown is disabled/escaped.
- Append Reports and Notes from forms/tabs inside the Issue detail modal.
- Drag-and-drop Cards between Status Columns.
- Drag-and-drop move is immediate and writes the automatic Status Log entry `Moved via mikan browser`.
- API write endpoints use Host/Origin checks as the initial localhost safety boundary.

Deferred from the initial product target:

- GitHub Mirror actions.
- Label editing.
- Archive/unarchive.
- Advanced Repository filtering beyond TUI parity, such as include-affected mode.
- Full keyboard shortcut parity with TUI.
- Shared/remote dashboard mode.
- Background daemon mode.

## Public CLI shape

```sh
mikan browser
mikan browser --port 4321
mikan browser --no-open
mikan browser --port 4321 --no-open
```

Behavior:

- Default port is auto-selected from an available local port.
- Server binds to `127.0.0.1` only.
- Browser opens automatically unless `--no-open` is passed.
- Command prints the local URL.
- Process remains in the foreground until Ctrl-C.
- Invalid project config fails before opening the browser.

## API shape

Exact route names can be refined during implementation, but the API should stay small:

- `GET /` — Browser app shell.
- `GET /assets/*` — Vite-built static assets.
- `GET /api/board` — current `BoardViewModel` plus project/browser metadata.
- `GET /api/issues/:id` — Issue Markdown/detail payload for the selected Card.
- `POST /api/issues/:id/append` — append to `Reports` or `Notes` using existing core append behavior.
- `POST /api/issues/:id/move` — move to a Status using existing core move behavior and an automatic browser Status Log message.

Write APIs must:

- Re-load current project state from disk for each mutation.
- Avoid optimistic UI updates in the initial implementation; refresh Board/detail after successful writes.
- Return API errors in one shape: `{ ok: false, error: { code, message } }`.
- Preserve core/user-fixable error codes where possible; map unexpected failures to `internal_error`.
- Show structured user-facing errors in the browser when writes fail: global toast/banner for board/move failures, plus form-near errors for append failures inside the Issue detail modal.
- Reject requests whose Host/Origin does not match the local server origin.
- Never write outside the active project root.

## Files to modify

Likely files and packages:

- `packages/cli/src/args.ts` — add `browser` command and options.
- `packages/cli/src/help.ts` — help text for `browser`.
- `packages/cli/src/index.ts` — non-interactive and interactive launch wiring.
- `packages/cli/src/cli-options.ts` — injectable browser launcher for tests.
- `packages/cli/__tests__/cli.test.ts` — command/help/launcher tests and package contents tests.
- `packages/tui/src/model.ts` or a new shared module — extract TUI-neutral `BoardViewModel`.
- New `packages/browser/` — Hono server, Vite app, React components, TanStack Query client state, TanStack Router search-param state, Tailwind v4 setup, React Aria UI primitives, Pragmatic Drag and Drop integration, Markdown rendering, API handlers, and `bun test` + Testing Library + happy-dom tests.
- `packages/cli/package.json` / build scripts — ensure browser assets are built/copied into CLI dist.
- Root workspace files if needed for dependencies and package registration.
- Docs: `README.md`, `packages/cli/README.md`, `site/cli.md`, possibly `site/tui.md` or a new site page.

## Reuse

Existing reusable pieces:

- `loadProjectConfig` from `@mikan/project-config` for current-project discovery.
- `scanBoard` from `@mikan/core` for authoritative Board snapshots.
- Existing core mutation functions for append and move.
- Existing TUI model/display behavior as the source for shared `BoardViewModel` semantics.
- Existing CLI command and interactive command patterns in `packages/cli/src/index.ts`, `args.ts`, and `help.ts`.
- Existing release/package checks that verify `dist/bin.js`, `README.md`, and package contents; extend these to cover browser assets.

## Implementation Issues

Recommended decomposition:

1. **Browser foundation and CLI command**
   - Add `packages/browser`.
   - Add `mikan browser`, `--port`, and `--no-open`.
   - Start a foreground Hono server bound to `127.0.0.1`.
   - Serve a minimal Vite app shell from CLI dist assets.
   - Add development-only scripts for Hono + Vite/HMR iteration without changing the published CLI runtime behavior.
   - Print URL and support test launcher injection.

2. **Shared BoardViewModel and board API**
   - Extract TUI-neutral `BoardViewModel` from `TuiModel`.
   - Update TUI to consume the shared model without behavior changes.
   - Add `GET /api/board`.
   - Add short-polling client code.

3. **Real Web board display**
   - Render Columns and Cards in React.
   - Show labels, dependency status, warnings, Repository prefix/context, and empty columns.
   - Add workspace Repository filter UI matching TUI semantics: filter by primary `repository` only; `affects` does not widen results.
   - Persist active filter in the URL query parameter `repository`.
   - Keep the UI otherwise read-only in this slice.

4. **Markdown Issue detail**
   - Add `GET /api/issues/:id`.
   - Open details in a modal from Card click.
   - Persist selected Issue in the URL query parameter `issue`.
   - Render selected Issue Markdown with `react-markdown`, `remark-gfm`, and Tailwind Typography.
   - Escape/disable raw HTML.
   - Show loading/error/empty states.

5. **Append Reports/Notes**
   - Add append API and UI forms/tabs inside the Issue detail modal for Reports and Notes.
   - Use existing append semantics and timestamp/source conventions.
   - Poll or refresh after successful append.

6. **Drag-and-drop Status move**
   - Add move API.
   - Implement drag-and-drop between Status Columns.
   - Move immediately on drop and write an automatic Status Log entry.
   - Refresh board after successful move and show errors without losing state.

## Verification

Each implementation Issue should include targeted tests plus the normal project gates.

Core validation:

- `bun run typecheck`
- `bun run test`
- `bun run check`
- `bun run docs:build` when docs/site change

Feature-specific validation:

- CLI parse/help tests for `mikan browser`, `--port`, and `--no-open`.
- Server startup tests in no-open/test mode.
- Tests that the server binds to `127.0.0.1` and reports a local URL.
- API tests for `/api/board`, `/api/issues/:id`, append, and move.
- Host/Origin rejection tests for write APIs.
- Browser component/render tests using `bun test`, Testing Library, and happy-dom for board, warnings, Card metadata, Markdown detail, append forms, and non-browser-specific drag/drop behavior.
- Package dry-run test proving browser assets are included in published CLI dist.
- Manual smoke: `mikan browser` opens a local browser board for a fixture/current project, shows the board, opens Issue detail, appends a Note/Report, and drag-moves a Card.

## Design deck selections

The visual design deck selected:

- **Board visual direction**: Local Command Board.
- **Issue detail/write interaction**: Focused Markdown Modal.

These choices mean the initial Web UI should be dark, compact, developer-native, and close in spirit to the TUI, while keeping Markdown reading and append forms in a large accessible modal.

## Open follow-ups

- Status Log text for browser drag-and-drop moves is `Moved via mikan browser`.
- Repository filter UI belongs in the initial Web board display slice and follows TUI primary-Repository-only semantics.
- Plannotator review was skipped after port `19432` was found in use; continue design review in chat.
- Decide whether to add stronger per-run write tokens later if Browser write APIs expand beyond append/move.
