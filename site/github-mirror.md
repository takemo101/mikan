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

- `github.repo` is required before creating or pushing a Mirror.
- `github.auto_push_mirrors` defaults to `false`. Set it to `true` only when you want `mikan watch` to push changes for Issues that already have `github_issue` frontmatter.

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

Push an Issue that already has `github_issue`:

```sh
mikan github push MIK-001
```

Push every local Issue that already has `github_issue`:

```sh
mikan github push --all
```

`push` and `push --all` never create new GitHub Issues. Use `mirror` for the first publication.

## TUI action

In `mikan tui`, press `g` on the selected Issue in either Board or Detail mode.

- If the Issue already has `github_issue`, mikan pushes it immediately and shows `GitHub mirror pushed #123` in the footer.
- If the Issue has no `github_issue`, mikan opens a confirmation modal showing the Issue ID, title, target repo, and a source-of-truth note. Press `Enter` to create the Mirror or `Esc` to cancel.
- If `github.repo` is unset, mikan shows a footer message instead of opening a config UI.

Detail mode shows mirrored Issues as `GitHub #123` in the metadata line. Dense Board Cards intentionally do not show GitHub Mirror state.

## MCP tools

Agents can publish Mirrors through explicit MCP tools:

- `mirror_issue_to_github` — create or update the GitHub Issue Mirror for one local Issue.
- `push_github_mirror` — push one already-mirrored Issue; it does not create a new GitHub Issue.

These tools are external-publication operations. Agents should still read and mutate the local mikan Issue as the source of truth.

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
