# mikan Design

mikan is a tiny, local-first micro-kanban for AI-assisted development. It gives agents and humans a shared Issue board without becoming a workflow engine, scheduler, project-management suite, or agent runtime.

## Goals

- Use plain Markdown files as the source of truth.
- Let agents update Issues through safe CLI/MCP operations.
- Let humans observe the board through a read-only TUI.
- Keep the public command surface small and primitive.
- Support optional status-transition hooks without making hooks authoritative.
- Stay lightweight: no SQLite, no server, no GitHub sync, no agent/profile model in v0.

## Non-goals

mikan v0 is not:

- a workflow engine;
- a swarm scheduler;
- a distributed worker pool;
- a replacement for herdr/tmux/zellij;
- a GitHub Issues clone;
- a mandatory daemon;
- a database-backed state machine.

## Core principle

Markdown files are the source of truth.

```txt
.mikan/
  config.yaml
  backlog/
    MIK-001.md
  ready/
    MIK-002.md
  active/
    MIK-003.md
  blocked/
    MIK-004.md
  completed/
    MIK-005.md
  archived/
    MIK-006.md
  .state/
    watcher-snapshot.json
    hook-log.ndjson
  templates/
    issue.md
```

- Directory = current Status.
- Markdown file = Issue body, context, Status Log, Reports, Notes.
- Config file = project identity, columns, label definitions, hooks.
- `.state/` = operational memory only, never source of truth.

See also: [`docs/adr/0001-markdown-files-source-of-truth.md`](./adr/0001-markdown-files-source-of-truth.md).

## Domain language

Canonical terms are defined in [`CONTEXT.md`](../CONTEXT.md). The most important ones are:

- **Issue**: the unit of work or discussion.
- **Issue ID**: stable project-key sequence such as `MIK-001`.
- **Status**: lifecycle position: `backlog`, `ready`, `active`, `blocked`, `completed`, `archived`.
- **Column**: board lane for a Status.
- **Label**: configured descriptive tag, not workflow behavior.
- **Report**: append-only finding from a named source.
- **Note**: lightweight free-form context.
- **Card**: TUI representation of an Issue.

Avoid `Task`, `ticket`, `profile`, `role`, and `spawned` as mikan domain terms.

## Design principles

mikan borrows a lightweight subset of ideas from `j5ik2o/okite-ai`:

1. **Domain model first**
   - Implement and test Issue, Issue ID, Status, Column, Label, Report, Note, and Board Snapshot before adapters.

2. **Parse, don't validate**
   - Parse YAML, frontmatter, Markdown, CLI args, and MCP JSON at boundaries.
   - Internal code should use typed, normalized objects.

3. **Always-valid lightweight primitives**
   - Wrap values with real invariants or high mix-up risk: `IssueId`, `StatusId`, `LabelId`, UTC timestamp, project key.
   - Do not wrap plain display text or free Markdown body.

4. **Explicit error classification**
   - User-fixable Errors: unknown label, duplicate Issue ID, malformed frontmatter, unknown Status.
   - Defects: impossible internal state after successful parsing.
   - Operational hook failures: record in `hook-log.ndjson`; never roll back Issue status.

5. **Clean architecture without ceremony**
   - `core` must not depend on CLI, MCP, TUI, OpenTUI, or UI concerns.
   - Adapters call core operations.
   - Avoid DDD/CQRS/repository ceremony that does not serve this file-backed model.

6. **Backward compatibility at public surfaces**
   - CLI commands, MCP tools, config schema, and Markdown conventions become public API once released.
   - Keep them small to keep compatibility cheap.

## Technology stack

Use a lightweight version of cuekit's engineering substrate:

- Bun workspace.
- TypeScript ESM.
- strict `tsconfig` with `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `verbatimModuleSyntax`.
- `bun test`.
- Biome.
- `zod` for schemas.
- `yaml` for config.
- `incur` for stdio MCP schemas/operations.
- OpenTUI React: `@opentui/core`, `@opentui/react`, React 19.

Do not copy cuekit's heavier product model:

- SQLite store;
- agent profiles;
- adapters;
- teams;
- task/session lifecycle runtime;
- scheduler/delegation orchestration.

## Package structure

```txt
packages/core            # Issue model, scanners, Markdown/frontmatter operations
packages/project-config  # .mikan/config.yaml discovery, schema, init
packages/cli             # mikan binary and primitive commands
packages/mcp             # stdio mikan mcp server over core operations
packages/tui             # OpenTUI read-only board/detail UI
```

Dependency direction:

```txt
cli ─┐
mcp ─┼──> core <── project-config
tui ─┘
```

`core` owns domain operations and file mutation rules. CLI/MCP/TUI are adapters.

## Config design

`.mikan/config.yaml` requires `project.key`, `project.name`, and `board.columns`.

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

hooks:
  on_enter:
    active:
      - "zx scripts/on-active.mjs {{issue_path}}"
  on_transition:
    ready->active:
      - "zx scripts/spawn-agent.mjs {{issue_path}}"
```

