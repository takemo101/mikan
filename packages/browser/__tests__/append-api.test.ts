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
import type { AppendResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-append-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const created = createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Append issue",
		status: "ready",
		labels: ["automation"],
		now,
	});
	if (!created.ok) throw new Error("createIssue failed");
	return root;
}

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-append-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

// Default write request: loopback Host plus a same-origin Origin header, the
// shape a real browser POST has. Tests override headers to exercise the guard.
function appendRequest(
	id: string,
	body: unknown,
	init?: { origin?: string | null; url?: string },
): Request {
	const url = init?.url ?? `http://127.0.0.1/api/issues/${id}/append`;
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

async function postAppend(
	projectRoot: string,
	id: string,
	body: unknown,
	init?: { origin?: string | null; url?: string },
): Promise<Response> {
	const app = createBrowserApp({ assetsDir: tempAssets(), projectRoot });
	return app.fetch(appendRequest(id, body, init));
}

function issueFile(root: string, status: string, id: string): string {
	return join(root, ".mikan", status, `${id}.md`);
}

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath ?? dir, entry.name));
}

describe("POST /api/issues/:id/append", () => {
	test("appends a Report to the Issue using core append behavior", async () => {
		const root = tempProject();
		const response = await postAppend(root, "MIK-001", {
			section: "Reports",
			body: "Investigated the failure.",
		});
		expect(response.status).toBe(200);
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.body).toContain("## Reports");
		expect(payload.issue.body).toContain("Investigated the failure.");
		// Reports carry a provenance line naming the browser source.
		expect(payload.issue.body).toContain("mikan-browser");

		const onDisk = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		expect(onDisk).toContain("Investigated the failure.");
	});

	test("appends a Note as plain text without a provenance line", async () => {
		const root = tempProject();
		const response = await postAppend(root, "MIK-001", {
			section: "Notes",
			body: "Remember to check the watcher.",
		});
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.body).toContain("## Notes");
		expect(payload.issue.body).toContain("Remember to check the watcher.");
	});

	test("reloads project state from disk for each mutation", async () => {
		const root = tempProject();
		await postAppend(root, "MIK-001", { section: "Notes", body: "first" });
		await postAppend(root, "MIK-001", { section: "Notes", body: "second" });
		const onDisk = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		// The second append observed the first append's persisted state.
		expect(onDisk).toContain("first");
		expect(onDisk).toContain("second");
	});

	test("rejects an unsupported section with a stable error envelope", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postAppend(root, "MIK-001", {
			section: "Status Log",
			body: "Moved",
		});
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("unsupported_section");
		expect(payload.error.message.length).toBeGreaterThan(0);
		// An unsupported section never writes.
		const after = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		expect(after).toBe(before);
	});

	test("rejects an unknown Issue ID with issue_not_found", async () => {
		const root = tempProject();
		const response = await postAppend(root, "MIK-999", {
			section: "Reports",
			body: "ghost",
		});
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		expect(payload.error.message).toContain("MIK-999");
	});

	test("rejects empty append input with a form-fixable error", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postAppend(root, "MIK-001", {
			section: "Reports",
			body: "   ",
		});
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("empty_append");
		const after = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		expect(after).toBe(before);
	});

	// Cross-site Origin rejection is asserted at the guard level in
	// origin-guard.test.ts: a browser-like global Request (happy-dom, registered by
	// the component tests in this same process) strips the forbidden `Origin`
	// header, so an integration test that depends on setting it is not
	// deterministic across test file ordering. The non-loopback Host check below
	// needs no Origin header and stays a reliable end-to-end guard proof.
	test("rejects a non-loopback Host before mutating", async () => {
		const root = tempProject();
		const response = await postAppend(
			root,
			"MIK-001",
			{ section: "Reports", body: "rebind" },
			{ url: "http://evil.example/api/issues/MIK-001/append", origin: null },
		);
		expect(response.status).toBe(403);
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("forbidden_origin");
	});

	test("allows a non-browser request that omits Origin on loopback", async () => {
		const root = tempProject();
		const response = await postAppend(
			root,
			"MIK-001",
			{ section: "Notes", body: "from a script" },
			{ origin: null },
		);
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(true);
	});

	test("never writes outside the active project root for a traversal ID", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postAppend(root, encodeURIComponent("../../evil"), {
			section: "Reports",
			body: "escape",
		});
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		// No new file appeared anywhere under (or outside) the project root.
		const after = listFiles(root).sort();
		expect(after).toEqual(before);
	});

	test("rejects a malformed JSON body", async () => {
		const root = tempProject();
		const response = await postAppend(root, "MIK-001", "{ not json");
		expect(response.status).toBe(400);
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("invalid_request");
	});

	test("maps a malformed Issue file to a malformed_issue envelope", async () => {
		const root = tempProject();
		writeFileSync(issueFile(root, "ready", "MIK-001"), "---\nid: [\n---\n");
		const response = await postAppend(root, "MIK-001", {
			section: "Reports",
			body: "after corruption",
		});
		const payload = (await response.json()) as AppendResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("malformed_issue");
	});
});
