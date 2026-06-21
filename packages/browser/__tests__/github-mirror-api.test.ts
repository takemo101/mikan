import { afterEach, describe, expect, test } from "bun:test";
import {
	appendFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GhApiRequest, GhApiRunner } from "@mikan/github";
import { initProject } from "@mikan/project-config";
import type { IssueDetailResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-mirror-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

// Build a project whose config enables a GitHub Mirror target. By default it is
// single-project (`github.repo`); pass `repositories` to switch to workspace mode
// (top-level `github.repo` is then never used as a Mirror fallback).
function tempProject(options?: {
	githubRepo?: string;
	repositories?: { id: string; title: string; repo: string }[];
}): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-mirror-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const configPath = join(root, ".mikan", "config.yaml");
	if (options?.repositories) {
		const repos = options.repositories
			.map(
				(repository) =>
					`  - id: ${repository.id}\n    title: ${repository.title}\n    path: ${repository.id}\n    github:\n      repo: ${repository.repo}\n`,
			)
			.join("");
		appendFileSync(configPath, `repositories:\n${repos}`);
	} else {
		appendFileSync(
			configPath,
			`github:\n  repo: ${options?.githubRepo ?? "takemo101/mikan"}\n`,
		);
	}
	return root;
}

// Write an Issue Markdown file directly so the test fully controls frontmatter,
// including the optional `github_issue` Mirror metadata for the update path.
function writeIssue(
	root: string,
	options: {
		id?: string;
		status?: string;
		title?: string;
		labels?: string[];
		repository?: string;
		affects?: string[];
		githubIssue?: { repo: string; number: number; url: string };
	} = {},
): void {
	const id = options.id ?? "MIK-001";
	const status = options.status ?? "ready";
	const labels = options.labels ?? ["automation"];
	const labelsBlock =
		labels.length > 0
			? `labels:\n${labels.map((label) => `  - ${label}`).join("\n")}\n`
			: "labels: []\n";
	const repository = options.repository
		? `repository: ${options.repository}\n`
		: "";
	const affects =
		options.affects && options.affects.length > 0
			? `affects:\n${options.affects.map((entry) => `  - ${entry}`).join("\n")}\n`
			: "";
	const githubIssue = options.githubIssue
		? `github_issue:\n  repo: ${options.githubIssue.repo}\n  number: ${options.githubIssue.number}\n  url: ${options.githubIssue.url}\n  last_mirrored_at: 2026-05-30T00:00:00Z\n`
		: "";
	const markdown = `---\nid: ${id}\ntitle: ${options.title ?? "Mirror issue"}\n${labelsBlock}${repository}${affects}${githubIssue}created_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n## Summary\n\nBody text.\n`;
	writeFileSync(join(root, ".mikan", status, `${id}.md`), markdown);
}

