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
mikan mcp add --agent pi
mikan tui
mikan watch
```

Notes:

- `mikan mcp` starts the stdio MCP server exposing read and mutation tools.
- `mikan mcp add --agent <pi|antigravity|jcode>` registers the stdio server in supported agent MCP config files; add `--no-global` for workspace-local config.
- `mikan tui` starts the OpenTUI board. Manual TUI smoke path:
  1. confirm the board opens with a title, bordered Status panes, Issue counts, compact Cards, and a footer keymap;
  2. use arrow keys to move between Cards and Columns and confirm focus styling follows the selected Card;
  3. press Enter/Return to switch to split-pane detail mode with the grouped Issue list on the left and detail/log panes on the right;
  4. press Esc to return to the board;
  5. press `m`, choose a target Status, and press Enter to move the selected Issue;
  6. press `a`, type a short Note, and press Enter to append it to `## Notes`;
  7. press `q` to quit.
- `mikan watch` runs continuously in normal CLI use; tests exercise the same watcher logic with one scan at a time.
- The automated smoke test covers non-interactive CLI commands, MCP read/mutation tools, TUI data loading, and watch hook execution in a temporary `.mikan` project.
