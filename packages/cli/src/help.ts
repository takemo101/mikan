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

Options:
  -v, --version Print mikan version
  -h, --help    Show this help

Commands:
  init      Create .mikan project files
  add       Create an Issue
  list      List Issues by Status
  show      Print an Issue Markdown file
  update    Update Issue title, labels, or body
  move      Move an Issue to another Status
  append    Append Markdown to an Issue section
  github    Create or update GitHub Mirrors
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
  -r, --repository <repository-id> Set primary Repository (required in workspace mode)
  --affects <repository-id> Add affected Repository; repeat for multiple
  --metadata <json>     Set Issue Metadata from a JSON object
  -h, --help            Show this help

Examples:
  mikan add "Wire MCP tools" -s ready -l automation
  mikan add "Browser QA" --metadata '{"browser_required":true}'
  mikan add "Cross-cut change" -r backend --affects frontend --affects infra
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
  -r, --repository <repository-id> Replace primary Repository (workspace mode)
  --affects <repository-id> Replace affected Repositories; repeat for multiple
  --metadata <json>     Replace Issue Metadata with a JSON object; use {} to clear
  -b, --body <body>     Replace body Markdown
  -h, --help            Show this help

Notes:
  Omitting --repository or --affects preserves existing values.
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
			return `Create or update one-way GitHub Mirrors.

Usage:
  mikan github mirror <issue-id>

Options:
  -h, --help            Show this help

Notes:
  Configure github.repo in .mikan/config.yaml first.
  GitHub Mirror uses the gh CLI; install gh and run gh auth login.
  mirror creates a GitHub Issue when github_issue is absent and updates it when present.
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
  -q, --quiet           Suppress watch log output except GitHub Mirror failures
  --github-push         Push changed Issues that already have github_issue
  -h, --help            Show this help

Notes:
  GitHub Mirror auto-push also runs when github.auto_push_mirrors is true.
  It only pushes existing mirrors and never creates GitHub Issues.
`;
		case "mcp":
			return `Start the stdio MCP server, register it with an agent, or print its manifest.

Usage:
  mikan mcp
  mikan mcp add --agent <agent> [--no-global]
  mikan mcp llms [--full]

Options:
  -a, --agent <agent>   Agent to configure: pi, antigravity, jcode, claude-code, opencode, codex, copilot-vscode, copilot-cli
  --no-global           Write workspace-local config instead of global config
  --full                With llms: print the full incur manifest
  -h, --help            Show this help

Notes:
  codex and copilot-cli register globally only; --no-global is rejected.
  copilot-vscode writes workspace .vscode/mcp.json only; use --no-global.
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
  mikan mcp add --agent copilot-vscode --no-global
  mikan mcp add --agent copilot-cli
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
  -a, --agent <agent>   Agent to install guidance for: pi, antigravity, jcode, claude-code, opencode, codex, copilot-vscode, copilot-cli
  --no-global           Install workspace-local guidance instead of global
  -h, --help            Show this help

Notes:
  codex installs the skill globally only; --no-global is rejected for codex.
  antigravity also has a shared skill location at ~/.gemini/skills/; mikan's global install targets the Antigravity CLI path.

Examples:
  mikan skills add --agent pi
  mikan skills add --agent antigravity --no-global
  mikan skills add --agent jcode
  mikan skills add --agent claude-code
  mikan skills add --agent opencode --no-global
  mikan skills add -a codex
  mikan skills add --agent copilot-vscode --no-global
  mikan skills add --agent copilot-cli
`;
	}
}
