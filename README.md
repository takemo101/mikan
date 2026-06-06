# mikan

mikan is a tiny local-first Issue board for AI-assisted development. It gives humans and coding agents one shared, project-local place to track work without introducing a server, database, scheduler, or workflow engine.

mikan stores every Issue as Markdown under `.mikan/`. The CLI, TUI, MCP server, and watcher all operate on those same files.

## Why use mikan?

AI-assisted development often needs more context than a TODO list, but less process than a project-management suite. mikan is meant for that middle ground:

- keep implementation context next to the project;
- let humans inspect and update work quickly from a terminal board;
- let agents create, move, and append context through safe primitive operations;
- keep the source of truth easy to read, diff, commit, and edit by hand.

mikan is intentionally small. It is not a GitHub Issues clone, agent runtime, team scheduler, or hosted service.

## Install

```sh
npm install -g @takemo101/mikan
```

One-off use:

```sh
npx @takemo101/mikan init
# or
bunx @takemo101/mikan init
```

mikan is currently built for Bun-based execution. The published package installs a `mikan` binary backed by a bundled Bun entrypoint.

## Quickstart

```sh
mikan init
mikan add "Polish the release README" --status ready --label automation
mikan list
mikan show MIK-001
mikan tui
```

After `mikan init`, your project gets a `.mikan/` directory:

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

Each Issue is a Markdown file named by Issue ID, for example `.mikan/ready/MIK-001.md`.

## How it works

mikan's model is file-backed:

- **Issue**: one unit of work or discussion.
- **Issue ID**: stable project-key sequence such as `MIK-001`.
- **Status**: the containing directory (`backlog`, `ready`, `active`, `blocked`, `completed`, `archived`).
- **Column**: how a Status appears in the TUI board.
- **Label**: configured descriptive tag.
- **Report**: append-only finding from a named source, often an agent or script.
- **Note**: lightweight human/agent context.

A typical Issue file looks like this:

```md
---
id: MIK-001
title: Prototype dispatcher
labels:
  - automation
created_at: 2026-05-30T00:00:00Z
updated_at: 2026-05-30T00:00:00Z
---

# Prototype dispatcher

## Summary

Build a small local prototype.

## Acceptance Criteria

- Reads local Issue Markdown.
- Appends a Report with findings.

## Status Log

## Reports

## Notes
```

Moving an Issue changes its directory. Updating or appending context rewrites the Markdown file safely using a project-local write lock.

## CLI

The CLI exposes small primitive operations:

| Command | Purpose |
| --- | --- |
| `mikan init` | Create `.mikan/` config, Status directories, state directory, and template. |
| `mikan add <title>` | Create a new Issue. |
| `mikan list` | Print Issues grouped by Status. |
| `mikan show <id>` | Print one Issue Markdown file. |
| `mikan update <id>` | Update title, labels, or body. |
| `mikan move <id> <status>` | Move an Issue to another Status and optionally append a Status Log entry. |
| `mikan append <id>` | Append Markdown to a section such as `Notes` or `Reports`. |
| `mikan github` | Create or update one-way GitHub Mirrors. |
| `mikan tui` | Open the keyboard-first board. |
| `mikan watch` | Run polling hooks for local automation. |
| `mikan mcp` | Start the stdio MCP server, register it (`mcp add`), or print its manifest (`mcp llms`). |
| `mikan skills add` | Install agent-facing mikan usage guidance for a supported agent. |

Examples:

```sh
mikan add "Prototype dispatcher" --label automation --status backlog
mikan update MIK-001 --title "Prototype local dispatcher" --label automation --label herdr
mikan move MIK-001 ready --log "Ready to implement"
mikan append MIK-001 --section Notes --body "Keep the prototype local-first."
mikan append MIK-001 --section Reports --source docs-scout --body "Found relevant API examples."
```

Archived Issues are hidden by default:

```sh
mikan list --include-archived
```

## TUI

