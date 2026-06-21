# Browser

`mikan browser` opens a local Web board over the same `.mikan/` Markdown files used by the CLI, TUI, and MCP server. It is a human-facing view, not a new source of truth: Markdown remains the source of truth.

```sh
mikan browser
mikan browser --port 4321
mikan browser --no-open
mikan browser --port 4321 --no-open
```

## Local-only behavior

`mikan browser` runs as a foreground process for as long as the command is open:

- it discovers the project by walking upward for `.mikan/config.yaml`, and fails before opening the browser when config loading fails;
- it starts a local server bound to `127.0.0.1` only — it is never exposed on your network;
- it auto-selects an available local port by default; pass `--port <port>` to pin one;
- it prints the local URL and opens your browser automatically; pass `--no-open` to skip launching a browser (the URL is still printed);
- it stays in the foreground until you press Ctrl-C, which exits the command and stops the server.

There is no background daemon and no shared server: closing the command stops the board.

## Initial UI

The Browser shows a dark, compact, developer-native board close in spirit to the TUI:

- **Board display**: configured Status Columns with Cards, board warnings, Card labels, dependency readiness markers, and (in workspace mode) primary Repository prefix and affected Repository context.
- **Repository filter**: in workspace mode, filter Cards by primary `repository`, with a segmented `Primary | +Affected` scope control (see [Repository filter scope](#repository-filter-scope)). `Primary` is the default and matches only the primary `repository`; `+Affected` also includes Issues whose `affects` contains the selected Repository. The active filter, scope, and selected Issue are reflected in URL query parameters such as `?repository=backend&includeAffected=1&issue=MIK-123`, so a reload restores them.
- **Markdown detail modal**: click a Card to open a Focused Markdown Modal that renders the Issue body.
- **Append Reports/Notes**: append a Report or a Note from forms inside the detail modal, using the same append semantics as the CLI, MCP, and TUI.
- **Drag-and-drop Status move**: drag a Card between Status Columns to move the Issue. The drag-and-drop Status move is immediate and writes the Status Log entry `Moved via mikan browser`.

The Browser does not use optimistic write UI: it polls the board every few seconds, refreshes Board and detail data after a successful append or move, and shows structured errors when a write fails. Card reordering within a Column is not implemented.

## Markdown rendering and raw HTML

Issue Markdown renders with `react-markdown` and `remark-gfm` (GitHub-flavored Markdown such as tables and strikethrough) using Tailwind Typography. Raw HTML embedded in an Issue is left disabled: `react-markdown` does not render it, so embedded HTML cannot inject elements into the page.

## Repository filter scope

Workspace Repository filtering keeps primary-only as the default and adds a segmented scope control next to the Repository selector:

```txt
Repository: [ backend v ]   Scope: [ Primary | +Affected ]
```

`Primary` shows Issues whose primary `repository` matches the selected Repository. `+Affected` also includes Issues whose `affects` contains the selected Repository. The URL stores the expanded scope as `includeAffected=1`, for example `?repository=backend&includeAffected=1&issue=MIK-123`; the parameter is omitted while the default `Primary` scope is active.

`affects` remains display/filter context only. It never chooses the GitHub Mirror target.

## Detail actions

The detail modal has a top action bar below the header that keeps the Board focused on display, filtering, selection, and drag-and-drop Status moves while Label, Archive, and GitHub Mirror actions live alongside the Issue you are reading:

```txt
[ MIK-123                                      × ]
[ Edit labels ] [ Create/Update GitHub Mirror ]        [ Archive ]
---------------------------------------------------------
Markdown detail body...
```

- **Edit labels** opens a small popover inside the detail modal. Config-defined Labels are checkboxes in config order. Unknown existing Labels are shown as read-only preserved Labels. Saving updates frontmatter only; it does not add Status Log or Note entries and does not push a GitHub Mirror.
- **Archive** opens a confirmation modal, then moves the Issue to Status `archived` through the same core move behavior used by the CLI, MCP, and TUI, and writes `Archived via mikan browser`. It does not delete the Markdown file, and it does not add unarchive or show-archived Browser views. When the archived Issue leaves the visible board, Browser closes the detail modal after the write succeeds.
- **Create/Update GitHub Mirror** shows `Create GitHub Mirror` when the Issue has no `github_issue` and `Update GitHub Mirror` when it already has one. It opens a confirmation modal showing the target Repository, then runs a synchronous create/update request backed by the existing GitHub Mirror behavior; the button shows a pending state until the GitHub work completes. Single-project Mirrors use top-level `github.repo`; workspace Mirrors use the Issue's primary `repository` and `repositories[].github.repo`. Labels and `affects` never choose the target.

After successful writes, Browser refreshes Board/detail data. Failed writes show structured errors instead of optimistic persistence.

## Guardrails

`mikan browser` stays inside mikan's scope guards:

- **Markdown remains the source of truth**: Browser reads and writes go through the same project config, board scanning, and core mutation rules as the CLI, MCP, and TUI.
- It is **not a shared dashboard**, hosted service, **mandatory daemon**, **scheduler**, **database**, **GitHub sync surface**, or **agent runtime**.
- Write requests are rejected when their Host/Origin does not match the local server origin, and writes never touch files outside the active project root.

## Still out of scope

Even with these detail actions shipped, the Browser still leaves the following out:

- unarchive and show-archived Browser views;
- editing `repository` or `affects` from Browser;
- full keyboard shortcut parity with the TUI;
- remote or shared dashboard mode.

Use the CLI, MCP, or TUI for actions the Browser does not yet expose.
