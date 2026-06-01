# @takemo101/mikan

mikan is a tiny local-first Issue board for AI-assisted development. It stores Issues as Markdown files under `.mikan/` and exposes the same board through a CLI, keyboard-first TUI, stdio MCP server, and polling watcher.

## Install

```sh
npm install -g @takemo101/mikan
mikan init
mikan add "First Issue"
mikan tui
```

mikan is currently built for Bun-based execution. The npm package installs the `mikan` binary.

## What it provides

- **Markdown source of truth**: each Issue is a file such as `.mikan/ready/MIK-001.md`.
- **Primitive CLI commands**: `init`, `add`, `list`, `show`, `update`, `move`, `append`, `tui`, `watch`, `mcp`.
- **Keyboard TUI**: board-first flow with detail view, Note modal, Move shortcuts, and Archive confirmation.
- **MCP server**: stdio tools for agents: `get_board`, `list_issues`, `get_issue`, `create_issue`, `update_issue`, `move_issue`, `append_issue`.
- **Watch hooks**: optional local automation on Status entry/transition.

## Quickstart

```sh
mikan init
mikan add "Prototype dispatcher" --status ready --label automation
mikan list
mikan show MIK-001
mikan tui
```

## More information

See the repository README for full CLI examples, TUI keys, config format, design principles, and limitations:

https://github.com/takemo101/mikan
