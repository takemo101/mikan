import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoardConfig } from "@mikan/core";
import {
	type GhApiRequest,
	type GhApiRunner,
	mirrorIssueToGitHub,
	pushGitHubMirror,
} from "../src/index.ts";

const config: BoardConfig & {
	project: { key: string; name: string };
	github?: { repo: string; auto_push_mirrors: boolean };
} = {
	project: { key: "MIK", name: "mikan" },
	board: {
		columns: [
			{ id: "ready", title: "Ready" },
			{ id: "active", title: "Active" },
		],
	},
	labels: [
		{ id: "automation", title: "Automation" },
		{ id: "herdr", title: "Herdr" },
	],
	github: { repo: "takemo101/mikan", auto_push_mirrors: false },
};

const now = () => new Date("2026-06-03T22:00:00Z");

type RecordedCall = GhApiRequest;

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-github-"));
	for (const status of config.board.columns) {
		mkdirSync(join(root, ".mikan", status.id), { recursive: true });
	}
	return root;
}

function writeIssue(
	root: string,
	options: {
		status?: string;
		id?: string;
		title?: string;
		labels?: string[];
		githubIssue?: string;
	} = {},
): string {
	const id = options.id ?? "MIK-123";
	const status = options.status ?? "ready";
	const labels = options.labels ?? ["automation", "herdr"];
	const githubIssue = options.githubIssue ? `${options.githubIssue}\n` : "";
	const markdown = `---\nid: ${id}\ntitle: ${options.title ?? "Add docs"}\nlabels:\n${labels.map((label) => `  - ${label}`).join("\n")}\n${githubIssue}created_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# ${options.title ?? "Add docs"}\n\n## Summary\n\nBody text.\n`;
	const path = join(root, ".mikan", status, `${id}.md`);
	writeFileSync(path, markdown);
	return path;
}

function fakeRunner(responses: Record<string, unknown>): {
	runner: GhApiRunner;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	return {
		calls,
		runner: async (request) => {
			calls.push(request);
			const key = `${request.method} ${request.endpoint}`;
			const response = responses[key];
			if (response instanceof Error) throw response;
			if (response === undefined) {
				throw new Error(`unexpected gh api call: ${key}`);
			}
			return response;
		},
	};
}

