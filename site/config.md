# Config

A mikan project is configured by `.mikan/config.yaml`. The config defines project identity, board Columns, labels, optional local hooks, and optional GitHub Mirror settings.

## Generated project layout

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
    watcher-snapshot.json
    hook-log.ndjson
  templates/
    issue.md
```

The source of truth is the Issue Markdown files under the Status directories. `.state/` is operational memory only.

## Example config

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
  - id: docs
    title: Documentation

hooks:
  on_enter:
    active:
      - "echo '{{issue_id}} entered {{to_status}}'"
  on_transition:
    ready->active:
      - "echo '{{issue_path}} moved from {{from_status}} to {{to_status}}'"

github:
  repo: owner/name
  auto_push_mirrors: false
```

## Project

`project.key` prefixes generated Issue IDs. A key of `MIK` produces IDs such as `MIK-001`.

`project.name` is display metadata for the local board.

## Columns and Statuses

Each configured Column has an `id` and `title`. The Column `id` is the Status directory name. Moving an Issue changes which directory contains its Markdown file.

Standard Statuses are:

- `backlog`
- `ready`
- `active`
- `blocked`
- `completed`
- `archived`

Archived Issues are hidden from normal board/list views by default.

## Labels

Labels are descriptive only. They do not assign agents, profiles, priority, or workflow behavior.

`id` is the stable value used in Issue frontmatter, CLI flags, and MCP payloads. `title` is the human-facing display name. The TUI detail page shows labels as `#title`, while compact card and command surfaces continue to use the stable id.

## Workspace Repositories

A project enters workspace mode when `.mikan/config.yaml` has a top-level `repositories` list. One parent `.mikan` board then coordinates several local repositories that live under the same workspace directory.

Workspace mode does not make mikan a multi-project scheduler or worker pool. Markdown Issues still live in the parent `.mikan`, Status is still the lifecycle axis, and Issue IDs are still one workspace-wide sequence such as `WKS-001`.

```yaml
project:
  key: WKS
  name: Product Workspace

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

repositories:
  - id: workspace
    title: Workspace
    path: .
    github:
      repo: org/workspace-triage
  - id: frontend
    title: Frontend
    path: ./frontend
    github:
      repo: org/frontend
  - id: backend
    title: Backend
    path: ./backend
    github:
      repo: org/backend

labels:
  - id: bug
    title: Bug
  - id: integration
    title: Integration
```

Repository rules:

- `repositories[].id` uses the same lowercase kebab-case shape as Status and Label IDs.
- `repositories[].title` is the human-facing display name.
- `repositories[].path` is required and is resolved relative to the mikan project root. Absolute paths are invalid so checked-in config stays portable.
- A missing repository path is a warning, not a config-load failure, so a partially cloned workspace can still use the board.
- `repositories[].github.repo` is required in workspace mode and must look like `owner/name`.
- Workspace-level or cross-cutting Issues use an explicit Repository such as `workspace`; repository-less Issues are not allowed in workspace mode.

In workspace mode, each Issue declares one primary `repository` in frontmatter and may list additional `affects` Repositories:

```yaml
repository: backend
affects:
  - frontend
```

`repository` is the Issue's primary Repository and determines the GitHub Mirror target for new Mirrors. `affects` is display/filter context only; it must not repeat the primary `repository`, and it never chooses a Mirror target. Labels also never decide Repository ownership or the Mirror target — they stay descriptive filtering/grouping tags. Moving an Issue between Repositories does not change its Issue ID.

See [CLI](./cli.md) for `--repository` / `--affects`, [TUI](./tui.md) for the `f` Repository filter, and [GitHub Mirror](./github-mirror.md) for per-Repository Mirror targets.

## Hooks

Hooks are optional local automation. `mikan watch` observes Status transitions and runs matching commands from `.mikan/config.yaml`.

There are two hook maps:

