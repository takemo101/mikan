# MCP & Skills

mikan integrates with AI coding agents in two independent ways:

1. **MCP registration** — gives an agent tools to read and update the local Issue board.
2. **Skill installation** — gives an agent written guidance for using mikan well.

These are separate. Installing a skill never edits MCP config, and registering MCP never writes skill files.

## Stdio MCP server

Start the server directly:

```sh
mikan mcp
```

mikan remains stdio-only: no HTTP server, port, auth layer, scheduler, or workflow engine.

## Register with an agent

```sh
mikan mcp add --agent pi
mikan mcp add --agent antigravity
mikan mcp add --agent jcode
mikan mcp add --agent claude-code
mikan mcp add --agent opencode
mikan mcp add --agent codex
mikan mcp add --agent copilot-cli
```

Some agents support workspace-local config:

```sh
mikan mcp add --agent claude-code --no-global
mikan mcp add --agent opencode --no-global
mikan mcp add --agent copilot-vscode --no-global
```

Codex and GitHub Copilot CLI registration are global-only and reject `--no-global` with a clear error. VS Code / GitHub Copilot Chat registration is workspace-only for now and writes `.vscode/mcp.json`; global user-profile registration is rejected until the exact VS Code profile path is verified.

## MCP tools

Agents can use explicit tools for primitive board operations:

| Tool | Purpose |
| --- | --- |
| `get_board` | Read grouped board snapshot, warnings, dependencies, and metadata. |
| `list_issues` | List Issues, optionally including archived, with metadata in the structured response. |
| `get_issue` | Read one Issue Markdown file and metadata. |
| `create_issue` | Create an Issue, optionally with labels, Status, body, dependencies, metadata, and (in workspace mode) `repository` / `affects`. |
| `update_issue` | Update title, labels, body, dependencies, metadata, or (in workspace mode) `repository` / `affects`. |
| `move_issue` | Move an Issue to another Status and optionally append a Status Log entry. |
| `append_issue` | Append Markdown to `Notes`, `Reports`, or another section. |
| `mirror_issue_to_github` | Explicit external-publication operation: create the GitHub Issue mirror when missing or update it when it already exists. |

`create_issue` and `update_issue` accept `metadata` as a JSON-compatible object. Omitting metadata preserves the current value on updates; passing `{}` clears it. Metadata is advisory context only, so agents should not treat it as priority, assignment, scheduling, or a transition rule.

In workspace mode (config has a top-level `repositories` list), `create_issue` and `update_issue` also accept `repository` (the required primary Repository) and `affects` (an array of other Repositories the Issue touches). `get_board`, `list_issues`, and `get_issue` include `repository` and `affects` in their structured responses. `repository` decides the GitHub Mirror target for new Mirrors; `affects` and Labels are display/filter context and never choose the Mirror target. mikan stays file-backed here — Repositories are configured local repos, not a scheduler, worker pool, or multi-project orchestration runtime.

GitHub Mirror is a one-way publication helper. Markdown remains the source of truth; agents should not import GitHub Issues or treat GitHub as authoritative. See [GitHub Mirror](./github-mirror.md) for setup, label behavior, and watch auto-push.

## Install agent skills

```sh
mikan skills add --agent pi
mikan skills add --agent antigravity --no-global
mikan skills add --agent jcode
mikan skills add --agent claude-code
mikan skills add --agent opencode
mikan skills add --agent codex
mikan skills add --agent copilot-vscode --no-global
mikan skills add --agent copilot-cli
```

Supported skill targets match the MCP target registry: `pi`, `antigravity`, `jcode`, `claude-code`, `opencode`, `codex`, `copilot-vscode`, and `copilot-cli`. Each target receives a `SKILL.md` directory using that agent's native Agent Skills location. Codex is global-only. Antigravity's global install targets `~/.gemini/antigravity-cli/skills/`; its shared location `~/.gemini/skills/` is documented but not exposed as a separate mikan scope.

The installed guidance teaches the agent the mikan vocabulary, MCP tools, advisory dependency model, one-way GitHub Mirror rules, and local-first scope.

## Discovery manifest

```sh
mikan mcp llms
mikan mcp llms --full
```

`mikan mcp llms` prints incur-backed discovery metadata for agents that read manifests directly. It does not install anything. Passing `--agent` to `mikan mcp llms` is rejected and points to `mikan mcp add --agent <agent>`.

## Scope reminder

mikan does not model agents, profiles, roles, sessions, teams, or delegation. Agent support is limited to thin installer adapters and written skill guidance around the same local Issue files.
