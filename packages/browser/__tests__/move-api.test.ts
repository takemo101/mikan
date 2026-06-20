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
import type { MoveResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-move-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const created = createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Move issue",
		status: "ready",
		labels: ["automation"],
		now,
	});
	if (!created.ok) throw new Error("createIssue failed");
	return root;
}

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-move-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

// Default write request: loopback Host plus a same-origin Origin header, the
// shape a real browser POST has. Tests override headers to exercise the guard.
function moveRequest(
	id: string,
	body: unknown,
	init?: { origin?: string | null; url?: string },
): Request {
	const url = init?.url ?? `http://127.0.0.1/api/issues/${id}/move`;
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	const origin = init && "origin" in init ? init.origin : "http://127.0.0.1";
	if (origin) headers.origin = origin;
	return new Request(url, {
		method: "POST",
		headers,
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

async function postMove(
	projectRoot: string,
	id: string,
	body: unknown,
	init?: { origin?: string | null; url?: string },
): Promise<Response> {
	const app = createBrowserApp({ assetsDir: tempAssets(), projectRoot });
	return app.fetch(moveRequest(id, body, init));
}

function issueFile(root: string, status: string, id: string): string {
	return join(root, ".mikan", status, `${id}.md`);
}

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath ?? dir, entry.name));
}

describe("POST /api/issues/:id/move", () => {
	test("moves an Issue to the target Status using core move behavior", async () => {
		const root = tempProject();
		const response = await postMove(root, "MIK-001", { status: "active" });
		expect(response.status).toBe(200);
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		// The reloaded detail reflects the new Status and new file location.
		expect(payload.issue.status).toBe("active");

		// The Issue file moved on disk from ready/ to active/.
		expect(existsSync(issueFile(root, "ready", "MIK-001"))).toBe(false);
		expect(existsSync(issueFile(root, "active", "MIK-001"))).toBe(true);
	});

	test("writes the exact `Moved via mikan browser` Status Log body", async () => {
		const root = tempProject();
		const response = await postMove(root, "MIK-001", { status: "active" });
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		const body = payload.issue.body;
		expect(body).toContain("## Status Log");
		// core records the transition header plus the browser's fixed message.
		expect(body).toContain("Moved from ready to active");
		expect(body).toContain("Moved via mikan browser");

		// The same Status Log text is persisted to disk under the new directory.
		const onDisk = readFileSync(issueFile(root, "active", "MIK-001"), "utf8");
		expect(onDisk).toContain("Moved via mikan browser");
	});

	test("reloads project state from disk for each mutation", async () => {
		const root = tempProject();
		// First move ready -> active, then a second move active -> ready observes
		// the first move's persisted location rather than a stale in-memory state.
		await postMove(root, "MIK-001", { status: "active" });
		const second = await postMove(root, "MIK-001", { status: "ready" });
		const payload = (await second.json()) as MoveResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.status).toBe("ready");
		const onDisk = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		// Both transitions are recorded, proving each move read the prior state.
		expect(onDisk).toContain("Moved from ready to active");
		expect(onDisk).toContain("Moved from active to ready");
	});

	test("rejects an unknown Issue ID with issue_not_found and no write", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postMove(root, "MIK-999", { status: "active" });
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		expect(payload.error.message).toContain("MIK-999");
		// A failed locate never creates a destination file.
		expect(listFiles(root).sort()).toEqual(before);
	});

	test("rejects an unknown Status with unknown_status and no write", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postMove(root, "MIK-001", { status: "nope" });
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("unknown_status");
		// The Issue stays where it was and is untouched.
		expect(existsSync(issueFile(root, "ready", "MIK-001"))).toBe(true);
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	test("rejects a missing target Status with a stable error envelope", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postMove(root, "MIK-001", {});
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("invalid_request");
		expect(payload.error.message.length).toBeGreaterThan(0);
		// An invalid request never writes.
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	test("rejects a non-loopback Host before mutating", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postMove(
			root,
			"MIK-001",
			{ status: "active" },
			{ url: "http://evil.example/api/issues/MIK-001/move", origin: null },
		);
		expect(response.status).toBe(403);
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("forbidden_origin");
		// The guard runs before any mutation: the Issue is untouched.
		expect(existsSync(issueFile(root, "ready", "MIK-001"))).toBe(true);
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	test("allows a non-browser request that omits Origin on loopback", async () => {
		const root = tempProject();
		const response = await postMove(
			root,
			"MIK-001",
			{ status: "active" },
			{ origin: null },
		);
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(true);
	});

	test("never writes outside the active project root for a traversal ID", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postMove(root, encodeURIComponent("../../evil"), {
			status: "active",
		});
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		// No file appeared anywhere under (or outside) the project root.
		expect(listFiles(root).sort()).toEqual(before);
	});

	test("rejects a malformed JSON body", async () => {
		const root = tempProject();
		const response = await postMove(root, "MIK-001", "{ not json");
		expect(response.status).toBe(400);
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("invalid_request");
	});

	test("maps a malformed Issue file to a malformed_issue envelope", async () => {
		const root = tempProject();
		writeFileSync(issueFile(root, "ready", "MIK-001"), "---\nid: [\n---\n");
		const response = await postMove(root, "MIK-001", { status: "active" });
		const payload = (await response.json()) as MoveResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("malformed_issue");
	});
});
