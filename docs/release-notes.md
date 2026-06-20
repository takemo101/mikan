# Release notes

Release notes for the published `@takemo101/mikan` CLI package. Versions are the
`packages/cli/package.json` version users install from npm.

## 0.0.14 — Simplified mikan Skill guidance

Refines the agent-facing `mikan` Skill installed by `mikan skills add` so it is
compact operating guidance rather than a mini manual.

- **Default mikan operating loop**: agents are guided to read the board or target
  Issue first, check warnings and unmet dependencies, use the board's configured
  Status columns, append Reports as evidence, and complete Issues only after
  acceptance criteria and validation pass.
- **MCP-first usage**: the Skill keeps MCP tools as the preferred interface,
  uses CLI examples only as fallback, and keeps direct `.mikan/**/*.md` edits as
  a last resort.
- **Workspace Repository rules preserved**: the Skill keeps the primary
  `repository` / `affects` rules and GitHub Mirror target invariants concise and
  explicit.

## 0.0.13 — Workspace Repositories

Adds workspace Repository support so one parent `.mikan` board can coordinate
several local repositories while keeping Issues, IDs, and storage in the parent.

- **Workspace Repository mode**: a project enters workspace mode when
  `.mikan/config.yaml` declares a top-level `repositories` list. Each Issue
  carries one required primary `repository` plus optional `affects` Repositories
  for display/filter context. IDs stay one workspace-wide sequence, and missing
  configured Repository paths surface as board warnings rather than config-load
  failures.
- **TUI Repository filter**: the board `f` modal filters Issues by their primary
  `repository`.
- **Per-Repository GitHub Mirror target resolution**: new GitHub Mirrors resolve
  the target repo from the Issue's `repository` to that Repository's
  `repositories[].github.repo`. Labels and `affects` never choose the Mirror
  target.