`mikan tui` opens a flow-style keyboard board over the same Markdown files.

Key bindings:

- `h` / `l` or arrow keys: move across Status Columns
- `j` / `k` or arrow keys: move through Cards or scroll detail
- `H` / `L`: move the selected Issue to an adjacent Status
- `Enter`: open full-page Markdown detail
- `n`: append a Note in a modal prompt
- `e`: edit Labels in a modal prompt
- `a`: confirm Archive in a modal prompt
- `g`: create or update a one-way GitHub Mirror
- `w`: show warning details in a modal
- `r`: reload from disk
- `Esc`: back/cancel
- `q`: quit

The board page is primary. Detail mode renders the Issue body as Markdown with a fixed header. Move, Note, Label, Archive, GitHub Mirror, and warning-details interactions use focused modal overlays.

TUI Column option:

```sh
mikan tui --columns auto   # derive 2..5 visible Columns from terminal width (default)
mikan tui --columns 2      # request a narrow two-Column viewport
mikan tui --columns 5      # request up to five Status Columns
```

`mikan tui --columns <auto|2|3|4|5>` (default `auto`) controls how many Status Columns the board shows at once. `auto` derives 2..5 visible Columns from terminal width and keeps the sliding viewport that follows your selection; a fixed `2`–`5` pins that count. The option is scoped to the visible TUI viewport only and never changes configured Statuses or the Markdown board. Invalid values are rejected with a pointer to `mikan help tui`.

## GitHub Mirror

GitHub Mirror publishes local mikan Issues outward to GitHub Issues for external visibility while keeping Markdown authoritative. Configure `github.repo`, run `gh auth login`, then use `mikan github mirror`, the TUI `g` action, or the MCP Mirror tool.

Full setup, watch auto-push, label behavior, and source-of-truth rules are documented in the manual: <https://takemo101.github.io/mikan/github-mirror>

## MCP server

`mikan mcp` starts a stdio MCP server so coding agents can operate on the board without parsing files themselves.

Available tools:

- `get_board(include_archived?)`
- `list_issues(status?, include_archived?)`
- `get_issue(id)`
- `create_issue(title, body?, status?, labels?, depends_on?)`
- `update_issue(id, title?, labels?, body?, depends_on?)`
- `move_issue(id, status, log?)`
- `append_issue(id, section, body, source?)`
- `mirror_issue_to_github(id)` — explicit one-way publication to create the GitHub Issue mirror when missing or update it when it already exists.

GitHub Mirror keeps Markdown authoritative. It publishes outward to GitHub Issues; it does not import GitHub state.

The MCP surface intentionally mirrors CLI primitives. mikan stays **stdio MCP only**: there is no HTTP server, port, auth, scheduler, workflow engine, or delegation runtime.

## Agent setup

mikan wires into AI coding agents through two separate, optional surfaces. Neither models agents or turns mikan into an agent runtime.

### Register the MCP server with `mikan mcp add`

`mikan mcp add` registers the stdio `mikan mcp` server in a target agent's MCP config so the agent can call the mikan tools. It writes only that agent's config file; it never starts an HTTP server or changes mikan's behavior.

```sh
mikan mcp add --agent <agent> [--no-global]
```

Supported agents: `pi`, `antigravity`, `jcode`, `claude-code`, `opencode`, `codex`.

```sh
mikan mcp add --agent claude-code             # ~/.claude.json   (--no-global -> ./.mcp.json)
mikan mcp add --agent opencode                # ~/.config/opencode/opencode.json (--no-global -> ./opencode.json)
mikan mcp add --agent codex                   # ~/.codex/config.toml (global only; --no-global is rejected)
```

### Install agent guidance with `mikan skills add`

`mikan skills add` is **separate** from MCP registration. It installs a small mikan skill — a `SKILL.md` instructions file — that teaches an agent what mikan is and to drive the board through the MCP tools. Installing skills never changes MCP config, and registering MCP never installs skills.

