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
  1. confirm the board opens as the main page with a title, bordered Status panes, Issue counts, compact Cards, and a footer keymap;
  2. use `h`/`l` or arrow keys to move between Columns and confirm the visible Column viewport slides as focus moves across more Statuses than fit at once;
  3. use `j`/`k` or arrow keys to move between Cards and confirm focus styling follows the selected Card;
  4. press Enter/Return to switch to the full-page Markdown detail page for the selected Issue;
  5. use `j`/`k` or arrow keys to scroll detail Markdown, then press Esc to return to the board with selection preserved;
  6. press `H`/`L` to move the selected Issue to the adjacent Status, or press `m`, choose any target Status, and press Enter;
  7. press `e`, toggle Labels with Space, and press Enter to save frontmatter Label changes;
  8. press `n`, type a short multi-line Note, use Enter for a newline, and press Ctrl+S to append it to `## Notes`;
  9. if warnings are present, press `w` to open warning details in a modal and Esc to close it;
  10. press `r` to reload from disk;
  11. press `q` to quit.
- `mikan watch` runs continuously in normal CLI use; tests exercise the same watcher logic with one scan at a time.
- The automated smoke test covers non-interactive CLI commands, MCP read/mutation tools, TUI data loading, and watch hook execution in a temporary `.mikan` project.
