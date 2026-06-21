import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIssue } from "@mikan/core";
import { initProject, loadProjectConfig } from "@mikan/project-config";
import type { IssueDetailResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

const ISSUE_BODY = [
	"## Summary",
	"",
	"A **bold** detail with a [link](https://example.com).",
	"",
	"- [x] done",
	"- [ ] todo",
	"",
	"Inline raw <b>html</b> should not render as an element.",
	"",
].join("\n");

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-issue-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const created = createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Detail issue",
		status: "ready",
		labels: ["automation"],
		body: ISSUE_BODY,
		now,
	});
	if (!created.ok) throw new Error("createIssue failed");
	return root;
}

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-issue-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

async function getIssue(projectRoot: string, id: string): Promise<Response> {
	const app = createBrowserApp({ assetsDir: tempAssets(), projectRoot });
	return app.fetch(new Request(`http://127.0.0.1/api/issues/${id}`));
}

function snapshotTree(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const entry of readdirSync(dir, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!entry.isFile()) continue;
		const full = join(entry.parentPath ?? dir, entry.name);
		out[full] = readFileSync(full, "utf8");
	}
	return out;
}

describe("GET /api/issues/:id", () => {
	test("returns the Issue detail payload including Markdown body and metadata", async () => {
		const root = tempProject();
		const response = await getIssue(root, "MIK-001");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");

		const body = (await response.json()) as IssueDetailResponse;
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");

		expect(body.issue.id).toBe("MIK-001");
		expect(body.issue.title).toBe("Detail issue");
		expect(body.issue.status).toBe("ready");
		expect(body.issue.path).toContain("MIK-001.md");
		expect(body.issue.labels).toEqual(["automation"]);
		expect(body.issue.labelTitles).toEqual({ automation: "Automation" });
		expect(body.issue.dependencyStatus).toBe("ready");
		expect(typeof body.issue.createdAt).toBe("string");
		expect(typeof body.issue.updatedAt).toBe("string");
		expect(body.issue.body).toContain("## Summary");
		expect(body.issue.body).toContain("[link](https://example.com)");
	});

	test("returns a user-fixable error envelope for an unknown Issue", async () => {
		const root = tempProject();
		const response = await getIssue(root, "MIK-999");
		expect(response.status).toBe(200);
		const body = (await response.json()) as IssueDetailResponse;
		expect(body.ok).toBe(false);
		if (body.ok) throw new Error("expected error response");
		expect(body.error.code).toBe("issue_not_found");
		expect(body.error.message).toContain("MIK-999");
		expect(body.error.message.length).toBeGreaterThan(0);
	});

	test("maps a malformed Issue file to a malformed_issue envelope", async () => {
		const root = tempProject();
		// Overwrite the Issue file with frontmatter that fails to parse.
		writeFileSync(
			join(root, ".mikan", "ready", "MIK-001.md"),
			"---\nid: [\n---\n",
		);
		const response = await getIssue(root, "MIK-001");
		const body = (await response.json()) as IssueDetailResponse;
		expect(body.ok).toBe(false);
		if (body.ok) throw new Error("expected error response");
		expect(body.error.code).toBe("malformed_issue");
	});

	test("maps a missing project config to a config_not_found envelope", async () => {
		const empty = mkdtempSync(join(tmpdir(), "mikan-browser-issue-empty-"));
		cleanups.push(() => rmSync(empty, { recursive: true, force: true }));
		const response = await getIssue(empty, "MIK-001");
		const body = (await response.json()) as IssueDetailResponse;
		expect(body.ok).toBe(false);
		if (body.ok) throw new Error("expected error response");
		expect(body.error.code).toBe("config_not_found");
	});

	test("does not write to the project on read", async () => {
		const root = tempProject();
		const before = snapshotTree(join(root, ".mikan"));
		await getIssue(root, "MIK-001");
		await getIssue(root, "MIK-001");
		const after = snapshotTree(join(root, ".mikan"));
		expect(after).toEqual(before);
	});
});

// `mirrorTarget` is what the detail GitHub Mirror action confirmation displays.
// It is resolved through `@mikan/github`'s shared rules, so these tests pin the
// target behavior the UI depends on — including the regression that Labels and
// `affects` never choose the target.
describe("GET /api/issues/:id mirrorTarget", () => {
	function appendConfig(root: string, block: string): void {
		const configPath = join(root, ".mikan", "config.yaml");
		writeFileSync(configPath, `${readFileSync(configPath, "utf8")}${block}`);
	}

	async function readIssue(
		root: string,
		id: string,
	): Promise<IssueDetailResponse> {
		const response = await getIssue(root, id);
		return (await response.json()) as IssueDetailResponse;
	}

	test("resolves a single-project target from top-level github.repo", async () => {
		const root = tempProject();
		appendConfig(root, "github:\n  repo: takemo101/mikan\n");
		const body = await readIssue(root, "MIK-001");
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");
		expect(body.issue.mirrorTarget).toEqual({
			ok: true,
			repo: "takemo101/mikan",
		});
	});

	test("surfaces a missing target as an unresolved mirrorTarget", async () => {
		const root = tempProject();
		const body = await readIssue(root, "MIK-001");
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");
		expect(body.issue.mirrorTarget.ok).toBe(false);
		if (body.issue.mirrorTarget.ok) throw new Error("expected unresolved");
		expect(body.issue.mirrorTarget.code).toBe("missing_config");
	});

	test("resolves a workspace target via the primary repository, never labels/affects", async () => {
		const root = mkdtempSync(join(tmpdir(), "mikan-browser-issue-ws-"));
		cleanups.push(() => rmSync(root, { recursive: true, force: true }));
		const init = initProject(root, { key: "MIK", name: "mikan" });
		if (!init.ok) throw new Error("init failed");
		appendConfig(
			root,
			[
				"repositories:",
				"  - id: backend",
				"    title: Backend",
				"    path: backend",
				"    github:",
				"      repo: org/backend",
				"  - id: frontend",
				"    title: Frontend",
				"    path: frontend",
				"    github:",
				"      repo: org/frontend",
				"",
			].join("\n"),
		);
		// Reload config from disk so createIssue uses the workspace repositories.
		const reloaded = loadProjectConfig(root);
		if (!reloaded.ok) throw new Error("reload failed");
		const created = createIssue({
			projectRoot: root,
			config: reloaded.value.config,
			title: "Workspace issue",
			status: "ready",
			repository: "backend",
			affects: ["frontend"],
			labels: ["automation"],
			now,
		});
		if (!created.ok) throw new Error("createIssue failed");

		const body = await readIssue(root, "MIK-001");
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");
		// Primary repository wins; affects (frontend) and labels never decide it.
		expect(body.issue.mirrorTarget).toEqual({ ok: true, repo: "org/backend" });
	});

	test("keeps an existing Mirror's stored repo regardless of config target", async () => {
		const root = tempProject();
		appendConfig(root, "github:\n  repo: takemo101/mikan\n");
		// Inject a github_issue pointing at a different repo than the config target.
		const path = join(root, ".mikan", "ready", "MIK-001.md");
		const original = readFileSync(path, "utf8");
		writeFileSync(
			path,
			original.replace(
				/^---\n/,
				"---\ngithub_issue:\n  repo: takemo101/legacy\n  number: 4\n  url: https://github.com/takemo101/legacy/issues/4\n  last_mirrored_at: 2026-05-30T00:00:00Z\n",
			),
		);
		const body = await readIssue(root, "MIK-001");
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");
		expect(body.issue.mirrorTarget).toEqual({
			ok: true,
			repo: "takemo101/legacy",
		});
	});
});
