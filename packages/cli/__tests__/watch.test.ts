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
import type { GitHubMirrorOptions } from "@mikan/github";
import {
	type CliOptions,
	runCli,
	runWatchOnce,
	watchProject,
} from "../src/index.ts";

async function cli(cwd: string, argv: string[], options: CliOptions = {}) {
	return runCli(argv, {
		cwd,
		now: () => new Date("2026-05-30T00:00:00Z"),
		...options,
	});
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

function configureGitHub(cwd: string, autoPush: boolean): void {
	writeFileSync(
		join(cwd, ".mikan", "config.yaml"),
		`${readFileSync(join(cwd, ".mikan", "config.yaml"), "utf8")}github:\n  repo: takemo101/mikan\n  auto_push_mirrors: ${autoPush}\n`,
	);
}

function addGitHubMirrorFrontmatter(
	cwd: string,
	id: string,
	number: number,
): void {
	const path = join(cwd, ".mikan", "backlog", `${id}.md`);
	const markdown = readFileSync(path, "utf8");
	writeFileSync(
		path,
		markdown.replace(
			"updated_at: 2026-05-30T00:00:00Z\n---",
			`updated_at: 2026-05-30T00:00:00Z\ngithub_issue:\n  repo: takemo101/mikan\n  number: ${number}\n  url: https://github.com/takemo101/mikan/issues/${number}\n  last_mirrored_at: 2026-05-30T00:00:00Z\n---`,
		),
	);
}

function appendBody(cwd: string, id: string, text: string): void {
	const path = join(cwd, ".mikan", "backlog", `${id}.md`);
	writeFileSync(path, `${readFileSync(path, "utf8")}\n${text}\n`);
}

function fakeGithubPush(
	calls: string[],
	failures: Record<string, string> = {},
) {
	return {
		mirrorIssueToGitHub: async (options: GitHubMirrorOptions) => ({
			ok: true as const,
			value: {
				issue_id: options.id,
				action: "updated" as const,
				github_issue: {
					repo: "takemo101/mikan",
					number: Number(options.id.slice(-3)),
					url: `https://github.com/takemo101/mikan/issues/${Number(options.id.slice(-3))}`,
				},
				warnings: [],
			},
		}),
		pushGitHubMirror: async (options: GitHubMirrorOptions) => {
			calls.push(options.id);
			const failure = failures[options.id];
			if (failure) {
				return {
					ok: false as const,
					error: { kind: "github_error", message: failure },
				};
			}
			return {
				ok: true as const,
				value: {
					issue_id: options.id,
					action: "updated" as const,
					github_issue: {
						repo: "takemo101/mikan",
						number: Number(options.id.slice(-3)),
						url: `https://github.com/takemo101/mikan/issues/${Number(options.id.slice(-3))}`,
					},
					warnings: [],
				},
			};
		},
	};
}

describe("watch hooks", () => {
	test("logs observed transitions, placeholder appends, hook failures, and lock skips when requested", async () => {
		const cwd = tempProject();
		const logs: string[] = [];
		await cli(cwd, ["init"]);
		configureHooks(cwd);
		await cli(cwd, ["add", "First"]);
		await runWatchOnce({ cwd, logger: (line) => logs.push(line) });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		await runWatchOnce({
			cwd,
			now: () => new Date("2026-05-30T00:00:00Z"),
			logger: (line) => logs.push(line),
		});
		writeFileSync(join(cwd, ".mikan", ".state", "write.lock"), "held");
		await runWatchOnce({ cwd, logger: (line) => logs.push(line) });

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
		await runWatchOnce({ cwd, quiet: true, logger: (line) => logs.push(line) });
		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		const result = await runWatchOnce({
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
		await runWatchOnce({ cwd, now: () => new Date("2026-05-30T00:00:00Z") });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		const result = await runWatchOnce({
			cwd,
			now: () => new Date("2026-05-30T00:00:00Z"),
		});
		const again = await runWatchOnce({
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
		await runWatchOnce({ cwd });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		await runWatchOnce({ cwd });

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

		const result = await runWatchOnce({ cwd });

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
		await runWatchOnce({ cwd });

		await cli(cwd, ["move", "MIK-001", "ready", "--log", "planned move"]);
		await runWatchOnce({ cwd });

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
		await runWatchOnce({ cwd });
		writeFileSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			`${readFileSync(join(cwd, ".mikan", "backlog", "MIK-001.md"), "utf8")}\nBody edit\n`,
		);

		const editResult = await runWatchOnce({ cwd });
		writeFileSync(join(cwd, ".mikan", ".state", "write.lock"), "held");
		const locked = await runWatchOnce({ cwd });

		expect(editResult.transitions).toBe(0);
		expect(existsSync(join(cwd, ".mikan", ".state", "hooks.txt"))).toBe(false);
		expect(locked.skipped).toBe(true);
	});

	test("does not retroactively repair moves first seen in initial snapshot", async () => {
		const cwd = tempProject();
		await cli(cwd, ["init"]);
		await cli(cwd, ["add", "First", "--status", "ready"]);

		await runWatchOnce({ cwd });

		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(markdown).not.toContain("Observed direct file move");
	});

	test("auto-pushes changed mirrored Issues when enabled by config", async () => {
		const cwd = tempProject();
		const calls: string[] = [];
		const logs: string[] = [];
		await cli(cwd, ["init"]);
		configureGitHub(cwd, true);
		await cli(cwd, ["add", "Mirrored"]);
		await cli(cwd, ["add", "Local only"]);
		addGitHubMirrorFrontmatter(cwd, "MIK-001", 101);
		await runWatchOnce({
			cwd,
			githubMirror: fakeGithubPush(calls),
			logger: (line) => logs.push(line),
		});

		appendBody(cwd, "MIK-001", "Mirrored body edit");
		appendBody(cwd, "MIK-002", "Unmirrored body edit");
		await runWatchOnce({
			cwd,
			githubMirror: fakeGithubPush(calls),
			logger: (line) => logs.push(line),
		});

		expect(calls).toEqual(["MIK-001"]);
		expect(logs).toContain(
			"github mirror pushed: MIK-001 https://github.com/takemo101/mikan/issues/1",
		);
	});

	test("watch --github-push overrides config opt-in without publishing unmirrored Issues", async () => {
		const cwd = tempProject();
		const calls: string[] = [];
		await cli(cwd, ["init"]);
		configureGitHub(cwd, false);
		await cli(cwd, ["add", "Mirrored"]);
		await cli(cwd, ["add", "Local only"]);
		addGitHubMirrorFrontmatter(cwd, "MIK-001", 101);
		await runWatchOnce({ cwd });

		appendBody(cwd, "MIK-001", "Mirrored body edit");
		appendBody(cwd, "MIK-002", "Unmirrored body edit");
		const result = await cli(cwd, ["watch", "--github-push"], {
			githubMirror: fakeGithubPush(calls),
		});

		expect(result.exitCode).toBe(0);
		expect(calls).toEqual(["MIK-001"]);
		expect(result.stdout).toContain("github mirror pushed: MIK-001");
	});

	test("quiet GitHub Mirror auto-push logs only failures", async () => {
		const cwd = tempProject();
		const calls: string[] = [];
		await cli(cwd, ["init"]);
		configureGitHub(cwd, true);
		await cli(cwd, ["add", "Mirrored"]);
		await cli(cwd, ["add", "Fails"]);
		addGitHubMirrorFrontmatter(cwd, "MIK-001", 101);
		addGitHubMirrorFrontmatter(cwd, "MIK-002", 102);
		await runWatchOnce({ cwd });

		appendBody(cwd, "MIK-001", "Quiet success");
		appendBody(cwd, "MIK-002", "Quiet failure");
		const result = await cli(cwd, ["watch", "--quiet"], {
			githubMirror: fakeGithubPush(calls, { "MIK-002": "gh auth failed" }),
		});

		expect(calls).toEqual(["MIK-001", "MIK-002"]);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain(
			"github mirror push failed: MIK-002 gh auth failed",
		);
		const hookLog = readFileSync(
			join(cwd, ".mikan", ".state", "hook-log.ndjson"),
			"utf8",
		);
		expect(hookLog).toContain('"command":"github push MIK-002"');
		expect(hookLog).toContain("gh auth failed");
	});

	test("auto-pushes mirrored Issues after direct Status path moves", async () => {
		const cwd = tempProject();
		const calls: string[] = [];
		await cli(cwd, ["init"]);
		configureGitHub(cwd, true);
		await cli(cwd, ["add", "Mirrored"]);
		addGitHubMirrorFrontmatter(cwd, "MIK-001", 101);
		await runWatchOnce({ cwd });

		renameSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			join(cwd, ".mikan", "ready", "MIK-001.md"),
		);
		await runWatchOnce({ cwd, githubMirror: fakeGithubPush(calls) });

		expect(calls).toEqual(["MIK-001"]);
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