```sh
mikan skills add --agent <agent> [--no-global]
```

Supported skill agents: `claude-code`, `opencode`, `codex`.

```sh
mikan skills add --agent claude-code          # ~/.claude/skills/mikan/SKILL.md (--no-global -> ./.claude/skills/...)
mikan skills add --agent opencode --no-global # ./.opencode/skills/mikan/SKILL.md
mikan skills add --agent codex                # ~/.codex/skills/mikan/SKILL.md (global only; --no-global is rejected)
```

### incur-backed discovery

mikan's MCP server is built with [`incur`](https://www.npmjs.com/package/incur), which can emit a token-efficient command manifest. For agents that read incur manifests directly — no config file needed:

```sh
mikan mcp llms          # print the incur manifest for the mikan MCP tools
mikan mcp llms --full   # print the fuller per-argument manifest
```

Discovery is read-only: it never registers a server, so it cannot install for a specific agent. `mikan mcp llms --agent <agent>` fails and points you to `mikan mcp add --agent <agent>`.

Use `mikan mcp add` / `mikan skills add` for native per-agent registration; use `mikan mcp llms` for incur-backed discovery.

## Watch hooks

`mikan watch` polls the board and runs configured hooks for local automation. Hooks are configured in `.mikan/config.yaml`:

```yaml
hooks:
  on_enter:
    active:
      - "bun scripts/on-active.ts {{issue_path}}"
      - command: "bun scripts/start-automation.ts {{issue_path}}"
        when:
          labels_include:
            - automation
  on_transition:
    ready->active:
      - "bun scripts/spawn-agent.ts {{issue_path}}"
```

String entries are unconditional hook commands. Object entries use `command`; optional `when.labels_include` is an include-all Label filter, so every listed Label ID must be present on the Issue for that command to run. `labels_include` cannot be empty; config-unknown Label IDs warn to stderr and skip that hook command without writing a hook-log entry.

Hook failures are written to `.mikan/.state/hook-log.ndjson`. They do not roll back Issue moves because Markdown files remain the source of truth.

Use quiet mode to suppress routine watch output:

```sh
mikan watch --quiet
```

## Configuration

`.mikan/config.yaml` defines the project key, board columns, labels, and hooks.

```yaml
project:
  key: MIK
  name: mikan

board:
  columns:
    - id: backlog
      title: Backlog
    - id: ready
      title: Ready
    - id: active
      title: Active
    - id: blocked
      title: Blocked
    - id: completed
      title: Completed
    - id: archived
      title: Archived

labels:
  - id: automation
    title: Automation
  - id: herdr
    title: Herdr
```

Issue IDs are generated from the project key and a sequence number. `MIK-001` is the display convention, but higher sequences such as `MIK-1000` are supported.

## Package and release notes

The npm package is scoped as `@takemo101/mikan` and installs the `mikan` binary.

The published package is dist-only:

- `dist/bin.js` contains the bundled CLI/TUI/MCP/watch implementation;
- `package.json` declares runtime metadata and native OpenTUI optional dependencies;
- `README.md` is included for npm package documentation.

Releases are published from `.github/workflows/publish.yml` using npm Trusted Publishing and provenance on `v*` tags or manual workflow dispatch.

## Limitations

mikan v0.0.3 is intentionally small:

- no SQLite/database storage;
- no GitHub-as-source-of-truth behavior;
- no user accounts or hosted service;
- no full Markdown body editing in the TUI;
- no drag/drop board interactions;
- no modeled agent profiles, teams, workflow engine, or scheduler.

## Development

```sh
bun install
bun run typecheck
bun run test
bun run check
bun run build
```

Durable design docs:

- [`docs/design.md`](docs/design.md)
- [`CONTEXT.md`](CONTEXT.md)
- [`docs/adr/0001-markdown-files-source-of-truth.md`](docs/adr/0001-markdown-files-source-of-truth.md)
- [`docs/smoke.md`](docs/smoke.md)