Labels are configured with only `id` and `title` in v0. Label definitions are edited directly in config; v0 has no label-management commands.

## Issue Markdown format

Filename convention:

```txt
<ISSUE_ID>.md
```

Example:

```md
---
id: MIK-001
title: Prototype herdr dispatcher
labels:
  - automation
  - herdr
created_at: 2026-05-30T00:00:00Z
updated_at: 2026-05-30T00:00:00Z
---

# Prototype herdr dispatcher

## Summary

Build a small zx script that proposes herdr child-agent spawns from mikan Issues.

## Context

The parent agent remains the decision maker.

## Acceptance Criteria

- Reads Issue Markdown files from `.mikan/ready/`.
- Renders a proposal from the Issue Markdown.
- Sends the proposal to the parent herdr pane.
- Records report text back into this Issue file.

## Status Log

- 2026-05-30T00:00:00Z

Moved from backlog to ready

Ready for implementation.

## Reports

### 2026-05-30T17:00:00Z docs-scout

Found that polling is sufficient for local Markdown files.

## Notes

- Keep implementation small.
```

Required frontmatter:

- `id`
- `title`
- `created_at`
- `updated_at`

Optional frontmatter:

- `labels` — array of config-defined label IDs.

Do not add these fields in v0:

- `status`
- `priority`
- `profile`
- assignee
- milestone
- project

Status comes from the containing directory.

Standard body sections are conventional, not required:

- `Summary`
- `Context`
- `Acceptance Criteria`
- `Status Log`
- `Reports`
- `Notes`

CLI/MCP append operations create missing append-target sections when needed.

## Status model

Default Statuses:

- `backlog`: known, but not necessarily ready.
- `ready`: can be started immediately.
- `active`: currently being worked by a human, parent agent, child agent, or script.
- `blocked`: cannot progress until input, decision, or dependency is resolved.
- `completed`: acceptance criteria are met.
- `archived`: retained for reference and hidden from normal list/TUI views unless explicitly included.

v0 has no transition validation. Any configured Status can move to any other configured Status.

`Blocked by:` entries in Status Log are free text, not a dependency graph. mikan does not automatically unblock Issues.

## Issue IDs

Issue IDs are generated from config `project.key` and a sequence number.

- Example: `MIK-001`.
- New IDs are generated by scanning all configured status directories, including `archived`, finding the highest existing sequence, and adding one.
- `id` in frontmatter is the identity source.
- Filename is exactly `<Issue ID>.md` for discoverability.
- Duplicate Issue IDs are warnings in list/TUI and hard errors for mutating CLI/MCP operations.

## CLI surface

v0 CLI mirrors a small primitive operation set:

```sh
mikan init
mikan list [--status ready] [--include-archived]
mikan show MIK-001
mikan add "Prototype herdr dispatcher" --label automation --label herdr --status backlog
mikan update MIK-001 --title "Prototype dispatcher" --label automation --label herdr
mikan move MIK-001 ready --log "Ready to implement"
mikan append MIK-001 --section Reports --source docs-scout --body "..."
mikan append MIK-001 --section Notes --body "..."
mikan tui
mikan watch
mikan mcp
```

Do not add separate `block`, `complete`, `report`, `note`, or `labels set` commands in v0. They are expressed through `move`, `update`, and `append`.

## MCP surface

v0 MCP is stdio-only via `mikan mcp`. Do not add HTTP server, port management, or auth.

Initial tools:

```txt
get_board(include_archived?)
list_issues(status?, include_archived?)
get_issue(id)
create_issue(title, body?, status?, labels?)
update_issue(id, title?, labels?, body?)
move_issue(id, status, log?)
append_issue(id, section, body, source?)
```

Notes:

- `move_issue` is the only status-changing MCP tool.
- Blocking and completing are ordinary moves to `blocked` or `completed`.
- `update_issue` handles title, labels, and body replacement.
- `append_issue` appends Markdown to `Status Log`, `Reports`, `Notes`, or another named section.
- `source` is meaningful for Reports and remains a free string.

`get_board` returns a grouped board snapshot for TUI/agent overview. It is a read model, not separate state.

## TUI design

`mikan tui` uses OpenTUI for a keyboard-first Kanban board over the same Markdown source of truth. The UI should be pane-based, closer to `opencode-kanban` than to a plain text dump: a title/header, bordered board panes, a split-pane detail mode, focused prompts, and a persistent footer keymap.

Must support:

