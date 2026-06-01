# mikan

mikan is a tiny local-first Issue board for AI-assisted development. It keeps project context in Markdown files under `.mikan/`, gives humans a keyboard-first Kanban TUI, and gives agents a small CLI/MCP surface over the same source of truth.

## Install

```sh
npm install -g @takemo101/mikan
```

One-off use also works with npm-style runners:

```sh
npx @takemo101/mikan init
# or
bunx @takemo101/mikan init
```

mikan is currently built for Bun-based execution.

## Quickstart

```sh
mikan init
mikan add "Polish the release README" --status ready --label automation
mikan list
mikan show MIK-001
mikan tui
```

The board lives in `.mikan/`. Each Issue is a Markdown file named by Issue ID, such as `.mikan/ready/MIK-001.md`.

## CLI

```sh
mikan init
mikan list [--status ready] [--include-archived]
mikan show MIK-001
mikan add "Prototype dispatcher" --label automation --status backlog
mikan update MIK-001 --title "Prototype dispatcher" --label herdr
mikan move MIK-001 ready --log "Ready to implement"
mikan append MIK-001 --section Notes --body "Keep this local."
mikan tui
mikan watch
mikan mcp
```

## TUI

`mikan tui` opens a flow-style keyboard board:

- `h` / `l` or arrow keys: move across Status Columns
- `j` / `k` or arrow keys: move through Cards or scroll detail
- `H` / `L`: move the selected Issue to an adjacent Status
- `Enter`: open full-page Markdown detail
- `n`: append a Note
- `a`: confirm Archive
- `r`: reload
- `Esc`: back/cancel
- `q`: quit

## MCP and watch

`mikan mcp` starts a stdio MCP server exposing primitive Issue operations for agents:

- `get_board`
- `list_issues`
- `get_issue`
- `create_issue`
- `update_issue`
- `move_issue`
- `append_issue`

`mikan watch` polls the board and runs configured hooks for local automation. Hook failures are logged but do not roll back Issue moves.

## Design principles

- Markdown files are the source of truth.
- Issue is the canonical unit of work.
- Status is the containing directory.
- Archived Issues stay local and are hidden by default.
- The v0 API stays primitive: no workflow engine, scheduler, database, accounts, or remote sync.

See [`docs/design.md`](docs/design.md), [`CONTEXT.md`](CONTEXT.md), and [`docs/adr/0001-markdown-files-source-of-truth.md`](docs/adr/0001-markdown-files-source-of-truth.md) for the durable design record.

## Limitations

mikan v0.0.1 is intentionally small:

- no SQLite/database storage;
- no GitHub sync;
- no user accounts or hosted service;
- no full Markdown body editing in the TUI;
- no drag/drop board interactions;
- no modeled agent profiles, teams, workflow engine, or scheduler.

## Release

The npm package is scoped as `@takemo101/mikan` and installs the `mikan` binary.
