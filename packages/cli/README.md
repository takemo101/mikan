# @takemo101/mikan

mikan is a tiny local-first Issue board for AI-assisted development. It stores Issues as Markdown files under `.mikan/` and exposes the same board through a CLI, keyboard-first TUI, local Browser board, stdio MCP server, and polling watcher.

Manual: <https://takemo101.github.io/mikan/>

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
- **Primitive CLI commands**: `init`, `add`, `list`, `show`, `update`, `move`, `append`, `github`, `tui`, `browser`, `watch`, `mcp`, `skills`.
- **Keyboard TUI**: board-first flow with detail view, Label/Note/Warning modals, Move shortcuts, and Archive confirmation.
- **Local Browser board**: `mikan browser` starts a foreground local server bound to `127.0.0.1`, prints the URL, and opens the browser (use `--no-open` to skip, `--port <port>` to pin a port).
- **MCP server**: stdio tools for agents: `get_board`, `list_issues`, `get_issue`, `create_issue`, `update_issue`, `move_issue`, `append_issue`, `mirror_issue_to_github`.
- **GitHub Mirror**: explicit one-way publication from local Markdown Issues to GitHub Issues.
- **Agent setup**: register the MCP server or install agent guidance for common AI agents.
- **Watch hooks**: optional local automation on Status entry/transition.

## Quickstart

```sh
mikan init
mikan add "Prototype dispatcher" --status ready --label automation
mikan add "Browser QA" --metadata '{"browser_required":true}'
mikan list
mikan show MIK-001
mikan tui
```

## Issue Metadata

Issue Metadata is optional advisory context stored under frontmatter `metadata`. Use it for machine-readable hints such as browser requirements, context files, or local automation inputs.

```sh
mikan add "Browser QA" --metadata '{"browser_required":true,"context_files":["packages/tui/src/index.ts"]}'
mikan update MIK-001 --metadata '{}'
```

Metadata must be a JSON-compatible object. Omitting `--metadata` preserves existing metadata; passing `{}` clears it. MCP read tools include metadata, MCP `create_issue` and `update_issue` accept it, hooks receive `MIKAN_ISSUE_METADATA`, and TUI Detail displays metadata without adding it to dense Board Cards.

## Workspace Repositories

A project enters workspace mode when `.mikan/config.yaml` has a top-level `repositories` list, letting one parent `.mikan` board coordinate several local repositories. Issues stay in the parent `.mikan`, IDs stay one workspace-wide sequence, and mikan does not become a multi-project scheduler or worker pool.

```sh
mikan add "Fix login contract" --repository backend --affects frontend --label bug
```

Each Issue declares one required primary `repository`; `affects` lists other Repositories it touches and is display/filter context only. The TUI `f` modal filters by primary `repository`. New GitHub Mirrors resolve from the Issue's `repository` to that Repository's `repositories[].github.repo`; Labels and `affects` never choose the Mirror target. MCP `create_issue` / `update_issue` accept `repository` and `affects`, and read tools include them. See the manual: <https://takemo101.github.io/mikan/config>.

## TUI columns

`mikan tui --columns <auto|2|3|4|5>` (default `auto`) controls how many Status Columns the board shows at once. `auto` derives between 2 and 5 visible Columns from terminal width and keeps the sliding viewport. Fixed values pin an explicit count:

```sh
mikan tui --columns auto
mikan tui --columns 2
mikan tui --columns 3
mikan tui --columns 4
mikan tui --columns 5
```

The option changes only how many Columns are visible at once; it never changes configured Statuses or Issue files.

## Browser

`mikan browser` opens a local Web board over the same `.mikan/` Markdown files.

```sh
mikan browser              # auto-select a port and open the browser
mikan browser --port 4321  # pin a local port
mikan browser --no-open    # print the URL without launching a browser
```

`mikan browser` runs as a foreground process bound to `127.0.0.1`, opens your browser by default, prints the local URL, and exits on Ctrl-C. The board renders Status Columns and Cards, a workspace Repository filter with a `Primary | +Affected` scope toggle (`includeAffected=1` in the URL), a Focused Markdown Modal on Card click, append forms for Reports and Notes, and drag-and-drop Status moves. The detail modal's action bar adds **Edit labels** (frontmatter-only Label edits), a confirmed **Archive** (writing `Archived via mikan browser`), and a confirmed one-way **Create/Update GitHub Mirror**.

Markdown remains the source of truth, and the Browser is local-only: it is not a shared dashboard, mandatory daemon, scheduler, database, GitHub sync surface, or agent runtime. Full board behavior, raw HTML handling, and deferred surfaces are documented at <https://takemo101.github.io/mikan/browser>.

## GitHub Mirror

GitHub Mirror is one-way publication from local Markdown Issues to GitHub Issues. Configure `github.repo`, run `gh auth login`, then use `mikan github mirror`, the TUI `g` action, or the MCP Mirror tool. The full manual is at <https://takemo101.github.io/mikan/github-mirror>.

## Agent setup

mikan wires into AI coding agents two independent ways. Neither models agents or adds a runtime: mikan stays **stdio MCP only** — no HTTP server, port, auth, scheduler, or workflow engine.

- `mikan mcp add --agent <agent>` registers the stdio MCP server in the agent's MCP config. Agents: `pi`, `antigravity`, `jcode`, `claude-code`, `opencode`, `codex`, `copilot-vscode`, `copilot-cli`.
- `mikan skills add --agent <agent>` installs a compact mikan `SKILL.md` using each agent's native Agent Skills convention. Agents: `pi`, `antigravity`, `jcode`, `claude-code`, `opencode`, `codex`, `copilot-vscode`, `copilot-cli`. This is **separate** from MCP registration — installing skills never changes MCP config. The installed guidance teaches a board-first operating loop, MCP-first operation, CLI fallback, and single-project versus workspace Repository rules.

```sh
mikan mcp add --agent claude-code
mikan mcp add --agent opencode --no-global
mikan mcp add --agent codex             # global only
mikan mcp add --agent copilot-vscode --no-global # VS Code workspace only
mikan mcp add --agent copilot-cli       # global only
mikan skills add --agent pi
mikan skills add --agent antigravity --no-global
mikan skills add --agent claude-code
mikan skills add --agent copilot-cli
mikan mcp llms                          # incur-backed discovery manifest
```

`mikan mcp llms` prints incur's manifest for agents that read it directly; it does not install (use `mikan mcp add` for that). Passing `--agent` to `mikan mcp llms` is rejected and points to `mikan mcp add`.

## More information

See the repository README for full CLI examples, TUI keys, config format, design principles, and limitations:

<https://github.com/takemo101/mikan>
