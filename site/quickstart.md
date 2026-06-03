# Quickstart

Create a local Issue board in a few commands.

## 1. Initialize a project

```sh
cd /path/to/your/repo
mikan init
```

This creates `.mikan/` with a config file, Status directories, state directory, and Issue template.

```txt
.mikan/
  config.yaml
  backlog/
  ready/
  active/
  blocked/
  completed/
  archived/
  .state/
  templates/
```

## 2. Add an Issue

```sh
mikan add "Polish the release README" --status ready --label automation
```

Each Issue is a Markdown file named by Issue ID, for example `.mikan/ready/MIK-001.md`.

## 3. Read the board

```sh
mikan list
mikan show MIK-001
```

`list` groups Issues by Status. `show` prints the full Markdown file for one Issue.

## 4. Open the TUI

```sh
mikan tui
```

The board is keyboard-first:

| Key | Action |
| --- | --- |
| ↑/↓ or j/k | Move through Cards or scroll detail |
| ←/→ or h/l | Move across Status Columns |
| H/L | Move selected Issue to adjacent Status |
| Enter | Open full-page Issue detail |
| n | Append a Note |
| a | Archive with confirmation |
| r | Reload from disk |
| Esc | Back or cancel |
| q | Quit |

## 5. Move and append from the CLI

```sh
mikan move MIK-001 active --log "Started implementation"
mikan append MIK-001 --section Notes --body "Keep this local-first."
mikan move MIK-001 completed --log "Acceptance criteria met"
```

## What just happened

- mikan created a Markdown-backed local board.
- Status changes moved the Issue file between directories.
- Notes and Status Log entries stayed in the Issue Markdown.
- No server, database, scheduler, or hosted service was introduced.

## Next

- [CLI](/cli) — all primitive commands.
- [TUI](/tui) — board behavior and Column options.
- [Config](/config) — customize Status Columns, labels, and hooks.