describe("GitHub Mirror operations", () => {
	test("creates a GitHub Issue mirror and stores github_issue frontmatter", async () => {
		const root = tempProject();
		writeIssue(root);
		const { runner, calls } = fakeRunner({
			"GET repos/takemo101/mikan/labels": [{ name: "automation" }],
			"POST repos/takemo101/mikan/labels": { name: "herdr" },
			"POST repos/takemo101/mikan/issues": {
				number: 456,
				html_url: "https://github.com/takemo101/mikan/issues/456",
			},
		});

		const result = await mirrorIssueToGitHub({
			projectRoot: root,
			config,
			id: "MIK-123",
			runner,
			now,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value).toEqual({
			issue_id: "MIK-123",
			action: "created",
			github_issue: {
				repo: "takemo101/mikan",
				number: 456,
				url: "https://github.com/takemo101/mikan/issues/456",
			},
			warnings: [],
		});
		expect(calls.map((call) => `${call.method} ${call.endpoint}`)).toEqual([
			"GET repos/takemo101/mikan/labels",
			"POST repos/takemo101/mikan/labels",
			"POST repos/takemo101/mikan/issues",
		]);
		expect(calls[1]?.body).toEqual({
			name: "herdr",
			color: "f59e0b",
			description: 'Mirrored from mikan label "Herdr" (herdr)',
		});
		expect(calls[2]?.body).toMatchObject({
			title: "[MIK-123] Add docs",
			labels: ["automation", "herdr"],
		});
		expect(String(calls[2]?.body)).not.toContain("created_at");
		expect(JSON.stringify(calls[2]?.body)).toContain("Status: ready");
		expect(JSON.stringify(calls[2]?.body)).toContain("Body text.");
		const markdown = readFileSync(
			join(root, ".mikan", "ready", "MIK-123.md"),
			"utf8",
		);
		expect(markdown).toContain("github_issue:");
		expect(markdown).toContain("repo: takemo101/mikan");
		expect(markdown).toContain("number: 456");
		expect(markdown).toContain(
			"url: https://github.com/takemo101/mikan/issues/456",
		);
		expect(markdown).toContain("last_mirrored_at: 2026-06-03T22:00:00Z");
	});

	test("updates an existing mirror and preserves non-mikan GitHub labels", async () => {
		const root = tempProject();
		writeIssue(root, {
			status: "active",
			labels: ["automation"],
			githubIssue:
				"github_issue:\n  repo: takemo101/mikan\n  number: 456\n  url: https://github.com/takemo101/mikan/issues/456\n  last_mirrored_at: 2026-06-01T00:00:00Z",
		});
		const { runner, calls } = fakeRunner({
			"GET repos/takemo101/mikan/labels": [
				{ name: "automation" },
				{ name: "herdr" },
			],
			"GET repos/takemo101/mikan/issues/456": {
				labels: [{ name: "herdr" }, { name: "bug" }, { name: "external" }],
			},
			"PATCH repos/takemo101/mikan/issues/456": {
				number: 456,
				html_url: "https://github.com/takemo101/mikan/issues/456",
			},
		});

		const result = await mirrorIssueToGitHub({
			projectRoot: root,
			config,
			id: "MIK-123",
			runner,
			now,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.action).toBe("updated");
		expect(calls.at(-1)?.body).toMatchObject({
			title: "[MIK-123] Add docs",
			labels: ["bug", "external", "automation"],
		});
		expect(JSON.stringify(calls.at(-1)?.body)).toContain("Status: active");
	});

	test("push requires an existing GitHub Mirror", async () => {
		const root = tempProject();
		writeIssue(root);
		const { runner } = fakeRunner({});

		const result = await pushGitHubMirror({
			projectRoot: root,
			config,
			id: "MIK-123",
			runner,
			now,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected error");
		expect(result.error.message).toContain("Issue has no GitHub Mirror");
	});

	test("fails clearly when github.repo is missing", async () => {
		const root = tempProject();
		writeIssue(root);
		const { runner } = fakeRunner({});

		const result = await mirrorIssueToGitHub({
			projectRoot: root,
			config: { ...config, github: undefined },
			id: "MIK-123",
			runner,
			now,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected error");
		expect(result.error.message).toContain(
			"Set github.repo in .mikan/config.yaml",
		);
	});

	test("returns warnings when missing label creation fails", async () => {
		const root = tempProject();
		writeIssue(root);
		const { runner, calls } = fakeRunner({
			"GET repos/takemo101/mikan/labels": [],
			"POST repos/takemo101/mikan/labels": new Error("forbidden"),
			"POST repos/takemo101/mikan/issues": {
				number: 456,
				html_url: "https://github.com/takemo101/mikan/issues/456",
			},
		});

		const result = await mirrorIssueToGitHub({
			projectRoot: root,
			config,
			id: "MIK-123",
			runner,
			now,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error(result.error.message);
		expect(result.value.warnings).toEqual([
			"Could not create GitHub label automation: forbidden",
			"Could not create GitHub label herdr: forbidden",
		]);
		expect(calls.at(-1)?.body).toMatchObject({ labels: [] });
	});

	test("reports gh CLI/auth failures as user-fixable errors", async () => {
		const root = tempProject();
		writeIssue(root);
		const { runner } = fakeRunner({
			"GET repos/takemo101/mikan/labels": new Error("gh: command not found"),
		});

		const result = await mirrorIssueToGitHub({
			projectRoot: root,
			config,
			id: "MIK-123",
			runner,
			now,
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected error");
		expect(result.error.message).toContain("GitHub Mirror requires the gh CLI");
		expect(result.error.message).toContain("gh auth login");
	});
});
