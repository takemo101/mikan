import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	appendIssue,
	type BoardConfig,
	type BoardIssue,
	type BoardWarning,
	createIssue,
	findIssueById,
	moveIssue,
	scanBoard,
	updateIssue,
} from "@mikan/core";
import { installMcpServerForAgent, startMcpServer } from "@mikan/mcp";
import { initProject, loadProjectConfig } from "@mikan/project-config";
import { launchTui } from "@mikan/tui";
import { runWatchOnce, watchProject } from "./watch.ts";

export { runWatchOnce, watchProject } from "./watch.ts";

export type CliResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type CliOptions = {
	cwd?: string;
	now?: () => Date;
	home?: string;
};

export type InteractiveCommandOptions = {
	cwd?: string;
	home?: string;
	launchMcp?: () => Promise<void>;
	launchTui?: () => Promise<void>;
	launchWatch?: () => void;
};

type ParsedArgs = {
	positionals: string[];
	flags: Map<string, string[]>;
};

type OptionSpec = {
	name: string;
	short?: string;
	value: boolean;
};

type CommandName =
	| "init"
	| "add"
	| "list"
	| "show"
	| "update"
	| "move"
	| "append"
	| "mcp"
	| "tui"
	| "watch";

type ParseArgsResult =
	| { ok: true; value: ParsedArgs }
	| { ok: false; error: string };

export async function runCli(
	argv = process.argv.slice(2),
	options: CliOptions = {},
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd();
	const command = argv[0];

	if (!command || isHelpFlag(command)) return ok(helpText());
	if (command === "help") {
		const topic = argv[1];
		return topic ? commandHelp(topic) : ok(helpText());
	}
	if (!isCommandName(command)) {
		return fail(
			`Unknown command: ${command}\n\nRun \`mikan help\` to see available commands.`,
		);
	}
	if (argv.slice(1).some(isHelpFlag)) return commandHelp(command);

	const parsed = parseArgs(argv.slice(1), command);
	if (!parsed.ok) {
		return fail(`${parsed.error}\n\nRun \`mikan help ${command}\` for usage.`);
	}

	try {
		switch (command) {
			case "init":
				return runInit(cwd, parsed.value);
			case "add":
				return runAdd(cwd, parsed.value, options);
			case "list":
				return runList(cwd, parsed.value);
			case "show":
				return runShow(cwd, parsed.value);
			case "update":
				return runUpdate(cwd, parsed.value, options);
			case "move":
				return runMove(cwd, parsed.value, options);
			case "append":
				return runAppend(cwd, parsed.value, options);
			case "mcp":
				return runMcp(cwd, parsed.value, options);
			case "tui":
				return ok("Starting mikan OpenTUI board\n");
			case "watch":
				return runWatch(cwd);
			default:
				return ok(helpText());
		}
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
	const result = await runInteractiveCommand(argv, { cwd: process.cwd() });
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.exitCode;
}

export async function runInteractiveCommand(
	argv = process.argv.slice(2),
	options: InteractiveCommandOptions = {},
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd();
	if (!argv.some(isHelpFlag)) {
		if (argv[0] === "mcp" && argv[1] !== "add") {
			await (options.launchMcp ?? (() => startMcpServer({ cwd })))();
			return ok("");
		}
		if (argv[0] === "tui") {
			const loaded = loadProjectConfig(cwd);
			if (!loaded.ok) return fail(loaded.error.message);
			await (options.launchTui ?? (() => launchTui({ cwd })))();
			return ok("");
		}
		if (argv[0] === "watch") {
			(options.launchWatch ?? (() => watchProject({ cwd })))();
			return ok("");
		}
	}
	return runCli(argv, { cwd, home: options.home });
}

function runMcp(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	if (parsed.positionals[0] !== "add") {
		return ok("Starting mikan MCP server on stdio\n");
	}
	const agent = parsed.flags.get("agent")?.at(-1);
	if (!agent) return fail("Usage: mikan mcp add --agent <agent>");
	try {
		const result = installMcpServerForAgent(agent, {
			cwd,
			home: options.home,
			global: !parsed.flags.has("no-global"),
		});
		const scope = result.agent === "antigravity" ? ` (${result.scope})` : "";
		const hint =
			result.agent === "antigravity" && result.scope === "cli-global"
				? "Note: the desktop Editor uses ~/.gemini/antigravity/mcp_config.json (no hyphen). Copy or symlink if you also use the GUI.\n"
				: "";
		return ok(
			`Registered MCP server '${result.serverName}' for ${result.agent}${scope}: ${result.path}\n${hint}`,
		);
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
}

function runWatch(cwd: string): CliResult {
	const result = runWatchOnce({ cwd });
	return ok(
		result.skipped
			? "watch skipped: mikan write lock is held\n"
			: `watch observed ${result.observed} issue(s), ${result.transitions} transition(s)\n`,
	);
}

function runInit(cwd: string, parsed: ParsedArgs): CliResult {
	const key = parsed.flags.get("key")?.at(-1) ?? "MIK";
	const name = parsed.flags.get("name")?.at(-1) ?? basename(cwd);
	const initialized = initProject(cwd, { key, name });
	if (!initialized.ok) return fail(initialized.error.message);
	return ok(`Initialized mikan project at ${join(cwd, ".mikan")}\n`);
}

function runAdd(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	const title = parsed.positionals[0];
	if (!title)
		return fail("Usage: mikan add <title> [--status status] [--label label]");
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const result = createIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		title,
		status: parsed.flags.get("status")?.at(-1),
		labels: parsed.flags.get("label") ?? [],
		now: options.now,
	});
	if (!result.ok) return fail(result.error.message);
	return ok(`${String(result.value.issue.id)} ${result.value.issue.title}\n`);
}

