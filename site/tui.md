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
| `e` | Edit Labels in a modal prompt |
| `a` | Confirm Archive in a modal prompt |
| `g` | Create or update a GitHub Mirror for the selected Issue |
| `w` | Show warning details in a modal |
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
- Edit Labels by checking and unchecking config-defined Labels while preserving read-only unknown Labels.
- Archive with confirmation.
- Create or update a one-way GitHub Mirror with `g`.
- Reload from disk after external edits.

mikan writes through the same project-local lock used by the CLI and MCP server.

## Notes

Press `n` to append a free-form Note to the selected Issue. The Note modal accepts multi-line Markdown: Enter inserts a newline, Ctrl+S saves, and Esc cancels. Empty saves stay in the modal and show `Note cannot be empty`.

The Note input is intentionally lightweight rather than a full editor. It shows a `▌` cursor marker, supports left/right movement within the current line, does not support vertical cursor movement, and displays the trailing 5-line window when the draft is longer than the visible input area. On save, mikan trims only leading/trailing blank space and appends the body to `## Notes` through the same mutation path used by CLI and MCP.

## GitHub Mirror

Press `g` on the selected Issue in Board or Detail mode. If the Issue is already mirrored, mikan updates it immediately. If it has no `github_issue`, mikan opens a confirmation modal showing the Issue ID, title, configured GitHub repo, and a note that local Markdown remains the source of truth.

Mirrored Issues show `GitHub #123` in Detail metadata. Dense Board Cards stay focused on Issue ID, title, labels, and dependency hints. See [GitHub Mirror](./github-mirror.md) for setup and rules.

## Warnings

The board can show warnings for malformed Issues, duplicate IDs, dependency problems, and hook failures. Press `w` to open warning details in a focused modal, and press Esc to close it. Warnings are informational; the Markdown files remain the source of truth.
