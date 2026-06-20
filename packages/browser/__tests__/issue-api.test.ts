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
import { initProject } from "@mikan/project-config";
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