function runList(cwd: string, parsed: ParsedArgs): CliResult {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const includeArchived = parsed.flags.has("include-archived");
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		includeArchived,
	});
	if (!board.ok) return fail(board.error.message);
	const statusFilter = parsed.flags.get("status")?.at(-1);
	if (
		statusFilter &&
		!loaded.value.config.board.columns.some(
			(column) => column.id === statusFilter,
		)
	) {
		return fail(`Unknown Status: ${statusFilter}`);
	}
	const columns = statusFilter
		? board.value.columns.filter((column) => column.id === statusFilter)
		: board.value.columns;
	return {
		exitCode: 0,
		stdout: formatBoard(columns),
		stderr: formatWarnings(board.value.warnings),
	};
}

function runShow(cwd: string, parsed: ParsedArgs): CliResult {
	const id = parsed.positionals[0];
	if (!id) return fail("Usage: mikan show <issue-id>");
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const found = findIssueById({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
	});
	if (!found.ok) return fail(found.error.message);
	return ok(readFileSync(found.value.path, "utf8"));
}

function runUpdate(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	const id = parsed.positionals[0];
	if (!id)
		return fail(
			"Usage: mikan update <issue-id> [--title title] [--label label] [--body body]",
		);
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const result = updateIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		title: parsed.flags.get("title")?.at(-1),
		labels: parsed.flags.has("label")
			? (parsed.flags.get("label") ?? [])
			: undefined,
		body: parsed.flags.get("body")?.at(-1),
		now: options.now,
	});
	if (!result.ok) return fail(result.error.message);
	return ok(`${String(result.value.issue.id)} updated\n`);
}

function runMove(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	const id = parsed.positionals[0];
	const status = parsed.positionals[1];
	if (!id || !status)
		return fail("Usage: mikan move <issue-id> <status> [--log text]");
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const result = moveIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		status,
		log: parsed.flags.get("log")?.at(-1),
		now: options.now,
	});
	if (!result.ok) return fail(result.error.message);
	return ok(`${String(result.value.issue.id)} moved to ${status}\n`);
}

function runAppend(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	const id = parsed.positionals[0];
	const section = parsed.flags.get("section")?.at(-1);
	const body = parsed.flags.get("body")?.at(-1);
	if (!id || !section || !body)
		return fail(
			"Usage: mikan append <issue-id> --section section --body body [--source source]",
		);
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const result = appendIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id,
		section,
		body,
		source: parsed.flags.get("source")?.at(-1),
		now: options.now,
	});
	if (!result.ok) return fail(result.error.message);
	return ok(`${String(result.value.issue.id)} appended ${section}\n`);
}

const commands: CommandName[] = [
	"init",
	"add",
	"list",
	"show",
	"update",
	"move",
	"append",
	"mcp",
	"tui",
	"watch",
];

