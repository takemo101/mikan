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
	type Result,
	scanBoard,
	updateIssue,
} from "@mikan/core";
import {
	type GitHubMirrorResult,
	mirrorIssueToGitHub,
	pushGitHubMirror,
} from "@mikan/github";
import {
	getMcpManifest,
	installMcpServerForAgent,
	installSkillForAgent,
} from "@mikan/mcp";
import { initProject, loadProjectConfig } from "@mikan/project-config";
import { type ParsedArgs, parseArgs } from "./args.ts";
import type { CliOptions } from "./cli-options.ts";
import { type CliResult, fail, ok } from "./cli-output.ts";
import { runWatchOnce } from "./watch.ts";

export function runMcp(
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

export async function runMcpLlms(
	cwd: string,
	args: string[],
): Promise<CliResult> {
	const parsed = parseArgs(args, "mcp");
	if (!parsed.ok) {
		return fail(`${parsed.error}\n\nRun \`mikan help mcp\` for usage.`);
	}
	if (parsed.value.flags.has("agent")) {
		return fail(
			"incur-backed discovery only prints a manifest; it cannot install for a specific agent.\n" +
				"Use `mikan mcp add --agent <agent>` for native MCP registration.",
		);
	}
	const manifest = await getMcpManifest(
		{ cwd },
		{ full: parsed.value.flags.has("full") },
	);
	return ok(manifest.endsWith("\n") ? manifest : `${manifest}\n`);
}

export function runSkills(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	if (parsed.positionals[0] !== "add") {
		return fail("Usage: mikan skills add --agent <agent>");
	}
	const agent = parsed.flags.get("agent")?.at(-1);
	if (!agent) return fail("Usage: mikan skills add --agent <agent>");
	try {
		const result = installSkillForAgent(agent, {
			cwd,
			home: options.home,
			global: !parsed.flags.has("no-global"),
		});
		return ok(
			`Installed mikan skill for ${result.agent} (${result.scope}): ${result.path}\n`,
		);
	} catch (error) {
		return fail(error instanceof Error ? error.message : String(error));
	}
}

export async function runGithub(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): Promise<CliResult> {
	const subcommand = parsed.positionals[0];
	const id = parsed.positionals[1];
	const operations = options.githubMirror ?? {
		mirrorIssueToGitHub,
		pushGitHubMirror,
	};
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	if (subcommand === "mirror") {
		if (!id) return fail("Usage: mikan github mirror <issue-id>");
		return formatGitHubMirrorCliResult(
			await operations.mirrorIssueToGitHub({
				projectRoot: loaded.value.projectRoot,
				config: loaded.value.config,
				id,
				now: options.now,
			}),
			"mirrored",
		);
	}
	if (subcommand === "push") {
		if (parsed.flags.has("all")) {
			const board = scanBoard({
				projectRoot: loaded.value.projectRoot,
				config: loaded.value.config,
				includeArchived: true,
			});
			if (!board.ok) return fail(board.error.message);
			const mirroredIssues = board.value.columns
				.flatMap((column) => column.issues)
				.filter((issue) => issue.issue.githubIssue)
				.map((issue) => String(issue.issue.id));
			const outputs: string[] = [];
			const warnings: string[] = [];
			for (const issueId of mirroredIssues) {
				const result = await operations.pushGitHubMirror({
					projectRoot: loaded.value.projectRoot,
					config: loaded.value.config,
					id: issueId,
					now: options.now,
				});
				if (!result.ok) return fail(result.error.message);
				outputs.push(formatGitHubMirrorSuccess(result.value, "pushed"));
				warnings.push(...result.value.warnings);
			}
			return {
				exitCode: 0,
				stdout: outputs.length > 0 ? `${outputs.join("\n")}\n` : "",
				stderr: formatGitHubMirrorWarnings(warnings),
			};
		}
		if (!id) return fail("Usage: mikan github push <issue-id>|--all");
		return formatGitHubMirrorCliResult(
			await operations.pushGitHubMirror({
				projectRoot: loaded.value.projectRoot,
				config: loaded.value.config,
				id,
				now: options.now,
			}),
			"pushed",
		);
	}
	return fail("Usage: mikan github <mirror|push> ...");
}

export async function runWatch(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): Promise<CliResult> {
	const lines: string[] = [];
	const errors: string[] = [];
	await runWatchOnce({
		cwd,
		quiet: parsed.flags.has("quiet"),
		githubPush: parsed.flags.has("github-push"),
		githubMirror: options.githubMirror
			? { pushGitHubMirror: options.githubMirror.pushGitHubMirror }
			: undefined,
		logger: (line) => lines.push(line),
		errorLogger: (line) => errors.push(line),
	});
	return {
		exitCode: 0,
		stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
		stderr: errors.length > 0 ? `${errors.join("\n")}\n` : "",
	};
}

export function runInit(cwd: string, parsed: ParsedArgs): CliResult {
	const key = parsed.flags.get("key")?.at(-1) ?? "MIK";
	const name = parsed.flags.get("name")?.at(-1) ?? basename(cwd);
	const initialized = initProject(cwd, { key, name });
	if (!initialized.ok) return fail(initialized.error.message);
	return ok(`Initialized mikan project at ${join(cwd, ".mikan")}\n`);
}

export function runAdd(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	const title = parsed.positionals[0];
	if (!title)
		return fail(
			"Usage: mikan add <title> [--status status] [--label label] [--depends-on issue-id]",
		);
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return fail(loaded.error.message);
	const result = createIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		title,
		status: parsed.flags.get("status")?.at(-1),
		labels: parsed.flags.get("label") ?? [],
		dependencies: parsed.flags.get("depends-on") ?? [],
		now: options.now,
	});
	if (!result.ok) return fail(result.error.message);
	return ok(`${String(result.value.issue.id)} ${result.value.issue.title}\n`);
}

