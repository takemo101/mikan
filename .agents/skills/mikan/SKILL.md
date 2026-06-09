---
name: mikan
description: Use mikan as a local-first Markdown Issue board through MCP tools, with CLI fallback when MCP is unavailable. Use when the user wants to inspect the mikan board, create/update/move Issues, append Reports or Notes, publish GitHub Mirrors, or decide what to work on next in a mikan project.
---

# mikan

## Quick start

Prefer the mikan MCP tools. They preserve mikan's Markdown source-of-truth rules and return structured results.

1. Read first:
   - `get_board` for grouped Columns and warnings.
   - `list_issues` for filtered Issue lists.
   - `get_issue` for one Issue and its Markdown.
2. Mutate through MCP tools:
   - `create_issue` to add an Issue.
   - `update_issue` to replace title, Labels, Dependencies, or body.
   - `move_issue` to change Status.
   - `append_issue` to add a Report or Note.
   - `mirror_issue_to_github` to explicitly create or update a GitHub Mirror.
3. If MCP is unavailable, use the `mikan` CLI from the project root.

## MCP-first workflow

Use mikan vocabulary: Issue, Issue ID, Status, Column, Label, Report, Note, Dependency, GitHub Mirror. Avoid Task, ticket, profile, role, or agent runtime framing.

Common MCP calls:

- Board overview: `get_board({ include_archived: false })`
- Ready Issues: `list_issues({ status: "ready" })`
- Read one Issue: `get_issue({ id: "MIK-123" })`
- Create Issue: `create_issue({ title, body, status, labels, depends_on })`
- Update metadata/body: `update_issue({ id, title, labels, body, depends_on })`
- Move Status: `move_issue({ id, status, log })`
- Append Report: `append_issue({ id, section: "Reports", source, body })`
- Append Note: `append_issue({ id, section: "Notes", body })`
- Publish mirror: `mirror_issue_to_github({ id })`

Dependencies are advisory read-model data. Use `depends_on`, `unmet_dependencies`, and `dependency_status` to explain ordering, but do not treat them as a scheduler or transition blocker.

GitHub Mirror is one-way publication. Local mikan Markdown remains authoritative. Do not import GitHub Issues or treat GitHub as source of truth.

## CLI fallback

When mikan MCP tools are unavailable, run CLI commands from the repository root:

```sh
mikan list
mikan list --status ready
mikan show MIK-123
mikan add "Issue title" --status backlog --label automation
mikan update MIK-123 --title "New title"
mikan update MIK-123 --label automation --depends-on MIK-122
mikan move MIK-123 active --log "Starting implementation"
mikan append MIK-123 --section Reports --source agent --body "Finding text"
mikan append MIK-123 --section Notes --body "Note text"
mikan github mirror MIK-123
```

CLI fallback rules:

- Prefer CLI commands over editing `.mikan/**/*.md` directly.
- Run `mikan show <id>` before changing an existing Issue.
- Use repeated `--label` and `--depends-on` flags for multiple values.
- Keep Status values aligned with the project's configured Columns.
- If a CLI command fails, report the error exactly and do not hand-edit around it unless the user explicitly asks.
