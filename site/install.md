# Install

mikan ships as the scoped npm package `@takemo101/mikan`.

## Requirements

- **[Bun](https://bun.sh)** available at runtime. The published binary is a bundled Bun entrypoint.
- A terminal for the CLI and TUI.
- Optional: an MCP-capable AI coding agent if you want agent integration.

## From npm

```sh
npm install -g @takemo101/mikan
mikan --help
```

One-off use without a global install:

```sh
npx @takemo101/mikan init
# or
bunx @takemo101/mikan init
```

## Verify

```sh
mikan --help
mikan init --help
mikan tui --help
mikan mcp --help
```

To test in a scratch project:

```sh
mkdir /tmp/mikan-demo
cd /tmp/mikan-demo
mikan init
mikan add "First Issue" --status ready
mikan list
```

## Upgrade

```sh
npm install -g @takemo101/mikan@latest
```

If you registered mikan with an MCP client, restart that client after upgrading so it picks up the current tool definitions.

## Uninstall

```sh
npm uninstall -g @takemo101/mikan
```

mikan stores project data inside each repo's `.mikan/` directory. Removing the npm package does not delete project Issue files.

## Next

- [Quickstart](/quickstart) — create your first board.
- [CLI](/cli) — command reference.
- [MCP & Skills](/mcp-and-skills) — connect coding agents.
