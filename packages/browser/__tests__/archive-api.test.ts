import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
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
import type { ArchiveResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-archive-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const created = createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Archive issue",
		status: "ready",
		labels: ["automation"],
		now,
	});
	if (!created.ok) throw new Error("createIssue failed");
	return root;
}

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-archive-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

// Default write request: loopback Host plus a same-origin Origin header, the
// shape a real browser POST has. Tests override headers to exercise the guard.
// Archive carries no JSON body.
function archiveRequest(
	id: string,
	init?: { origin?: string | null; url?: string },
): Request {
	const url = init?.url ?? `http://127.0.0.1/api/issues/${id}/archive`;
	const headers: Record<string, string> = {};
	const origin = init && "origin" in init ? init.origin : "http://127.0.0.1";
	if (origin) headers.origin = origin;
	return new Request(url, { method: "POST", headers });
}

async function postArchive(
	projectRoot: string,
	id: string,
	init?: { origin?: string | null; url?: string },
): Promise<Response> {
	const app = createBrowserApp({ assetsDir: tempAssets(), projectRoot });
	return app.fetch(archiveRequest(id, init));
}

function issueFile(root: string, status: string, id: string): string {
	return join(root, ".mikan", status, `${id}.md`);
}

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath ?? dir, entry.name));
}

describe("POST /api/issues/:id/archive", () => {
	test("archives an Issue using core move behavior to the archived Status", async () => {
		const root = tempProject();
		const response = await postArchive(root, "MIK-001");
		expect(response.status).toBe(200);
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		// The reloaded detail reflects the archived Status and new file location.
		expect(payload.issue.status).toBe("archived");

		// The Issue file moved on disk from ready/ to archived/ — it is not deleted.
		expect(existsSync(issueFile(root, "ready", "MIK-001"))).toBe(false);
		expect(existsSync(issueFile(root, "archived", "MIK-001"))).toBe(true);
	});

	test("writes the exact `Archived via mikan browser` Status Log body", async () => {
		const root = tempProject();
		const response = await postArchive(root, "MIK-001");
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		const body = payload.issue.body;
		expect(body).toContain("## Status Log");
		// core records the transition header plus the browser's fixed message.
		expect(body).toContain("Moved from ready to archived");
		expect(body).toContain("Archived via mikan browser");

		// The same Status Log text is persisted to disk under archived/.
		const onDisk = readFileSync(issueFile(root, "archived", "MIK-001"), "utf8");
		expect(onDisk).toContain("Archived via mikan browser");
	});

	test("reloads project state from disk for the mutation", async () => {
		const root = tempProject();
		// Move ready -> active first, then archive observes the persisted location
		// rather than a stale in-memory state.
		const app = createBrowserApp({
			assetsDir: tempAssets(),
			projectRoot: root,
		});
		await app.fetch(
			new Request("http://127.0.0.1/api/issues/MIK-001/move", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://127.0.0.1",
				},
				body: JSON.stringify({ status: "active" }),
			}),
		);
		const response = await postArchive(root, "MIK-001");
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.status).toBe("archived");
		const onDisk = readFileSync(issueFile(root, "archived", "MIK-001"), "utf8");
		expect(onDisk).toContain("Moved from active to archived");
	});

	test("rejects an unknown Issue ID with issue_not_found and no write", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postArchive(root, "MIK-999");
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		expect(payload.error.message).toContain("MIK-999");
		// A failed locate never creates a destination file.
		expect(listFiles(root).sort()).toEqual(before);
	});

	test("maps a configuration without an archived Status to unknown_status", async () => {
		const root = mkdtempSync(join(tmpdir(), "mikan-browser-archive-cfg-"));
		cleanups.push(() => rmSync(root, { recursive: true, force: true }));
		const init = initProject(root, { key: "MIK", name: "mikan" });
		if (!init.ok) throw new Error("init failed");
		// Rewrite config dropping the archived column (its two `id`/`title` lines)
		// so the archive target is unknown; the Issue must stay untouched in ready/.
		const configPath = join(root, ".mikan", "config.yaml");
		const config = readFileSync(configPath, "utf8");
		writeFileSync(
			configPath,
			config.replace(/[ \t]*- id: archived\n[ \t]*title: Archived\n/, ""),
		);
		const created = createIssue({
			projectRoot: root,
			config: init.value.config,
			title: "No archive status",
			status: "ready",
			now,
		});
		if (!created.ok) throw new Error("createIssue failed");
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");

		const response = await postArchive(root, "MIK-001");
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("unknown_status");
		// The Issue stays where it was and is untouched.
		expect(existsSync(issueFile(root, "ready", "MIK-001"))).toBe(true);
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	test("rejects a non-loopback Host before mutating", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postArchive(root, "MIK-001", {
			url: "http://evil.example/api/issues/MIK-001/archive",
			origin: null,
		});
		expect(response.status).toBe(403);
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("forbidden_origin");
		// The guard runs before any mutation: the Issue is untouched.
		expect(existsSync(issueFile(root, "ready", "MIK-001"))).toBe(true);
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	// Cross-site / mismatched-port Origin rejection is unit-tested deterministically
	// in origin-guard.test.ts. Browser-like globals (happy-dom, registered by
	// component tests in the same process) can strip the forbidden Origin header
	// from constructed Requests, so this endpoint suite keeps the reliable
	// non-loopback Host proof for guard-before-mutation behavior.

	test("allows a non-browser request that omits Origin on loopback", async () => {
		const root = tempProject();
		const response = await postArchive(root, "MIK-001", { origin: null });
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(true);
	});

	test("never writes outside the active project root for a traversal ID", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postArchive(root, encodeURIComponent("../../evil"));
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		// No file appeared anywhere under (or outside) the project root.
		expect(listFiles(root).sort()).toEqual(before);
	});

	test("maps a malformed Issue file to a malformed_issue envelope", async () => {
		const root = tempProject();
		writeFileSync(issueFile(root, "ready", "MIK-001"), "---\nid: [\n---\n");
		const response = await postArchive(root, "MIK-001");
		const payload = (await response.json()) as ArchiveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("malformed_issue");
	});
});
