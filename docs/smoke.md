# Smoke flow

This flow verifies the MVP as a local-first Issue board.

```sh
mikan init
mikan add "First Issue" --status backlog --label automation
mikan list
mikan show MIK-001
mikan update MIK-001 --title "Updated Issue"
mikan move MIK-001 ready --log "Ready for implementation"
mikan append MIK-001 --section Reports --source docs-scout --body "Reviewed docs."
mikan append MIK-001 --section Notes --body "Free-form note."
mikan mcp
mikan tui
mikan watch
```

Notes:

- `mikan mcp` starts the stdio MCP server exposing read and mutation tools.
- `mikan tui` starts the read-only OpenTUI board; use arrow keys to navigate and Enter/Return to open details.
- `mikan watch` runs continuously in normal CLI use; tests exercise the same watcher logic with one scan at a time.
- The automated smoke test covers non-interactive CLI commands, MCP read/mutation tools, TUI data loading, and watch hook execution in a temporary `.mikan` project.