export function runList(cwd: string, parsed: ParsedArgs): CliResult {
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

export function runShow(cwd: string, parsed: ParsedArgs): CliResult {
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
	return {
		exitCode: 0,
		stdout: readFileSync(found.value.path, "utf8"),
		stderr: formatDependencyShowInfo(found.value),
	};
}

export function runUpdate(
	cwd: string,
	parsed: ParsedArgs,
	options: CliOptions,
): CliResult {
	const id = parsed.positionals[0];
	if (!id)
		return fail(
			"Usage: mikan update <issue-id> [--title title] [--label label] [--depends-on issue-id] [--body body]",
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
		dependencies: parsed.flags.has("depends-on")
			? (parsed.flags.get("depends-on") ?? [])
			: undefined,
		body: parsed.flags.get("body")?.at(-1),
		now: options.now,
	});
	if (!result.ok) return fail(result.error.message);
	return ok(`${String(result.value.issue.id)} updated\n`);
}

export function runMove(
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

export function runAppend(
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

function formatGitHubMirrorCliResult(
	result: Result<GitHubMirrorResult, { message: string }>,
	verb: "mirrored" | "pushed",
): CliResult {
	if (!result.ok) return fail(result.error.message);
	return {
		exitCode: 0,
		stdout: `${formatGitHubMirrorSuccess(result.value, verb)}\n`,
		stderr: formatGitHubMirrorWarnings(result.value.warnings),
	};
}

function formatGitHubMirrorSuccess(
	result: GitHubMirrorResult,
	verb: "mirrored" | "pushed",
): string {
	return `${result.issue_id} ${verb} to ${result.github_issue.url}`;
}

function formatGitHubMirrorWarnings(warnings: string[]): string {
	return warnings.map((warning) => `warning: ${warning}\n`).join("");
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
			lines.push(
				`  ${String(item.issue.id)} ${item.issue.title}${labels}${formatDependencyListSuffix(item)}`,
			);
		}
	}
	return `${lines.join("\n")}\n`;
}

function formatDependencyListSuffix(item: BoardIssue): string {
	const dependsOn = item.issue.dependencies.map(String);
	const unmet = item.unmetDependencies.map(String);
	if (dependsOn.length === 0 && unmet.length === 0) return "";
	const parts = [
		`depends_on=${dependsOn.length > 0 ? dependsOn.join(",") : "-"}`,
		`unmet_dependencies=${unmet.length > 0 ? unmet.join(",") : "-"}`,
		`dependency_status=${item.dependencyStatus}`,
	];
	return ` ${parts.join(" ")}`;
}

function formatDependencyShowInfo(item: BoardIssue): string {
	const dependsOn = item.issue.dependencies.map(String);
	const unmet = item.unmetDependencies.map(String);
	if (dependsOn.length === 0 && unmet.length === 0) return "";
	return [
		`Dependency Status: ${item.dependencyStatus}`,
		`Depends On: ${dependsOn.length > 0 ? dependsOn.join(", ") : "-"}`,
		`Unmet Dependencies: ${unmet.length > 0 ? unmet.join(", ") : "-"}`,
		"",
	].join("\n");
}

function formatWarnings(warnings: BoardWarning[]): string {
	if (warnings.length === 0) return "";
	return warnings
		.map((warning) => `warning ${warning.kind}: ${warning.message}\n`)
		.join("");
}
