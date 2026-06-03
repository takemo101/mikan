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
  on_transition:
    ready->active:
      - "echo '{{issue_path}} moved from {{from_status}} to {{to_status}}'"
```

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

`github.repo` is the GitHub repository used by `mikan github`, the TUI `g` action, MCP Mirror tools, and watch auto-push. `github.auto_push_mirrors` defaults to `false`; set it to `true` only when `mikan watch` should push changed Issues that already have `github_issue` frontmatter.

See [GitHub Mirror](./github-mirror.md) for CLI, TUI, MCP, labels, and source-of-truth rules.

## Dependencies

Issue dependencies live in Issue frontmatter, not in config:

```yaml
depends_on:
  - MIK-001
```

Dependencies are advisory. Only `completed` satisfies a dependency; mikan warns for unmet dependencies but does not schedule, block, or move Issues automatically.
