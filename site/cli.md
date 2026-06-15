# CLI

mikan's CLI is intentionally small. Commands are primitive operations over local Issue Markdown files.

## Commands

| Command | Purpose |
| --- | --- |
| `mikan init` | Create `.mikan/` config, Status directories, state directory, and template. |
| `mikan add <title>` | Create a new Issue, optionally with labels, dependencies, and metadata. |
| `mikan list` | Print Issues grouped by Status. |
| `mikan show <id>` | Print one Issue Markdown file, including frontmatter metadata. |
| `mikan update <id>` | Update title, labels, body, dependencies, or metadata. |
| `mikan move <id> <status>` | Move an Issue to another Status and optionally append a Status Log entry. |
| `mikan append <id>` | Append Markdown to a section such as `Notes` or `Reports`. |
| `mikan github` | Create or update one-way GitHub Mirrors. |
| `mikan tui` | Open the keyboard-first board. |
| `mikan watch` | Run polling hooks for local automation. |
| `mikan mcp` | Start the stdio MCP server, register it, or print its discovery manifest. |
| `mikan skills add` | Install agent-facing mikan guidance for a supported agent. |

## Common examples

```sh
mikan add "Prototype dispatcher" --label automation --status backlog
mikan add "Browser QA" --metadata '{"browser_required":true}'
mikan update MIK-001 --title "Prototype local dispatcher"
mikan update MIK-001 --depends-on MIK-000
mikan move MIK-001 ready --log "Ready to implement"
mikan append MIK-001 --section Notes --body "Keep the prototype local-first."
mikan append MIK-001 --section Reports --source docs-scout --body "Found relevant examples."
```

## Issue Metadata

Issue Metadata is optional advisory context in Issue frontmatter:

```yaml
metadata:
  browser_required: true
  context_files:
    - packages/tui/src/index.ts
```

Use `--metadata <json-object>` on `add` or `update`:

```sh
mikan add "Browser QA" --metadata '{"browser_required":true,"context_files":["packages/tui/src/index.ts"]}'
mikan update MIK-001 --metadata '{"agent_hint":"docs"}'
mikan update MIK-001 --metadata '{}'
```

Metadata must be a JSON-compatible object. `update --metadata` replaces the whole metadata object; omitting `--metadata` preserves existing metadata; `{}` clears it. `mikan show` prints the frontmatter metadata, while `mikan list` stays concise.

Metadata is advisory context only. It is not priority, assignment, scheduling input, or a transition gate.

## GitHub Mirror

GitHub Mirror publishes local Markdown Issues outward to GitHub Issues without making GitHub authoritative.

```sh
mikan github mirror MIK-001
```

Configure `github.repo` first and run `gh auth login`. See [GitHub Mirror](./github-mirror.md) for source-of-truth, label, watch, TUI, and MCP details.

## Archived Issues

Archived Issues are hidden by default:

```sh
mikan list --include-archived
```

Archiving removes an Issue from normal board/list views while keeping the Markdown file available for explicit reference.

## Dependencies

Structured dependencies are advisory read-model data:

```sh
mikan add "Implement UI" --depends-on MIK-001
mikan update MIK-002 --depends-on MIK-001 --depends-on MIK-003
```

A dependency is satisfied only when the prerequisite Issue is in `completed`. Missing, archived, cyclic, self, and incomplete dependencies appear as warnings; mikan does not auto-schedule or block moves.

## Help

Every command supports command-specific help:

```sh
mikan help
mikan help add
mikan tui --help
mikan mcp --help
```
