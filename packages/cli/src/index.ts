import { startMcpServer } from "@mikan/mcp";
import { loadProjectConfig } from "@mikan/project-config";
import { launchTui } from "@mikan/tui";
import { isCommandName, isHelpFlag, parseArgs } from "./args.ts";
import type { CliOptions, InteractiveCommandOptions } from "./cli-options.ts";
import { type CliResult, fail, ok } from "./cli-output.ts";
import {
	runAdd,
	runAppend,
	runInit,
	runList,
	runMcp,
	runMove,
	runShow,
	runUpdate,
	runWatch,
} from "./commands.ts";
import { commandHelp, helpText } from "./help.ts";
import { watchProject } from "./watch.ts";

export type { CliOptions, InteractiveCommandOptions } from "./cli-options.ts";
// Public facade re-export for the extracted CLI output Module (MIK-088).
export type { CliResult } from "./cli-output.ts";
export { runWatchOnce, watchProject } from "./watch.ts";

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
				return runWatch(cwd, parsed.value);
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
			const parsed = parseArgs(argv.slice(1), "watch");
			if (!parsed.ok) {
				return fail(`${parsed.error}\n\nRun \`mikan help watch\` for usage.`);
			}
			const quiet = parsed.value.flags.has("quiet");
			(options.launchWatch ?? (() => watchProject({ cwd, quiet })))();
			return ok("");
		}
	}
	return runCli(argv, { cwd, home: options.home });
}
