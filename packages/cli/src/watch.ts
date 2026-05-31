import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
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

export type WatchLogger = (line: string) => void;

export type WatchOptions = {
	cwd?: string;
	now?: () => Date;
	quiet?: boolean;
	logger?: WatchLogger;
	logScanSummary?: boolean;
};

export function runWatchOnce(options: WatchOptions = {}): WatchResult {
	const loaded = loadProjectConfig(options.cwd ?? process.cwd());
	if (!loaded.ok) throw new Error(loaded.error.message);
	if (isWriteLocked(loaded.value.projectRoot)) {
		emit(options, "skipped: mikan write lock is held");
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
			emit(
				options,
				`transition ${id} ${before.status} -> ${String(issue.status)}`,
			);
			const appended = appendPlaceholderStatusLog(
				loaded.value,
				issue,
				before.status,
				options.now,
			);
			if (appended) {
				emit(options, `status-log appended: ${id} direct move placeholder`);
			}
			fireHooks(
				loaded.value,
				issue,
				before.status,
				String(issue.status),
				options,
			);
		}
	}

	writeSnapshot(snapshotPath, current);
	if (options.logScanSummary !== false) {
		emit(
			options,
			`watch observed ${issues.length} issue(s), ${transitions} transition(s)`,
		);
	}
	return { observed: issues.length, transitions, skipped: false };
}

export function watchProject(
	options: WatchOptions & { intervalMs?: number } = {},
): ReturnType<typeof setInterval> {
	const logger = options.quiet ? undefined : (options.logger ?? console.log);
	const watchOptions = { ...options, logger, logScanSummary: false };
	if (!options.quiet) {
		const loaded = loadProjectConfig(options.cwd ?? process.cwd());
		if (!loaded.ok) throw new Error(loaded.error.message);
		logger?.(`watch started: ${loaded.value.projectRoot}`);
	}
	runWatchOnce(watchOptions);
	return setInterval(
		() => runWatchOnce(watchOptions),
		options.intervalMs ?? 1000,
	);
}

function appendPlaceholderStatusLog(
	loaded: LoadedProjectConfig,
	issue: BoardIssue,
	fromStatus: string,
	now?: () => Date,
): boolean {
	if (
		hasMatchingStatusLogEntry(
			issue.issue.body,
			fromStatus,
			String(issue.status),
		)
	) {
		return false;
	}
	const result = appendIssue({
		projectRoot: loaded.projectRoot,
		config: loaded.config,
		id: String(issue.issue.id),
		section: "Status Log",
		body: `Observed direct file move from ${fromStatus} to ${String(issue.status)}`,
		source: "mikan-watch",
		now,
	});
	return result.ok;
}

function fireHooks(
	loaded: LoadedProjectConfig,
	issue: BoardIssue,
	fromStatus: string,
	toStatus: string,
	options: WatchOptions,
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
				timestamp: utcNow(options.now),
				issue_id: String(issue.issue.id),
				from_status: fromStatus,
				to_status: toStatus,
				command: rendered,
				exit_code: result.exitCode,
				error: new TextDecoder().decode(result.stderr).trim(),
			});
			emit(
				options,
				`hook failed: ${String(issue.issue.id)} ${fromStatus} -> ${toStatus} exit ${result.exitCode}`,
			);
		}
	}
}

function hasMatchingStatusLogEntry(
	body: string,
	fromStatus: string,
	toStatus: string,
): boolean {
	const section = extractStatusLog(body);
	if (!section) return false;
	if (
		section.includes(
			`Observed direct file move from ${fromStatus} to ${toStatus}`,
		)
	) {
		return true;
	}
	return section.includes(`Moved from ${fromStatus} to ${toStatus}`);
}

function extractStatusLog(body: string): string {
	const lines = body.split("\n");
	const start = lines.findIndex((line) => line.trim() === "## Status Log");
	if (start === -1) return "";
	let end = lines.length;
	for (let index = start + 1; index < lines.length; index++) {
		if (/^##\s+/.test(lines[index] ?? "")) {
			end = index;
			break;
		}
	}
	return lines.slice(start + 1, end).join("\n");
}

function emit(options: WatchOptions, line: string): void {
	if (options.quiet) return;
	options.logger?.(line);
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
	try {
		return JSON.parse(readFileSync(path, "utf8")) as WatchSnapshot;
	} catch {
		return undefined;
	}
}

function writeSnapshot(path: string, snapshot: WatchSnapshot): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
	renameSync(tmp, path);
}

function watcherSnapshotPath(projectRoot: string): string {
	return join(projectRoot, ".mikan", ".state", "watcher-snapshot.json");
}

function utcNow(now?: () => Date): string {
	return (now?.() ?? new Date()).toISOString().replace(".000Z", "Z");
}
