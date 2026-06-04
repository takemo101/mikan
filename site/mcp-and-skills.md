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
```

Some agents support workspace-local config:

```sh
mikan mcp add --agent claude-code --no-global
mikan mcp add --agent opencode --no-global
```

Codex registration is global-only and rejects `--no-global` with a clear error.

## MCP tools

Agents can use explicit tools for primitive board operations:

| Tool | Purpose |
| --- | --- |
| `get_board` | Read grouped board snapshot and warnings. |
| `list_issues` | List Issues, optionally including archived. |
| `get_issue` | Read one Issue Markdown file and metadata. |
| `create_issue` | Create an Issue, optionally with labels, Status, body, and dependencies. |
| `update_issue` | Update title, labels, body, or dependencies. |
| `move_issue` | Move an Issue to another Status and optionally append a Status Log entry. |
| `append_issue` | Append Markdown to `Notes`, `Reports`, or another section. |
| `mirror_issue_to_github` | Explicit external-publication operation: create the GitHub Issue mirror when missing or update it when it already exists. |

GitHub Mirror is a one-way publication helper. Markdown remains the source of truth; agents should not import GitHub Issues or treat GitHub as authoritative. See [GitHub Mirror](./github-mirror.md) for setup, label behavior, and watch auto-push.

## Install agent skills

```sh
mikan skills add --agent claude-code
mikan skills add --agent opencode
mikan skills add --agent codex
```

Claude Code and opencode support global and workspace-local skills. Codex skills are global-only and reject `--no-global`.

The installed skill teaches the agent the mikan vocabulary, MCP tools, advisory dependency model, one-way GitHub Mirror rules, and local-first scope.

## Discovery manifest

```sh
mikan mcp llms
mikan mcp llms --full
```

`mikan mcp llms` prints incur-backed discovery metadata for agents that read manifests directly. It does not install anything. Passing `--agent` to `mikan mcp llms` is rejected and points to `mikan mcp add --agent <agent>`.

## Scope reminder

mikan does not model agents, profiles, roles, sessions, teams, or delegation. Agent support is limited to thin installer adapters and written skill guidance around the same local Issue files.
