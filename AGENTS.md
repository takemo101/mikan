# AGENTS.md

Guidance for AI coding agents working on mikan.

## Entry points

Use this file as the agent workflow entry point. For design details, follow the durable docs:

1. [`docs/README.md`](docs/README.md) — documentation map.
2. [`docs/design.md`](docs/design.md) — current v0 design source of truth.
3. [`CONTEXT.md`](CONTEXT.md) — canonical domain language.
4. [`docs/adr/0001-markdown-files-source-of-truth.md`](docs/adr/0001-markdown-files-source-of-truth.md) — core storage decision.

Before changing behavior, public surfaces, architecture, or terminology, read the relevant linked docs first.

Design details intentionally live in `docs/` plus `CONTEXT.md`. Do not duplicate design rules in this file.

`HANDOFF.md` is intentionally removed; do not recreate it as a design source.

## Scope guard

mikan is intentionally small. If a change starts adding workflow-engine, scheduler, swarm-runtime, GitHub-sync, SQLite/database, agent-profile, or team/delegation concepts, stop and check [`docs/design.md`](docs/design.md) before proceeding.

## Development workflow

Develop in Issue-sized slices.

1. Pick exactly one implementation Issue.
2. Confirm the Issue's scope and acceptance criteria before editing.
3. Re-read the relevant sections of [`docs/design.md`](docs/design.md) and [`CONTEXT.md`](CONTEXT.md).
4. Implement only that Issue's slice; avoid opportunistic unrelated refactors.
5. Add or update tests for that Issue.
6. Run the relevant checks.
7. When the Issue implementation is complete, request or perform a review before starting the next Issue.
8. Address review feedback in the same Issue slice.
9. Mark the Issue complete only after implementation, tests, and review are done.
10. After all planned Issues are complete and reviewed, create/finalize the PR and merge it according to the project's GitButler flow.

## GitButler / but workflow

Use the `but` GitButler workflow for all version-control work.

- Use `but status -fv` before version-control mutations.
- Use `but` instead of git write commands.
- Do not run `git add`, `git commit`, `git push`, `git checkout`, `git merge`, `git rebase`, or `git stash`.
- Add `--status-after` to `but` mutation commands.
- Use IDs reported by `but status -fv`, `but diff`, or `but show`; do not hardcode IDs.
- Create branches, commits, pushes, PR finalization, and merge steps through the GitButler flow.

## Checks

After code changes, run the relevant project checks. Once the workspace exists, the expected baseline is:

```sh
bun run typecheck
bun run test
bun run check
```

If a package-specific command is more appropriate for a small Issue slice, use that first, then run the broader checks before PR finalization.

## Documentation rules

Keep design-related material in durable docs, not in `AGENTS.md`.

- Update [`docs/design.md`](docs/design.md) when current design, architecture, public surfaces, implementation order, or testing strategy changes.
- Update [`CONTEXT.md`](CONTEXT.md) when domain vocabulary changes.
- Add ADRs under [`docs/adr/`](docs/adr/) only for decisions that are hard to reverse, surprising without context, and trade-off driven.

`AGENTS.md` should stay focused on agent workflow and pointers to canonical docs.
