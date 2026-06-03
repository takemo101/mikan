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
- **Primitive CLI commands**: `init`, `add`, `list`, `show`, `update`, `move`, `append`, `tui`, `watch`, `mcp`, `skills`.
- **Keyboard TUI**: board-first flow with detail view, Note modal, Move shortcuts, and Archive confirmation.
- **MCP server**: stdio tools for agents: `get_board`, `list_issues`, `get_issue`, `create_issue`, `update_issue`, `move_issue`, `append_issue`.
- **Agent setup**: register the MCP server or install agent guidance for common AI agents.
- **Watch hooks**: optional local automation on Status entry/transition.

## Quickstart

```sh
mikan init
mikan add "Prototype dispatcher" --status ready --label automation
mikan list
mikan show MIK-001
mikan tui
```

## Planned TUI columns

A planned `mikan tui --columns <auto|2|3|4|5>` option will make the visible Column viewport responsive. `auto` will choose between 2 and 5 visible Status Columns from terminal width. Fixed values will be available for users who want an explicit viewport width:

```sh
mikan tui --columns auto
mikan tui --columns 2
mikan tui --columns 3
mikan tui --columns 4
mikan tui --columns 5
```

The option will change only how many Columns are visible at once; it will not change configured Statuses or Issue files.

## Agent setup

mikan wires into AI coding agents two independent ways. Neither models agents or adds a runtime: mikan stays **stdio MCP only** — no HTTP server, port, auth, scheduler, or workflow engine.

- `mikan mcp add --agent <agent>` registers the stdio MCP server in the agent's MCP config. Agents: `pi`, `antigravity`, `jcode`, `claude-code`, `opencode`, `codex`.
- `mikan skills add --agent <agent>` installs a small mikan `SKILL.md` that teaches the agent to drive the board through the MCP tools. Agents: `claude-code`, `opencode`, `codex`. This is **separate** from MCP registration — installing skills never changes MCP config.

```sh
mikan mcp add --agent claude-code
mikan mcp add --agent opencode --no-global
mikan mcp add --agent codex             # global only
mikan skills add --agent claude-code
mikan mcp llms                          # incur-backed discovery manifest
```

`mikan mcp llms` prints incur's manifest for agents that read it directly; it does not install (use `mikan mcp add` for that). Passing `--agent` to `mikan mcp llms` is rejected and points to `mikan mcp add`.

## More information

See the repository README for full CLI examples, TUI keys, config format, design principles, and limitations:

https://github.com/takemo101/mikan
