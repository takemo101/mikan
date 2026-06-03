import { readFileSync } from "node:fs";
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
import { loadProjectConfig } from "@mikan/project-config";
import { Cli, z } from "incur";

export type {
	McpAgent,
	McpAgentInstaller,
	McpAgentInstallOptions,
	McpAgentInstallResult,
} from "./installers/index.ts";
export {
	installMcpServerForAgent,
	mcpAgentInstallers,
} from "./installers/index.ts";

export type McpRuntime = {
	cwd?: string;
	now?: () => Date;
};

export type McpToolError = {
	ok: false;
	error: { code: string; message: string };
};

export type McpToolResult<T> = { ok: true; data: T } | McpToolError;

export function getBoardTool(
	args: { include_archived?: boolean },
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		includeArchived: args.include_archived,
	});
	if (!board.ok) return coreError(board.error.kind, board.error.message);
	return ok({
		columns: board.value.columns.map(formatColumn),
		warnings: board.value.warnings,
	});
}

export function listIssuesTool(
	args: { status?: string; include_archived?: boolean },
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	if (
		args.status &&
		!loaded.value.config.board.columns.some(
			(column) => column.id === args.status,
		)
	) {
		return coreError("unknown_status", `Unknown Status: ${args.status}`);
	}
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		includeArchived: args.include_archived || args.status === "archived",
	});
	if (!board.ok) return coreError(board.error.kind, board.error.message);
	const columns = args.status
		? board.value.columns.filter((column) => column.id === args.status)
		: board.value.columns;
	return ok({
		issues: columns.flatMap((column) =>
			column.issues.map((issue) => formatIssue(issue, board.value.warnings)),
		),
		warnings: board.value.warnings,
	});
}

export function getIssueTool(
	args: { id: string },
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		includeArchived: true,
	});
	if (!board.ok) return coreError(board.error.kind, board.error.message);
	const found = findIssueById({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: args.id,
	});
	if (!found.ok) return coreError(found.error.kind, found.error.message);
	return ok({
		...formatIssue(found.value, board.value.warnings),
		markdown: readFileSync(found.value.path, "utf8"),
	});
}

export function createIssueTool(
	args: {
		title: string;
		body?: string;
		status?: string;
		labels?: string[];
		depends_on?: string[];
	},
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	const result = createIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		title: args.title,
		body: args.body,
		status: args.status,
		labels: args.labels,
		dependencies: args.depends_on,
		now: runtime.now,
	});
	if (!result.ok) return coreError(result.error.kind, result.error.message);
	return ok(formatIssue(result.value, []));
}

export function updateIssueTool(
	args: {
		id: string;
		title?: string;
		labels?: string[];
		body?: string;
		depends_on?: string[];
	},
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	const result = updateIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: args.id,
		title: args.title,
		labels: args.labels,
		body: args.body,
		dependencies: args.depends_on,
		now: runtime.now,
	});
	if (!result.ok) return coreError(result.error.kind, result.error.message);
	return ok(formatIssue(result.value, []));
}

export function moveIssueTool(
	args: { id: string; status: string; log?: string },
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	const result = moveIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: args.id,
		status: args.status,
		log: args.log,
		now: runtime.now,
	});
	if (!result.ok) return coreError(result.error.kind, result.error.message);
	return ok(formatIssue(result.value, []));
}

export function appendIssueTool(
	args: { id: string; section: string; body: string; source?: string },
	runtime: McpRuntime = {},
): McpToolResult<unknown> {
	const loaded = load(runtime.cwd);
	if (!loaded.ok) return loaded;
	const result = appendIssue({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		id: args.id,
		section: args.section,
		body: args.body,
		source: args.source,
		now: runtime.now,
	});
	if (!result.ok) return coreError(result.error.kind, result.error.message);
	return ok(formatIssue(result.value, []));
}

