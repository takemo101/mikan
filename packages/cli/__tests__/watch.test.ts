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
import { runCli, runWatchOnce } from "../src/index.ts";

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

	test("watch command runs one foreground scan", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);

		const result = await cli(cwd, ["watch"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("watch observed");
	});
});