- discover project by walking upward for `.mikan/config.yaml`;
- display configured columns, excluding `archived` by default, as Status panes with Issue counts;
- show Cards from corresponding directories with compact Issue ID, title, labels, and focused Card styling;
- highlight the selected Card/Column and keep empty Columns visible with a muted empty state;
- select a Card and press Enter/Return to switch into split-pane detail mode;
- in detail mode, keep a grouped Issue list on the left and details/log panes on the right;
- press Esc to return from detail, move, or note-entry modes;
- show Summary, Status Log, Reports, Notes, blocked reason, completion details, and any herdr-related Markdown section if present;
- periodically rescan files while preserving the selected Issue by Issue ID when possible;
- move the selected Issue to another configured Status through the same core mutation used by CLI/MCP;
- append a short Note to the selected Issue through the same append mutation used by CLI/MCP;
- show concise success/error feedback for TUI actions;
- use a small internal semantic theme for canvas, surface, text, muted text, focus, accent, warning, error, and success states.

Must not support initially:

- full Markdown body editing;
- drag/drop transitions;
- user accounts;
- remote sync;
- GitHub sync.

## Watch and hooks

`mikan watch` is a polling watcher. Start with periodic rescan, not native file watchers.

Behavior:

- Scan `.mikan/<configured-status>/*.md` every 1–3 seconds.
- Compare Issue ID → status/path snapshot.
- Fire configured hooks only for observed status changes.
- Never fire hooks for body edits.
- Never roll back Issue status when hook commands fail.
- Do not retroactively infer or repair moves that happened while watch was not running.
- If watch observes a direct file move without a matching `Moved from <from> to <to>` or watcher placeholder Status Log entry, append a placeholder once.
- Do not process transitions while the mikan write lock is held.
- In long-running watch mode, log startup and events only; do not emit repeated no-op polling summaries such as `watch observed N issue(s), 0 transition(s)`.

Hook template variables in v0:

- `{{project_root}}`
- `{{issue_path}}`
- `{{issue_id}}`
- `{{from_status}}`
- `{{to_status}}`

Operational files:

```txt
.mikan/.state/watcher-snapshot.json
.mikan/.state/hook-log.ndjson
```

Hook log entries should include timestamp, Issue ID, from Status, to Status, command, exit code, and captured error summary when available.

## Writes and concurrency

All mikan-managed mutations use:

- shared single-writer lock under `.mikan/.state/`;
- temp-file-and-rename writes;
- UTC ISO 8601 timestamps ending in `Z`.

`updated_at` changes only when mikan writes through CLI, MCP, or watch. Direct manual edits are allowed to leave `updated_at` stale.

## Warnings and invalid states

List/TUI should warn on:

- duplicate Issue IDs;
- unknown labels from manual edits;
- Markdown files under config-unknown directories;
- malformed frontmatter;
- missing required frontmatter;
- hook failures from hook log.

Mutating CLI/MCP operations should reject:

- duplicate Issue IDs;
- unknown Status;
- unknown labels;
- malformed or missing required frontmatter for the target Issue.

## Agent and herdr boundary

mikan does not model Agents, agent profiles, teams, retries, scheduling, or success judgement.

External agents or dispatchers may read an Issue and decide what role/prompt to use. mikan only stores Issues and append-only Reports/Notes.

herdr integration is optional and external:

- hooks may call zx/herdr scripts;
- Reports may record child-agent output;
- TUI may display herdr-related Markdown sections;
- mikan core remains scheduler-free.

## GitHub sync

Do not implement GitHub sync in v0.

Possible later commands:

```sh
mikan import github https://github.com/owner/repo/issues/123
mikan export github MIK-001
```

Do not implement bidirectional sync until there is a clear need.

## MVP implementation order

1. `mikan init`
   - create `.mikan/config.yaml`, status directories, templates, `.state/`.
2. Core scanner/read model
   - parse config, scan Issues, return board snapshot and warnings.
3. `mikan add/list/show`
   - create and read Issues.
4. `mikan update/move/append`
   - mutate frontmatter/body/status with lock + atomic writes.
5. `mikan mcp`
   - expose the primitive MCP tools over the same core operations.
6. `mikan tui`
   - read-only board and detail pane.
7. `mikan watch`
   - polling hooks and direct-move placeholder Status Logs.

## Testing strategy

Start with core tests before adapters:

- parse valid/invalid config;
- parse valid/invalid Issue frontmatter;
- generate Issue IDs by scanning existing Issues;
- detect duplicate IDs;
- reject unknown labels and statuses;
- append Status Log/Reports/Notes with missing-section creation;
- move Issue files with atomic writes;
- ensure archived is hidden by default;
- build board snapshot with warnings;
- classify hook failures without rollback.

Then add adapter tests:

- CLI command parsing and output snapshots;
- MCP tool schema/input/output tests;
- TUI data transformation tests;
- watch snapshot transition tests.

## Open follow-ups

- Exact lock-file timeout and stale-lock recovery policy.
- Exact Markdown parser/frontmatter library choice.
- Whether `get_board` remains separate from `list_issues` after first implementation spike.
- Whether TUI should support a toggle for archived Issues in v0 or only via list/MCP flags.
