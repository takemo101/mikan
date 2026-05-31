import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	appendIssue,
	type BoardIssue,
	isWriteLocked,
	scanBoard,
} from "@mikan/core";
import {
	type LoadedProjectConfig,
	loadProjectConfig,
} from "@mikan/project-config";

export type WatchSnapshot = Record<string, { status: string; path: string }>;

export type WatchResult = {
	observed: number;
	transitions: number;
	skipped: boolean;
};

export type WatchOptions = {
	cwd?: string;
	now?: () => Date;
};

export function runWatchOnce(options: WatchOptions = {}): WatchResult {
	const loaded = loadProjectConfig(options.cwd ?? process.cwd());
	if (!loaded.ok) throw new Error(loaded.error.message);
	if (isWriteLocked(loaded.value.projectRoot)) {
		return { observed: 0, transitions: 0, skipped: true };
	}
	const snapshotPath = watcherSnapshotPath(loaded.value.projectRoot);
	const previous = readSnapshot(snapshotPath);
	const board = scanBoard({
		projectRoot: loaded.value.projectRoot,
		config: loaded.value.config,
		includeArchived: true,
	});
	if (!board.ok) throw new Error(board.error.message);
	const issues = board.value.columns.flatMap((column) => column.issues);
	const current = Object.fromEntries(
		issues.map((issue) => [
			String(issue.issue.id),
			{ status: String(issue.status), path: issue.path },
		]),
	) satisfies WatchSnapshot;
	let transitions = 0;

	if (previous) {
		for (const issue of issues) {
			const id = String(issue.issue.id);
			const before = previous[id];
			if (!before || before.status === String(issue.status)) continue;
			transitions++;
			appendPlaceholderStatusLog(
				loaded.value,
				issue,
				before.status,
				options.now,
			);
			fireHooks(
				loaded.value,
				issue,
				before.status,
				String(issue.status),
				options.now,
			);
		}
	}

	writeSnapshot(snapshotPath, current);
	return { observed: issues.length, transitions, skipped: false };
}

export function watchProject(
	options: WatchOptions & { intervalMs?: number } = {},
): ReturnType<typeof setInterval> {
	runWatchOnce(options);
	return setInterval(() => runWatchOnce(options), options.intervalMs ?? 1000);
}

function appendPlaceholderStatusLog(
	loaded: LoadedProjectConfig,
	issue: BoardIssue,
	fromStatus: string,
	now?: () => Date,
): void {
	if (hasStatusLogEntry(issue.issue.body)) return;
	if (
		issue.issue.body.includes(
			`Observed direct file move from ${fromStatus} to ${String(issue.status)}`,
		)
	) {
		return;
	}
	appendIssue({
		projectRoot: loaded.projectRoot,
		config: loaded.config,
		id: String(issue.issue.id),
		section: "Status Log",
		body: `Observed direct file move from ${fromStatus} to ${String(issue.status)}`,
		source: "mikan-watch",
		now,
	});
}

function fireHooks(
	loaded: LoadedProjectConfig,
	issue: BoardIssue,
	fromStatus: string,
	toStatus: string,
	now?: () => Date,
): void {
	const hooks = loaded.config.hooks;
	const commands = [
		...(hooks?.on_enter?.[toStatus] ?? []),
		...(hooks?.on_transition?.[`${fromStatus}->${toStatus}`] ?? []),
	];
	for (const command of commands) {
		const rendered = renderHookCommand(command, {
			project_root: loaded.projectRoot,
			issue_path: issue.path,
			issue_id: String(issue.issue.id),
			from_status: fromStatus,
			to_status: toStatus,
		});
		const result = Bun.spawnSync(["sh", "-c", rendered], {
			cwd: loaded.projectRoot,
			stderr: "pipe",
		});
		if (result.exitCode !== 0) {
			appendHookFailure(loaded.projectRoot, {
				timestamp: utcNow(now),
				issue_id: String(issue.issue.id),
				from_status: fromStatus,
				to_status: toStatus,
				command: rendered,
				exit_code: result.exitCode,
				error: new TextDecoder().decode(result.stderr).trim(),
			});
		}
	}
}

function hasStatusLogEntry(body: string): boolean {
	const lines = body.split("\n");
	const start = lines.findIndex((line) => line.trim() === "## Status Log");
	if (start === -1) return false;
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index++) {
		if (/^##\s+/.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines.slice(start + 1, end).some((line) => line.trim().length > 0);
}

function renderHookCommand(
	command: string,
	values: Record<string, string>,
): string {
	return command.replace(
		/{{\s*([a-z_]+)\s*}}/g,
		(match, key: string) => values[key] ?? match,
	);
}

function appendHookFailure(
	projectRoot: string,
	entry: Record<string, unknown>,
): void {
	const path = join(projectRoot, ".mikan", ".state", "hook-log.ndjson");
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

function readSnapshot(path: string): WatchSnapshot | undefined {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8")) as WatchSnapshot;
}

function writeSnapshot(path: string, snapshot: WatchSnapshot): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(snapshot, null, 2));
}

function watcherSnapshotPath(projectRoot: string): string {
	return join(projectRoot, ".mikan", ".state", "watcher-snapshot.json");
}

function utcNow(now?: () => Date): string {
	return (now?.() ?? new Date()).toISOString().replace(".000Z", "Z");
}