const commandOptions: Record<CommandName, OptionSpec[]> = {
	init: [
		{ name: "key", short: "k", value: true },
		{ name: "name", short: "n", value: true },
	],
	add: [
		{ name: "status", short: "s", value: true },
		{ name: "label", short: "l", value: true },
	],
	list: [
		{ name: "status", short: "s", value: true },
		{ name: "include-archived", short: "a", value: false },
	],
	show: [],
	update: [
		{ name: "title", short: "t", value: true },
		{ name: "label", short: "l", value: true },
		{ name: "body", short: "b", value: true },
	],
	move: [{ name: "log", short: "l", value: true }],
	append: [
		{ name: "section", short: "S", value: true },
		{ name: "body", short: "b", value: true },
		{ name: "source", short: "s", value: true },
	],
	mcp: [
		{ name: "agent", short: "a", value: true },
		{ name: "no-global", value: false },
	],
	tui: [],
	watch: [],
};

function parseArgs(args: string[], command: CommandName): ParseArgsResult {
	const positionals: string[] = [];
	const flags = new Map<string, string[]>();
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) continue;
		if (!arg.startsWith("-")) {
			positionals.push(arg);
			continue;
		}
		const parsed = parseOptionToken(arg, command);
		if (!parsed.ok) return parsed;
		const { spec, inlineValue, displayName } = parsed.value;
		const values = flags.get(spec.name) ?? [];
		if (!spec.value) {
			if (inlineValue !== undefined) {
				return {
					ok: false,
					error: `${displayName} does not take a value`,
				};
			}
			values.push("true");
			flags.set(spec.name, values);
			continue;
		}
		const value = inlineValue ?? args[index + 1];
		if (!value || value.startsWith("-")) {
			return { ok: false, error: `Missing value for ${displayName}` };
		}
		if (inlineValue === undefined) index++;
		values.push(value);
		flags.set(spec.name, values);
	}
	return { ok: true, value: { positionals, flags } };
}

function parseOptionToken(
	token: string,
	command: CommandName,
):
	| {
			ok: true;
			value: { spec: OptionSpec; inlineValue?: string; displayName: string };
	  }
	| { ok: false; error: string } {
	const equalsIndex = token.indexOf("=");
	const raw = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
	const inlineValue =
		equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);
	const spec = optionSpecFor(command, raw);
	if (!spec) return { ok: false, error: `Unknown option: ${raw}` };
	return { ok: true, value: { spec, inlineValue, displayName: raw } };
}

function optionSpecFor(
	command: CommandName,
	raw: string,
): OptionSpec | undefined {
	if (isHelpFlag(raw)) return { name: "help", short: "h", value: false };
	if (raw.startsWith("--")) {
		const name = raw.slice(2);
		return commandOptions[command].find((option) => option.name === name);
	}
	if (raw.startsWith("-") && raw.length === 2) {
		const short = raw.slice(1);
		return commandOptions[command].find((option) => option.short === short);
	}
	return undefined;
}

function isHelpFlag(input: string): boolean {
	return input === "-h" || input === "--help";
}

function isCommandName(input: string): input is CommandName {
	return commands.includes(input as CommandName);
}

function formatBoard(
	columns: Array<
		BoardConfig["board"]["columns"][number] & { issues: BoardIssue[] }
	>,
): string {
	const lines: string[] = [];
	for (const column of columns) {
		lines.push(`${column.title}`);
		for (const item of column.issues) {
			const labels =
				item.issue.labels.length > 0
					? ` [${item.issue.labels.map(String).join(", ")}]`
					: "";
			lines.push(`  ${String(item.issue.id)} ${item.issue.title}${labels}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

function formatWarnings(warnings: BoardWarning[]): string {
	if (warnings.length === 0) return "";
	return warnings
		.map((warning) => `warning ${warning.kind}: ${warning.message}\n`)
		.join("");
}

function ok(stdout: string): CliResult {
	return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr: string): CliResult {
	return { exitCode: 1, stdout: "", stderr: `${stderr}\n` };
}

function commandHelp(topic: string): CliResult {
	if (!isCommandName(topic)) {
		return fail(
			`Unknown help topic: ${topic}\n\nRun \`mikan help\` to see available commands.`,
		);
	}
	return ok(commandHelpText(topic));
}

function helpText(): string {
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
  mikan watch

Options:
  -h, --help            Show this help
`;
		case "mcp":
			return `Start the stdio MCP server or register it with an agent.

Usage:
  mikan mcp
  mikan mcp add --agent <agent> [--no-global]

Options:
  -a, --agent <agent>   Agent to configure: pi, antigravity, jcode
  --no-global           Write workspace-local config instead of global config
  -h, --help            Show this help

Examples:
  mikan mcp add --agent pi
  mikan mcp add --agent antigravity --no-global
  mikan mcp add -a jcode
`;
	}
}