// Records every gh API call and replays canned responses keyed by method+endpoint
// so the route exercises real Mirror behavior without shelling out to `gh`.
function fakeRunner(responses: Record<string, unknown>): {
	runner: GhApiRunner;
	calls: GhApiRequest[];
} {
	const calls: GhApiRequest[] = [];
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

function mirrorRequest(
	id: string,
	init?: { origin?: string | null; url?: string },
): Request {
	const url = init?.url ?? `http://127.0.0.1/api/issues/${id}/github-mirror`;
	const headers: Record<string, string> = {};
	const origin = init && "origin" in init ? init.origin : "http://127.0.0.1";
	if (origin) headers.origin = origin;
	return new Request(url, { method: "POST", headers });
}

async function postMirror(
	projectRoot: string,
	id: string,
	options?: { runner?: GhApiRunner; origin?: string | null; url?: string },
): Promise<Response> {
	const app = createBrowserApp({
		assetsDir: tempAssets(),
		projectRoot,
		githubMirrorRunner: options?.runner,
	});
	return app.fetch(mirrorRequest(id, options));
}

describe("POST /api/issues/:id/github-mirror", () => {
	test("creates a Mirror through core behavior and returns the reloaded detail", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		writeIssue(root, { labels: ["automation"] });
		const { runner, calls } = fakeRunner({
			"GET repos/takemo101/mikan/labels": [{ name: "automation" }],
			"POST repos/takemo101/mikan/issues": {
				number: 7,
				html_url: "https://github.com/takemo101/mikan/issues/7",
			},
		});

		const response = await postMirror(root, "MIK-001", { runner });
		expect(response.status).toBe(200);
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		// The reloaded detail now carries the freshly written github_issue.
		expect(payload.issue.githubIssue).toEqual({
			repo: "takemo101/mikan",
			number: 7,
			url: "https://github.com/takemo101/mikan/issues/7",
			lastMirroredAt: expect.any(String),
		});
		// Delegated to core: it POSTed to the resolved repo's issues endpoint.
		expect(
			calls.some((call) => call.endpoint === "repos/takemo101/mikan/issues"),
		).toBe(true);
		// The github_issue frontmatter was persisted to disk.
		const onDisk = readFileSync(
			join(root, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(onDisk).toContain("github_issue:");
		expect(onDisk).toContain("number: 7");
	});

	test("updates an existing Mirror in its stored repo", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		// Existing Mirror stored in a different repo than the config target; existing
		// Mirrors keep their stored repo and are never retargeted.
		writeIssue(root, {
			labels: ["automation"],
			githubIssue: {
				repo: "takemo101/legacy",
				number: 3,
				url: "https://github.com/takemo101/legacy/issues/3",
			},
		});
		const { runner, calls } = fakeRunner({
			"GET repos/takemo101/legacy/labels": [{ name: "automation" }],
			"GET repos/takemo101/legacy/issues/3": { labels: [] },
			"PATCH repos/takemo101/legacy/issues/3": {
				number: 3,
				html_url: "https://github.com/takemo101/legacy/issues/3",
			},
		});

		const response = await postMirror(root, "MIK-001", { runner });
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.githubIssue?.repo).toBe("takemo101/legacy");
		// It PATCHed the stored repo, never the config repo.
		expect(calls.some((call) => call.method === "PATCH")).toBe(true);
		expect(
			calls.every((call) => !call.endpoint.startsWith("repos/takemo101/mikan")),
		).toBe(true);
	});

	test("resolves a workspace target through the Issue's repository, not labels/affects", async () => {
		const root = tempProject({
			repositories: [
				{ id: "backend", title: "Backend", repo: "org/backend" },
				{ id: "frontend", title: "Frontend", repo: "org/frontend" },
			],
		});
		// Primary repository is backend; affects names frontend and labels are
		// unrelated. The Mirror target must be org/backend regardless.
		writeIssue(root, {
			repository: "backend",
			affects: ["frontend"],
			labels: ["automation"],
		});
		const { runner, calls } = fakeRunner({
			"GET repos/org/backend/labels": [{ name: "automation" }],
			"POST repos/org/backend/issues": {
				number: 11,
				html_url: "https://github.com/org/backend/issues/11",
			},
		});

		const response = await postMirror(root, "MIK-001", { runner });
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.githubIssue?.repo).toBe("org/backend");
		// Never touched the affects repo (frontend) or any label-derived repo.
		expect(calls.every((call) => !call.endpoint.includes("org/frontend"))).toBe(
			true,
		);
	});

	test("maps a missing GitHub config to a structured envelope without calling gh", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		// Strip the github block so no Mirror target is configured.
		const configPath = join(root, ".mikan", "config.yaml");
		writeFileSync(
			configPath,
			readFileSync(configPath, "utf8").replace(/github:\n {2}repo: .*\n/, ""),
		);
		writeIssue(root);
		const { runner, calls } = fakeRunner({});

		const response = await postMirror(root, "MIK-001", { runner });
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("missing_config");
		// Target resolution failed before any GitHub work.
		expect(calls.length).toBe(0);
	});

	test("maps an unknown Issue ID to issue_not_found", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		const { runner } = fakeRunner({});
		const response = await postMirror(root, "MIK-999", { runner });
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("not_found");
		expect(payload.error.message).toContain("MIK-999");
	});

	test("surfaces a gh/GitHub failure as a github_error envelope", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		writeIssue(root, { labels: ["automation"] });
		const { runner } = fakeRunner({
			"GET repos/takemo101/mikan/labels": new Error("gh: not authenticated"),
		});
		const response = await postMirror(root, "MIK-001", { runner });
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("github_error");
	});

	test("rejects a non-loopback Host before any GitHub work", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		writeIssue(root);
		const before = readFileSync(
			join(root, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		const { runner, calls } = fakeRunner({});
		const response = await postMirror(root, "MIK-001", {
			runner,
			url: "http://evil.example/api/issues/MIK-001/github-mirror",
			origin: null,
		});
		expect(response.status).toBe(403);
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("forbidden_origin");
		// The guard runs before any mutation: no gh call, no frontmatter write.
		expect(calls.length).toBe(0);
		expect(
			readFileSync(join(root, ".mikan", "ready", "MIK-001.md"), "utf8"),
		).toBe(before);
	});

	test("allows a non-browser request that omits Origin on loopback", async () => {
		const root = tempProject({ githubRepo: "takemo101/mikan" });
		writeIssue(root, { labels: ["automation"] });
		const { runner } = fakeRunner({
			"GET repos/takemo101/mikan/labels": [{ name: "automation" }],
			"POST repos/takemo101/mikan/issues": {
				number: 9,
				html_url: "https://github.com/takemo101/mikan/issues/9",
			},
		});
		const response = await postMirror(root, "MIK-001", {
			runner,
			origin: null,
		});
		const payload = (await response.json()) as IssueDetailResponse;
		expect(payload.ok).toBe(true);
	});
});
