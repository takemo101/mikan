import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, runWatchOnce, watchProject } from "../src/index.ts";

async function cli(cwd: string, argv: string[]) {
	return runCli(argv, { cwd, now: () => new Date("2026-05-30T00:00:00Z") });
}

function tempProject(): string {
	return mkdtempSync(join(tmpdir(), "mikan-watch-"));
}

function configureHooks(cwd: string): void {
	writeFileSync(
		join(cwd, ".mikan", "config.yaml"),
		`project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: backlog\n      title: Backlog\n    - id: ready\n      title: Ready\n    - id: archived\n      title: Archived\nlabels:\n  - id: automation\n    title: Automation\nhooks:\n  on_enter:\n    ready:\n      - "echo {{issue_id}} {{from_status}} {{to_status}} {{issue_path}} {{project_root}} >> .mikan/.state/hooks.txt"\n  on_transition:\n    backlog->ready:\n      - "echo failing >&2; exit 7"\n`,
	);
}

describe("watch hooks", () => {
	test("logs observed transitions, placeholder appends, hook failures, and lock skips when requested", async () => {
		const cwd = tempProject();
		const logs: string[] = [];
		await cli(cwd, ["init"]);
		configureHooks(cwd);
		await cli(cwd, ["add", "First"]);
		runWatchOnce({ cwd, logger: (line) => logs.push(line) });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		runWatchOnce({
			cwd,
			now: () => new Date("2026-05-30T00:00:00Z"),
			logger: (line) => logs.push(line),
		});
		writeFileSync(join(cwd, ".mikan", ".state", "write.lock"), "held");
		runWatchOnce({ cwd, logger: (line) => logs.push(line) });

		expect(logs).toContain("watch observed 1 issue(s), 0 transition(s)");
		expect(logs).toContain("transition MIK-001 backlog -> ready");
		expect(logs).toContain(
			"status-log appended: MIK-001 direct move placeholder",
		);
		expect(logs.join("\n")).toContain(
			"hook failed: MIK-001 backlog -> ready exit 7",
		);
		expect(logs).toContain("skipped: mikan write lock is held");
	});

	test("quiet watch suppresses logs", async () => {
		const cwd = tempProject();
		const logs: string[] = [];
		await cli(cwd, ["init"]);
		configureHooks(cwd);
		await cli(cwd, ["add", "First"]);
		runWatchOnce({ cwd, quiet: true, logger: (line) => logs.push(line) });
		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		const result = runWatchOnce({
			cwd,
			quiet: true,
			logger: (line) => logs.push(line),
		});
		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);

		expect(logs).toEqual([]);
		expect(result.transitions).toBe(1);
		expect(markdown).toContain(
			"Observed direct file move from backlog to ready",
		);
		expect(
			readFileSync(join(cwd, ".mikan", ".state", "hook-log.ndjson"), "utf8"),
		).toContain('"exit_code":7');
	});

	test("watchProject logs startup without no-op scan summaries", async () => {
		const cwd = tempProject();
		const logs: string[] = [];
		const quietLogs: string[] = [];
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);

		const interval = watchProject({
			cwd,
			intervalMs: 60_000,
			logger: (line) => logs.push(line),
		});
		clearInterval(interval);
		const quietInterval = watchProject({
			cwd,
			quiet: true,
			intervalMs: 60_000,
			logger: (line) => quietLogs.push(line),
		});
		clearInterval(quietInterval);

		expect(logs).toEqual([`watch started: ${cwd}`]);
		expect(quietLogs).toEqual([]);
	});

	test("observes transitions, records snapshot, fires hooks, logs failures, and appends placeholder once", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		configureHooks(cwd);
		await cli(cwd, ["add", "First"]);
		runWatchOnce({ cwd, now: () => new Date("2026-05-30T00:00:00Z") });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		const result = runWatchOnce({
			cwd,
			now: () => new Date("2026-05-30T00:00:00Z"),
		});
		const again = runWatchOnce({
			cwd,
			now: () => new Date("2026-05-30T00:00:00Z"),
		});

		expect(result.transitions).toBe(1);
		expect(again.transitions).toBe(0);
		expect(
			existsSync(join(cwd, ".mikan", ".state", "watcher-snapshot.json")),
		).toBe(true);
		expect(
			readFileSync(join(cwd, ".mikan", ".state", "hooks.txt"), "utf8"),
		).toContain("MIK-001 backlog ready");
		const hookLog = readFileSync(
			join(cwd, ".mikan", ".state", "hook-log.ndjson"),
			"utf8",
		);
		expect(hookLog).toContain('"exit_code":7');
		expect(hookLog).toContain("failing");
		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(markdown.match(/Observed direct file move/g)?.length).toBe(1);
	});

	test("adds placeholder when Status Log only has unrelated history", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);
		const issuePath = join(cwd, ".mikan", "backlog", "MIK-001.md");
		writeFileSync(
			issuePath,
			readFileSync(issuePath, "utf8").replace(
				"## Status Log\n\n## Reports",
				"## Status Log\n\n- 2026-05-29T00:00:00Z\n\nOld unrelated status note\n\n## Reports",
			),
		);
		runWatchOnce({ cwd });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		runWatchOnce({ cwd });

		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(markdown).toContain(
			"Observed direct file move from backlog to ready",
		);
	});

	test("ignores corrupted watcher snapshots and rewrites a fresh snapshot", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);
		writeFileSync(
			join(cwd, ".mikan", ".state", "watcher-snapshot.json"),
			"{not json",
		);

		const result = runWatchOnce({ cwd });

		expect(result.observed).toBe(1);
		expect(result.transitions).toBe(0);
		expect(
			JSON.parse(
				readFileSync(
					join(cwd, ".mikan", ".state", "watcher-snapshot.json"),
					"utf8",
				),
			),
		).toHaveProperty("MIK-001");
	});

	test("does not add placeholder when a matching Status Log already exists", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First"]);
		runWatchOnce({ cwd });

		await cli(cwd, ["move", "MIK-001", "ready", "--log", "planned move"]);
		runWatchOnce({ cwd });

		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(markdown).toContain("planned move");
		expect(markdown).not.toContain("Observed direct file move");
	});

	test("does not fire hooks for body edits or while write lock is held", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		configureHooks(cwd);
		await cli(cwd, ["add", "First"]);
		runWatchOnce({ cwd });
		writeFileSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			`${readFileSync(join(cwd, ".mikan", "backlog", "MIK-001.md"), "utf8")}\nBody edit\n`,
		);

		const editResult = runWatchOnce({ cwd });
		writeFileSync(join(cwd, ".mikan", ".state", "write.lock"), "held");
		const locked = runWatchOnce({ cwd });

		expect(editResult.transitions).toBe(0);
		expect(existsSync(join(cwd, ".mikan", ".state", "hooks.txt"))).toBe(false);
		expect(locked.skipped).toBe(true);
	});

	test("does not retroactively repair moves first seen in initial snapshot", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First", "--status", "ready"]);

		runWatchOnce({ cwd });

		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(markdown).not.toContain("Observed direct file move");
	});

	test("watch command runs one foreground scan with default logs and quiet opt-out", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["watch"]);
		const quiet = await cli(cwd, ["watch", "--quiet"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("watch observed");
		expect(quiet.exitCode).toBe(0);
		expect(quiet.stdout).toBe("");
	});
});
