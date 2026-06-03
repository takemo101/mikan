# mikan Manual Site Design

## Goal

Add a small VitePress manual site for mikan, modeled after cuekit's `site/`, so users can read install, quickstart, CLI, TUI, MCP/skills, and config guidance as a navigable static site.

## Scope

Build the first minimal site, not a full documentation rewrite. The site should reuse and reorganize content already present in `README.md`, `packages/cli/README.md`, `docs/design.md`, and `CONTEXT.md`.

Initial pages:

- `site/index.md` — home page with product positioning and feature cards.
- `site/install.md` — npm install, one-off use, Bun-based execution note, verification.
- `site/quickstart.md` — `init`, `add`, `list`, `show`, and `tui` flow.
- `site/cli.md` — command reference for primitive CLI operations.
- `site/tui.md` — keyboard board, detail view, modal interactions, and `--columns`.
- `site/mcp-and-skills.md` — stdio MCP registration, skills installation, supported agents, incur manifest.
- `site/config.md` — `.mikan/config.yaml`, columns, labels, hooks, and generated directories.

## Non-goals

- Do not add a hosted deployment workflow yet.
- Do not move durable design docs out of `docs/`.
- Do not add a docs-generation system from source code comments.
- Do not change CLI, TUI, MCP, config, or Markdown behavior.

## Architecture

Use VitePress, matching cuekit's manual-site pattern. Add `site/.vitepress/config.ts`, Markdown pages under `site/`, and root package scripts:

- `docs:dev`: `vitepress dev site`
- `docs:build`: `vitepress build site`
- `docs:preview`: `vitepress preview site`

The site is documentation-only. It has no runtime coupling to mikan packages and does not become source of truth for product design. Durable design remains in `docs/design.md`; domain vocabulary remains in `CONTEXT.md`.

## Navigation

Top navigation:

- Quickstart
- Install
- CLI
- TUI
- MCP & Skills
- GitHub

Sidebar groups:

- Getting Started: Quickstart, Install
- Usage: CLI, TUI, Config
- Agent Integration: MCP & Skills

## Testing and validation

- `bun run docs:build` must succeed.
- Existing project checks should remain green: `bun run typecheck`, `bun run test`, `bun run check`.
- A lightweight test should assert the workspace exposes docs scripts and the main manual-site files exist, so accidental removal is caught.

## Future work

Later Issues may add GitHub Pages deployment, screenshots, more examples, or split CLI/MCP references into deeper pages. Those are intentionally out of scope for this first slice.
