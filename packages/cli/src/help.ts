import { type CommandName, isCommandName } from "./args.ts";
import { type CliResult, fail, ok } from "./cli-output.ts";

export function commandHelp(topic: string): CliResult {
	if (!isCommandName(topic)) {
		return fail(
			`Unknown help topic: ${topic}\n\nRun \`mikan help\` to see available commands.`,
		);
	}
	return ok(commandHelpText(topic));
}

export function helpText(): string {
	return `mikan — local-first Issue board for AI-assisted development

Usage:
  mikan <command> [options]

Commands:
  init      Create .mikan project files
  add       Create an Issue
  list      List Issues by Status
  show      Print an Issue Markdown file
  update    Update Issue title, labels, or body
  move      Move an Issue to another Status
  append    Append Markdown to an Issue section
  tui       Open the read-only board
  watch     Run the polling watcher
  mcp       Start the stdio MCP server

Run \`mikan help <command>\` for command-specific options.
`;
}

function commandHelpText(command: CommandName): string {
	switch (command) {
		case "init":
			return `Create .mikan project files.

Usage:
  mikan init [options]

Options:
  -k, --key <key>       Project key for Issue IDs (default: MIK)
  -n, --name <name>     Project display name (default: current directory)
  -h, --help            Show this help
`;
		case "add":
			return `Create an Issue.

Usage:
  mikan add <title> [options]

Options:
  -s, --status <status> Add to Status (default: backlog)
  -l, --label <label>   Add label; repeat for multiple labels
  --depends-on <issue-id> Add dependency; repeat for multiple dependencies
  -h, --help            Show this help

Examples:
  mikan add "Wire MCP tools" -s ready -l automation
`;
		case "list":
			return `List Issues by Status.

Usage:
  mikan list [options]

Options:
  -s, --status <status> Filter by Status
  -a, --include-archived Include archived Issues
  -h, --help            Show this help
`;
		case "show":
			return `Print an Issue Markdown file.

Usage:
  mikan show <issue-id>

Options:
  -h, --help            Show this help
`;
		case "update":
			return `Update Issue title, labels, or body.

Usage:
  mikan update <issue-id> [options]

Options:
  -t, --title <title>   Replace title
  -l, --label <label>   Replace labels; repeat for multiple labels
  --depends-on <issue-id> Replace dependencies; repeat for multiple dependencies
  -b, --body <body>     Replace body Markdown
  -h, --help            Show this help
`;
		case "move":
			return `Move an Issue to another Status.

Usage:
  mikan move <issue-id> <status> [options]

Options:
  -l, --log <text>      Append a Status Log entry
  -h, --help            Show this help
`;
		case "append":
			return `Append Markdown to an Issue section.

Usage:
  mikan append <issue-id> -S <section> -b <body> [options]

Options:
  -S, --section <name>  Section to append to (for example: Reports, Notes)
  -b, --body <body>     Markdown to append
  -s, --source <source> Source name for timestamped entries
  -h, --help            Show this help
`;
		case "tui":
			return `Open the read-only board.

Usage:
  mikan tui

Options:
  -h, --help            Show this help
`;
		case "watch":
			return `Run the polling watcher.

Usage:
  mikan watch [options]

Options:
  -q, --quiet           Suppress watch log output
  -h, --help            Show this help
`;
		case "mcp":
			return `Start the stdio MCP server or register it with an agent.

Usage:
  mikan mcp
  mikan mcp add --agent <agent> [--no-global]

Options:
  -a, --agent <agent>   Agent to configure: pi, antigravity, jcode, claude-code
  --no-global           Write workspace-local config instead of global config
  -h, --help            Show this help

Examples:
  mikan mcp add --agent pi
  mikan mcp add --agent antigravity --no-global
  mikan mcp add -a jcode
  mikan mcp add --agent claude-code
`;
	}
}
