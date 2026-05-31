import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	type BoardConfig,
	type BoardIssue,
	type BoardWarning,
	createIssue,
	findIssueById,
	scanBoard,
} from "@mikan/core";
import { initProject, loadProjectConfig } from "@mikan/project-config";

export type CliResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type CliOptions = {
	cwd?: string;
	now?: () => Date;
};

type ParsedArgs = {
	positionals: string[];
	flags: Map<string, string[]>;
};

export async function runCli(
	argv = process.argv.slice(2),
	options: CliOptions = {},
): Promise<CliResult> {
	const cwd = options.cwd ?? process.cwd();
	const command = argv[0];
	const parsed = parseArgs(argv.slice(1));

	try {
		switch (command) {
			case "init":
				return runInit(cwd, parsed);
			case "add":
				return runAdd(cwd, parsed, options);
			case "list":
				return runList(cwd, parsed);
			case "show":
				return runShow(cwd, parsed);
			case "help":
			case undefined:
				return ok(helpText());
			default:
				return fail(`Unknown command: ${command}`);
		}
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
	const result = await runCli(argv);
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.exitCode;
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

function parseArgs(args: string[]): ParsedArgs {
	const positionals: string[] = [];
	const flags = new Map<string, string[]>();
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg?.startsWith("--")) {
			if (arg) positionals.push(arg);
			continue;
		}
		const key = arg.slice(2);
		const next = args[index + 1];
		const values = flags.get(key) ?? [];
		if (next && !next.startsWith("--")) {
			values.push(next);
			index++;
		} else {
			values.push("true");
		}
		flags.set(key, values);
	}
	return { positionals, flags };
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

function helpText(): string {
	return "mikan init|add|list|show\n";
}
