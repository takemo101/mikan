# Release notes

Release notes for the published `@takemo101/mikan` CLI package. Versions are the
`packages/cli/package.json` version users install from npm.

## 0.0.13 — Workspace Repositories

Adds workspace Repository support so one parent `.mikan` board can coordinate
several local repositories while keeping Issues, IDs, and storage in the parent.

- **Workspace Repository mode**: a project enters workspace mode when
  `.mikan/config.yaml` declares a top-level `repositories` list. Each Issue
  carries one required primary `repository` plus optional `affects` Repositories
  for display/filter context. IDs stay one workspace-wide sequence.
- **TUI Repository filter**: the board `f` modal filters Issues by their primary
  `repository`.
- **Per-Repository GitHub Mirror target resolution**: new GitHub Mirrors resolve
  the target repo from the Issue's `repository` to that Repository's
  `repositories[].github.repo`. Labels and `affects` never choose the Mirror
  target.
