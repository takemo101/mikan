export type ParsedArgs = {
	positionals: string[];
	flags: Map<string, string[]>;
};

type OptionSpec = {
	name: string;
	short?: string;
	value: boolean;
};

export type CommandName =
	| "init"
	| "add"
	| "list"
	| "show"
	| "update"
	| "move"
	| "append"
	| "github"
	| "mcp"
	| "skills"
	| "tui"
	| "browser"
	| "watch";

type ParseArgsResult =
	| { ok: true; value: ParsedArgs }
	| { ok: false; error: string };

const commands: CommandName[] = [
	"init",
	"add",
	"list",
	"show",
	"update",
	"move",
	"append",
	"github",
	"mcp",
	"skills",
	"tui",
	"browser",
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
		{ name: "depends-on", value: true },
		{ name: "repository", short: "r", value: true },
		{ name: "affects", value: true },
		{ name: "metadata", value: true },
	],
	list: [
		{ name: "status", short: "s", value: true },
		{ name: "include-archived", short: "a", value: false },
	],
	show: [],
	update: [
		{ name: "title", short: "t", value: true },
		{ name: "label", short: "l", value: true },
		{ name: "depends-on", value: true },
		{ name: "repository", short: "r", value: true },
		{ name: "affects", value: true },
		{ name: "metadata", value: true },
		{ name: "body", short: "b", value: true },
	],
	move: [{ name: "log", short: "l", value: true }],
	append: [
		{ name: "section", short: "S", value: true },
		{ name: "body", short: "b", value: true },
		{ name: "source", short: "s", value: true },
	],
	github: [],
	mcp: [
		{ name: "agent", short: "a", value: true },
		{ name: "no-global", value: false },
		{ name: "full", value: false },
	],
	skills: [
		{ name: "agent", short: "a", value: true },
		{ name: "no-global", value: false },
	],
	tui: [{ name: "columns", short: "c", value: true }],
	browser: [
		{ name: "port", short: "p", value: true },
		{ name: "no-open", value: false },
	],
	watch: [
		{ name: "quiet", short: "q", value: false },
		{ name: "github-push", value: false },
	],
};

export function parseArgs(
	args: string[],
	command: CommandName,
): ParseArgsResult {
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

export function isHelpFlag(input: string): boolean {
	return input === "-h" || input === "--help";
}

export function isCommandName(input: string): input is CommandName {
	return commands.includes(input as CommandName);
}
