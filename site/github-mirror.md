# GitHub Mirror

GitHub Mirror publishes a local mikan Issue to a GitHub Issue for external visibility. It is one-way: the Markdown Issue under `.mikan/` remains the source of truth, and GitHub state is never authoritative.

Use a Mirror when you want collaborators to see or discuss an Issue on GitHub while continuing to plan and edit the Issue locally in mikan.

## Prerequisites

mikan uses the GitHub CLI. Install `gh`, authenticate once, and make sure the authenticated account can create and update Issues in the target repository:

```sh
gh auth login
```

Configure the target repository in `.mikan/config.yaml`:

```yaml
github:
  repo: owner/name
  auto_push_mirrors: false
```

- `github.repo` is required before publishing a Mirror in single-project mode.
- `github.auto_push_mirrors` defaults to `false`. Set it to `true` only when you want `mikan watch` to push changes for Issues that already have `github_issue` frontmatter.

## Single-project versus workspace targets

How mikan resolves the target GitHub repository depends on the mode:

- **Single-project mode** uses the top-level `github.repo`. Every Mirror is created in that one repository.
- **Workspace mode** (config has a top-level `repositories` list) uses each Repository's own `repositories[].github.repo`. A new Mirror resolves from the Issue's required primary `repository` to that Repository's configured GitHub repo. Top-level `github.repo` is not used as a Mirror fallback in workspace mode.

```yaml
repositories:
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
```

An Issue with `repository: backend` mirrors to `org/backend`. Labels and `affects` never choose the Mirror target — only the primary `repository` does.

Once an Issue has `github_issue`, mikan keeps updating that existing Mirror repo even if the Issue's `repository` later changes; it does not recreate or move the GitHub Issue across repositories. If `github_issue.repo` no longer matches the GitHub repo configured for the Issue's current `repository`, mikan surfaces a warning. There is no `mikan github mirror --repo owner/name` override; fix `repository` or config before creating a new Mirror.

## What gets stored locally

After the first Mirror is created, mikan stores the GitHub Issue reference in the local Issue frontmatter:

```yaml
github_issue:
  repo: owner/name
  number: 123
  url: https://github.com/owner/name/issues/123
  last_mirrored_at: 2026-06-03T00:00:00Z
```

This frontmatter is correspondence metadata only. The local Markdown Issue remains authoritative.

## CLI commands

Create or update one Mirror explicitly:

```sh
mikan github mirror MIK-001
```

If the Issue has no `github_issue`, `mirror` creates the GitHub Issue and stores the reference locally. If the Issue already has `github_issue`, `mirror` updates that GitHub Issue from the local Markdown source.

## TUI action

In `mikan tui`, press `g` on the selected Issue in either Board or Detail mode.

- If the Issue already has `github_issue`, mikan updates it immediately and shows `GitHub mirror pushed #123` in the footer.
- If the Issue has no `github_issue`, mikan opens a confirmation modal showing the Issue ID, title, target repo, and a source-of-truth note. Press `Enter` to create the Mirror or `Esc` to cancel.
- If `github.repo` is unset, mikan shows a footer message instead of opening a config UI.

Detail mode shows mirrored Issues as `GitHub #123` in the metadata line. Dense Board Cards intentionally do not show GitHub Mirror state.

## MCP tools

Agents can publish Mirrors through one explicit MCP tool:

- `mirror_issue_to_github` — create the GitHub Issue Mirror when missing or update it when it already exists.

This tool is an external-publication operation. Agents should still read and mutate the local mikan Issue as the source of truth.

## Watch auto-push

`mikan watch` can push changed mirrored Issues automatically. This is opt-in:

```yaml
github:
  repo: owner/name
  auto_push_mirrors: true
```

Or for a single watcher invocation:

```sh
mikan watch --github-push
```

Auto-push only considers Issues that already have `github_issue` frontmatter. It responds to body/frontmatter edits and Status path moves. Unmirrored Issues are never published by the watcher.

In `--quiet` mode, successful pushes stay quiet; failures are still printed to stderr and recorded in `.mikan/.state/hook-log.ndjson`.

## Labels

When publishing, mikan mirrors configured Labels to GitHub labels by Label `id`. If a GitHub label is missing, mikan tries to create it with:

- name: the mikan Label `id`;
- color: `f59e0b`;
- description: `Mirrored from mikan label "Title" (id)`.

If label creation fails, mikan records a warning, skips that label, and continues creating or updating the GitHub Issue.

mikan only manages labels whose names match current mikan config Label IDs. Other GitHub labels are preserved.

## Source-of-truth rules

GitHub open/closed state is independent from mikan Status. Updating a mikan Issue overwrites the GitHub title/body/managed labels from the local Markdown source.

Do not import GitHub Issues into mikan and do not treat GitHub edits as authoritative. If GitHub discussion changes the plan, copy the decision back into the local mikan Issue as a Note, Report, or Markdown edit.
