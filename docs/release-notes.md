# Release notes

Release notes for the published `@takemo101/mikan` CLI package. Versions are the
`packages/cli/package.json` version users install from npm.

## 0.0.19 — TUI scroll and idle refresh stability

Improves long-running `mikan tui` stability after the Status Column scrollbox
release, keeping native scrolling usable without unnecessary idle rerenders.

- **Status Column scrollboxes**: Status Issue lists now render inside native
  OpenTUI scrollboxes, keep the selected Card visible, and avoid resetting scroll
  position during model-only auto-refreshes.
- **Cursor-first wheel scrolling**: vertical wheel/trackpad scrolling moves the
  selected Card up or down and lets the scrollbox follow it; unreliable
  horizontal slide gestures are ignored.
- **Card layout containment**: long Issue titles and Labels are clipped,
  no-wrapped, and truncated so scrolling cannot wrap Card text into extra rows or
  break Column layout.
- **Idle refresh memory reduction**: the TUI auto-refresh loop skips React/OpenTUI
  state updates when the board, selection, and Issue-file freshness fingerprint
  are unchanged, while still rerendering for body-only Markdown edits.

## 0.0.18 — Browser warning modal

Keeps Browser board warnings visible without letting long warning text shrink the
Kanban board. Warning details now live in a dedicated modal near the existing
header controls.

- **Header warning entry point**: moves the warning button next to the
  Light/Dark theme toggle so it stays discoverable without overlapping Cards or
  consuming board toolbar space.
- **Grouped warning modal**: opens warning details in a scroll-contained modal
  grouped by Issue ID when structured details are available, with board/config
  warnings collected separately.
- **Board space preservation**: removes the expanding inline warning details
  from the board flow so long dependency, Label, or config warnings no longer
  reduce the visible Kanban area.

## 0.0.17 — Browser UI polish

Polishes the local `mikan browser` experience after the detail action release,
making the board easier to use with large Issue sets and adding theme control.

- **Browser developer command**: adds `just browser-dev -- ...` / `bun run browser:dev` to build the packaged CLI dist and launch `mikan browser` from the same bundled path users install.
- **Viewport-height Status columns**: Status Columns now stretch to the bottom of the viewport while each Column's Card list scrolls independently, so a long `Completed` lane no longer stretches every other lane or the page itself.
- **Light/Dark theme toggle**: adds a persisted icon button for switching between light and dark Browser themes.
- **Detail modal scroll containment**: the detail modal overlay no longer scrolls outside the modal; only the modal body scrolls with overscroll containment.
- **Nested confirmation polish**: Archive and GitHub Mirror confirmations use managed modal layering and keep Escape scoped to the topmost confirmation.

## 0.0.16 — Browser detail actions

Extends `mikan browser` with the next action slices, exposing a few existing mikan
mutations from the Issue detail modal while keeping the Browser a small local UI
adapter. Markdown remains the source of truth and the Browser stays local-only.

- **Include-affected Repository filter**: the workspace Repository filter gains a
  segmented `Primary | +Affected` scope control. `Primary` stays the default and
  matches only the primary `repository`; `+Affected` also includes Issues whose
  `affects` contains the selected Repository. The expanded scope is stored in the
  URL as `includeAffected=1`. `affects` never chooses the GitHub Mirror target.
- **Browser Label editing**: the detail action bar's `Edit labels` popover edits
  config-defined Labels, preserves config-unknown existing Labels, and writes
  frontmatter only — no Status Log, Note, or GitHub Mirror side effects.
- **Browser Archive**: the detail action bar's `Archive` action confirms, then
  moves the Issue to `archived` through the existing core move behavior and writes
  the Status Log entry `Archived via mikan browser`. It adds no unarchive or
  show-archived Browser views.
- **Browser GitHub Mirror**: the detail action bar's `Create/Update GitHub Mirror`
  action confirms the target Repository, then runs a synchronous one-way Mirror
  create/update through the existing GitHub Mirror behavior. Single-project targets
  use `github.repo`; workspace targets use the Issue's `repository` and
  `repositories[].github.repo`. Labels and `affects` never choose the target.

## 0.0.15 — mikan browser

Adds `mikan browser`, a local-first Browser UI for the board that complements the
existing TUI. The command serves a bundled web app from the published CLI and
opens it in your default browser.

- **`mikan browser` command**: starts a local server bound to `127.0.0.1`,
  serves the bundled Browser UI, and opens it automatically. Supports `--port`
  to pick a port and `--no-open` to start the server without launching a browser.
- **Board display**: the Browser UI renders the configured Status columns with
  their Issues, including the workspace Repository filter, mirroring the board
  read model used by the TUI.
- **Markdown Issue detail modal**: selecting an Issue opens a modal that renders
  its Markdown body, Reports, and Notes.
- **Append Reports and Notes**: the detail modal can append Reports (with a
  source) and Notes to an Issue, persisted back to the Markdown files.
- **Drag-and-drop Status move**: Issues can be dragged between Status columns to
  move them, updating the underlying Issue file.

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
