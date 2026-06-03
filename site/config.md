# Config

A mikan project is configured by `.mikan/config.yaml`. The config defines project identity, board Columns, labels, and optional local hooks.

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

## Hooks

Hooks are optional local automation. `mikan watch` observes Status transitions and runs matching commands.

Supported placeholder examples:

- `{{issue_id}}`
- `{{issue_path}}`
- `{{from_status}}`
- `{{to_status}}`

Hook failures are recorded in `.mikan/.state/hook-log.ndjson` and surfaced as warnings. They never roll back Issue status and never become authoritative state.

## Dependencies

Issue dependencies live in Issue frontmatter, not in config:

```yaml
depends_on:
  - MIK-001
```

Dependencies are advisory. Only `completed` satisfies a dependency; mikan warns for unmet dependencies but does not schedule, block, or move Issues automatically.