export function createMikanMcpCli(runtime: McpRuntime = {}) {
	return Cli.create("mikan", {
		description: "mikan local Issue board MCP server",
	})
		.command("get_board", {
			description:
				"Return grouped board columns, Issues, and scanner warnings.",
			args: z.object({ include_archived: z.boolean().optional() }),
			run: (context) => forIncur(context, getBoardTool(context.args, runtime)),
		})
		.command("list_issues", {
			description: "List Issues with optional Status filtering.",
			args: z.object({
				status: z.string().optional(),
				include_archived: z.boolean().optional(),
			}),
			run: (context) =>
				forIncur(context, listIssuesTool(context.args, runtime)),
		})
		.command("get_issue", {
			description:
				"Return one Issue including frontmatter, body, Status, path, and relevant warnings.",
			args: z.object({ id: z.string() }),
			run: (context) => forIncur(context, getIssueTool(context.args, runtime)),
		})
		.command("create_issue", {
			description: "Create an Issue with the next generated Issue ID.",
			args: z.object({
				title: z.string(),
				body: z.string().optional(),
				status: z.string().optional(),
				labels: z.array(z.string()).optional(),
				depends_on: z.array(z.string()).optional(),
			}),
			run: (context) =>
				forIncur(context, createIssueTool(context.args, runtime)),
		})
		.command("update_issue", {
			description:
				"Update title, labels, dependencies, or body through the core update primitive.",
			args: z.object({
				id: z.string(),
				title: z.string().optional(),
				labels: z.array(z.string()).optional(),
				body: z.string().optional(),
				depends_on: z.array(z.string()).optional(),
			}),
			run: (context) =>
				forIncur(context, updateIssueTool(context.args, runtime)),
		})
		.command("move_issue", {
			description:
				"Move an Issue to another Status; use blocked/completed statuses instead of special tools.",
			args: z.object({
				id: z.string(),
				status: z.string(),
				log: z.string().optional(),
			}),
			run: (context) => forIncur(context, moveIssueTool(context.args, runtime)),
		})
		.command("append_issue", {
			description:
				"Append Markdown to a named section such as Status Log, Reports, or Notes.",
			args: z.object({
				id: z.string(),
				section: z.string(),
				body: z.string(),
				source: z.string().optional(),
			}),
			run: (context) =>
				forIncur(context, appendIssueTool(context.args, runtime)),
		});
}

export async function startMcpServer(runtime: McpRuntime = {}): Promise<void> {
	await createMikanMcpCli(runtime).serve(["--mcp"]);
}

function formatColumn(
	column: BoardConfig["board"]["columns"][number] & { issues: BoardIssue[] },
) {
	return {
		...column,
		issues: column.issues.map((issue) => formatIssue(issue, [])),
	};
}

function formatIssue(issue: BoardIssue, warnings: BoardWarning[]) {
	return {
		id: String(issue.issue.id),
		title: issue.issue.title,
		labels: issue.issue.labels.map(String),
		created_at: String(issue.issue.createdAt),
		updated_at: String(issue.issue.updatedAt),
		body: issue.issue.body,
		status: String(issue.status),
		path: issue.path,
		depends_on: issue.issue.dependencies.map(String),
		unmet_dependencies: issue.unmetDependencies.map(String),
		dependency_status: issue.dependencyStatus,
		warnings: warnings.filter(
			(warning) =>
				warning.issueId === String(issue.issue.id) ||
				warning.path === issue.path,
		),
	};
}

function forIncur<T>(
	context: {
		error: (options: {
			code: string;
			message: string;
			exitCode?: number;
		}) => never;
	},
	result: McpToolResult<T>,
): T {
	if (!result.ok) {
		return context.error({
			code: result.error.code,
			message: result.error.message,
			exitCode: 1,
		});
	}
	return result.data;
}

function load(cwd = process.cwd()) {
	const loaded = loadProjectConfig(cwd);
	if (!loaded.ok) return coreError(loaded.error.kind, loaded.error.message);
	return loaded;
}

function ok<T>(data: T): McpToolResult<T> {
	return { ok: true, data };
}

function coreError(code: string, message: string): McpToolError {
	return { ok: false, error: { code, message } };
}
