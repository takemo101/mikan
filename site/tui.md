# TUI

`mikan tui` opens a keyboard-first board over the same `.mikan/` Markdown files used by the CLI and MCP server.

```sh
mikan tui
```

## Board-first flow

The main page is the Kanban board. Statuses render as Columns, Issues render as dense one-line Cards, and archived Issues stay hidden unless explicitly included by other commands.

Key bindings:

| Key | Action |
| --- | --- |
| `h` / `l` or ←/→ | Move across Status Columns |
| `j` / `k` or ↑/↓ | Move through Cards |
| `H` / `L` | Move the selected Issue to the adjacent Status |
| `Enter` | Open the selected Issue detail page |
| `n` | Append a Note in a modal prompt |
| `a` | Confirm Archive in a modal prompt |
| `r` | Reload from disk |
| `?` | Show key help |
| `Esc` | Back or cancel |
| `q` | Quit |

## Detail page

Press `Enter` on a Card to open full-page Markdown detail. The title and metadata stay fixed while the Markdown body scrolls. In detail mode, left/right Column navigation is ignored so the board selection does not change underneath.

## Column count

`mikan tui --columns <auto|2|3|4|5>` controls how many Status Columns are visible at once.

```sh
mikan tui --columns auto   # default
mikan tui --columns 2
mikan tui --columns 3
mikan tui --columns 4
mikan tui --columns 5
mikan tui -c 5
```

`auto` derives between 2 and 5 visible Columns from terminal width. Fixed values pin an explicit visible count. This option changes only the TUI viewport; it does not change configured Statuses or Issue files.

## Local mutations

The TUI performs the same small mutations exposed by the CLI:

- Move selected Issue to a neighboring Status.
- Append a Note.
- Archive with confirmation.
- Reload from disk after external edits.

mikan writes through the same project-local lock used by the CLI and MCP server.

## Warnings

The board can show warnings for malformed Issues, duplicate IDs, dependency problems, and hook failures. Warnings are informational; the Markdown files remain the source of truth.
