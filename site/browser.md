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
- **Repository filter**: in workspace mode, filter Cards by primary `repository` only; `affects` does not widen results. The active filter and the selected Issue are reflected in URL query parameters such as `?repository=backend&issue=MIK-123`, so a reload restores them.
- **Markdown detail modal**: click a Card to open a Focused Markdown Modal that renders the Issue body.
- **Append Reports/Notes**: append a Report or a Note from forms inside the detail modal, using the same append semantics as the CLI, MCP, and TUI.
- **Drag-and-drop Status move**: drag a Card between Status Columns to move the Issue. The drag-and-drop Status move is immediate and writes the Status Log entry `Moved via mikan browser`.

The Browser does not use optimistic write UI: it polls the board every few seconds, refreshes Board and detail data after a successful append or move, and shows structured errors when a write fails. Card reordering within a Column is not implemented.

## Markdown rendering and raw HTML

Issue Markdown renders with `react-markdown` and `remark-gfm` (GitHub-flavored Markdown such as tables and strikethrough) using Tailwind Typography. Raw HTML embedded in an Issue is left disabled: `react-markdown` does not render it, so embedded HTML cannot inject elements into the page.

## Guardrails

`mikan browser` stays inside mikan's scope guards:

- **Markdown remains the source of truth**: Browser reads and writes go through the same project config, board scanning, and core mutation rules as the CLI, MCP, and TUI.
- It is **not a shared dashboard**, hosted service, **mandatory daemon**, **scheduler**, **database**, **GitHub sync surface**, or **agent runtime**.
- Write requests are rejected when their Host/Origin does not match the local server origin, and writes never touch files outside the active project root.

## Deferred surfaces

The initial Browser scope deliberately leaves the following out:

- GitHub Mirror actions;
- Label editing;
- archive/unarchive;
- include-affected Repository filtering;
- full keyboard shortcut parity with the TUI;
- remote or shared dashboard mode.

Use the CLI, MCP, or TUI for actions the Browser does not yet expose.
