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
  github    Create or push GitHub Mirrors
  tui       Open the read-only board
  watch     Run the polling watcher
  mcp       Start the stdio MCP server
  skills    Install agent-facing mikan usage guidance

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
		case "github":
			return `Create or push one-way GitHub Mirrors.

Usage:
  mikan github mirror <issue-id>
  mikan github push <issue-id>
  mikan github push --all

Options:
  --all                 With push: update every Issue that already has github_issue
  -h, --help            Show this help

Notes:
  Configure github.repo in .mikan/config.yaml first.
  GitHub Mirror uses the gh CLI; install gh and run gh auth login.
  mirror creates a GitHub Issue when github_issue is absent and updates it when present.
  push requires an existing github_issue; push --all never creates new GitHub Issues.
`;
		case "tui":
			return `Open the read-only board.

Usage:
  mikan tui [options]

Options:
  -c, --columns <auto|2|3|4|5> Preferred visible Column count (default: auto)
  -h, --help            Show this help

Examples:
  mikan tui
  mikan tui --columns auto
  mikan tui --columns 3
  mikan tui -c 5

Notes:
  --columns sets how many Status Columns the board shows at once. auto
  derives 2..5 Columns from terminal width and keeps the sliding viewport;
  a fixed 2..5 pins that count. It never changes configured Statuses.
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
			return `Start the stdio MCP server, register it with an agent, or print its manifest.

Usage:
  mikan mcp
  mikan mcp add --agent <agent> [--no-global]
  mikan mcp llms [--full]

Options:
  -a, --agent <agent>   Agent to configure: pi, antigravity, jcode, claude-code, opencode, codex
  --no-global           Write workspace-local config instead of global config
  --full                With llms: print the full incur manifest
  -h, --help            Show this help

Notes:
  codex registers in global ~/.codex/config.toml only; --no-global is rejected.
  Use mikan mcp add for native per-agent registration. Use mikan mcp llms for
  incur-backed discovery: it prints a manifest for agents that read incur
  manifests directly and never installs anything. Passing --agent to llms is
  rejected; install with mikan mcp add --agent <agent> instead.

Examples:
  mikan mcp add --agent pi
  mikan mcp add --agent antigravity --no-global
  mikan mcp add -a jcode
  mikan mcp add --agent claude-code
  mikan mcp add --agent opencode --no-global
  mikan mcp add --agent codex
  mikan mcp llms
  mikan mcp llms --full
`;
		case "skills":
			return `Install agent-facing mikan usage guidance.

mikan skills add installs lightweight instructions that teach an agent how to
use mikan. It is separate from mikan mcp add, which registers the MCP tools;
installing skills never changes MCP config.

Usage:
  mikan skills add --agent <agent> [--no-global]

Options:
  -a, --agent <agent>   Agent to install the mikan skill for: claude-code, opencode, codex
  --no-global           Install workspace-local guidance instead of global
  -h, --help            Show this help

Notes:
  codex installs the skill globally only; --no-global is rejected for codex.

Examples:
  mikan skills add --agent claude-code
  mikan skills add --agent opencode --no-global
  mikan skills add -a codex
`;
	}
}