| Hook map | When it runs | Example key |
| --- | --- | --- |
| `hooks.on_enter` | When an Issue enters a Status from any other Status. | `active` |
| `hooks.on_transition` | When an Issue moves between one exact Status pair. | `ready->active` |

Example:

```yaml
hooks:
  on_enter:
    active:
      - "echo '{{issue_id}} entered {{to_status}}'"
      - "scripts/read-metadata.sh {{metadata.browser_required}}"
      - command: "scripts/start-agent.sh {{project_root}} {{issue_path}} {{issue_id}}"
        when:
          labels_include:
            - automation
  on_transition:
    ready->active:
      - "echo '{{issue_path}} moved from {{from_status}} to {{to_status}}'"
```

String entries are unconditional hook commands. Object entries use `command`; optional `when.labels_include` is an include-all Label filter, so every listed Label ID must be present on the Issue for that command to run. `labels_include` cannot be empty. If it references a Label ID that is not configured, `mikan watch` writes a warning to stderr and skips that hook command without adding a hook-log entry.

Run the watcher from a terminal:

```sh
mikan watch
```

Use quiet mode when you want to suppress watch log output:

```sh
mikan watch --quiet
```

Supported placeholders:

- <code v-pre>{{issue_id}}</code> — stable Issue ID, such as `MIK-001`.
- <code v-pre>{{issue_path}}</code> — path to the moved Issue Markdown file.
- <code v-pre>{{from_status}}</code> — previous Status directory.
- <code v-pre>{{to_status}}</code> — new Status directory.
- <code v-pre>{{project_root}}</code> — project root directory.
- <code v-pre>{{metadata.path}}</code> — Issue Metadata dot path, such as <code v-pre>{{metadata.browser_required}}</code> or <code v-pre>{{metadata.runner.kind}}</code>.

Hooks also receive `MIKAN_ISSUE_METADATA` as compact JSON in the process environment. Metadata template values are shell-escaped as single arguments. String, number, boolean, and null values become scalar arguments; arrays and objects become JSON strings. Missing metadata paths skip that hook command, write a warning to stderr, and do not add a hook-log entry. Metadata is not a hook filter; use `when.labels_include` for filtering.

A macOS notification hook can be written as:

```yaml
hooks:
  on_enter:
    completed:
      - "osascript -e 'display notification \"{{issue_id}}: {{from_status}} → {{to_status}}\" with title \"mikan\" subtitle \"Entered Completed\"'"
```

Hook failures are recorded in `.mikan/.state/hook-log.ndjson` and surfaced as warnings. They never roll back Issue status and never become authoritative state.

## GitHub Mirror

GitHub Mirror settings are optional:

```yaml
github:
  repo: owner/name
  auto_push_mirrors: false
```

`github.repo` is the GitHub repository used by `mikan github`, the TUI `g` action, MCP Mirror tools, and watch auto-push in single-project mode. `github.auto_push_mirrors` defaults to `false`; set it to `true` only when `mikan watch` should push changed Issues that already have `github_issue` frontmatter.

In workspace mode the per-Repository `repositories[].github.repo` chooses the Mirror target instead, so top-level `github.repo` is not used as a Mirror fallback. The top-level `github` object may then omit `repo` and configure only `auto_push_mirrors`.

See [GitHub Mirror](./github-mirror.md) for CLI, TUI, MCP, labels, and source-of-truth rules.

## Issue Metadata

Issue Metadata lives in Issue frontmatter, not in config:

```yaml
metadata:
  browser_required: true
  context_files:
    - packages/tui/src/index.ts
```

Metadata must be a JSON-compatible object. It is advisory context for humans, agents, scripts, and hooks; mikan does not interpret it as priority, assignment, scheduling, or workflow rules.

## Dependencies

Issue dependencies live in Issue frontmatter, not in config:

```yaml
depends_on:
  - MIK-001
```

Dependencies are advisory. Only `completed` satisfies a dependency; mikan warns for unmet dependencies but does not schedule, block, or move Issues automatically.
