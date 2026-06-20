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
import type { LabelsResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

// Default config Labels (config order): automation, herdr.
function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-labels-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const created = createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Label issue",
		status: "ready",
		labels: ["automation"],
		now,
	});
	if (!created.ok) throw new Error("createIssue failed");
	return root;
}

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-labels-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function issueFile(root: string, status: string, id: string): string {
	return join(root, ".mikan", status, `${id}.md`);
}

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath ?? dir, entry.name));
}

// Default write request: loopback Host plus a same-origin Origin header, the
// shape a real browser POST has. Tests override headers to exercise the guard.
function labelsRequest(
	id: string,
	body: unknown,
	init?: { origin?: string | null; url?: string },
): Request {
	const url = init?.url ?? `http://127.0.0.1/api/issues/${id}/labels`;
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

async function postLabels(
	projectRoot: string,
	id: string,
	body: unknown,
	init?: { origin?: string | null; url?: string },
): Promise<Response> {
	const app = createBrowserApp({ assetsDir: tempAssets(), projectRoot });
	return app.fetch(labelsRequest(id, body, init));
}

// Read the frontmatter `labels:` list from disk in original order.
function diskLabels(root: string, status: string, id: string): string[] {
	const text = readFileSync(issueFile(root, status, id), "utf8");
	const labels: string[] = [];
	let inLabels = false;
	for (const line of text.split("\n")) {
		if (line.startsWith("labels:")) {
			inLabels = true;
			continue;
		}
		if (inLabels) {
			const match = line.match(/^\s+-\s+(.+)$/);
			const captured = match?.[1];
			if (captured !== undefined) {
				labels.push(captured.trim());
				continue;
			}
			break;
		}
	}
	return labels;
}

describe("POST /api/issues/:id/labels", () => {
	test("updates frontmatter Labels to the selected known Labels", async () => {
		const root = tempProject();
		const response = await postLabels(root, "MIK-001", {
			labels: ["herdr"],
		});
		expect(response.status).toBe(200);
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.labels).toEqual(["herdr"]);
		expect(diskLabels(root, "ready", "MIK-001")).toEqual(["herdr"]);
	});

	test("clears Labels when an empty selection is saved", async () => {
		const root = tempProject();
		const response = await postLabels(root, "MIK-001", { labels: [] });
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.labels).toEqual([]);
		expect(diskLabels(root, "ready", "MIK-001")).toEqual([]);
	});

	test("orders selected known Labels by config order, not request order", async () => {
		const root = tempProject();
		// Request herdr before automation; config order is automation, herdr.
		const response = await postLabels(root, "MIK-001", {
			labels: ["herdr", "automation"],
		});
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		expect(payload.issue.labels).toEqual(["automation", "herdr"]);
		expect(diskLabels(root, "ready", "MIK-001")).toEqual([
			"automation",
			"herdr",
		]);
	});

	test("preserves config-unknown existing Labels after selected known Labels", async () => {
		const root = tempProject();
		// Seed the file with a config-unknown Label between known ones, written
		// directly because core mutations reject unknown Labels on create.
		const path = issueFile(root, "ready", "MIK-001");
		const original = readFileSync(path, "utf8");
		const seeded = original.replace(
			"labels:\n  - automation",
			"labels:\n  - automation\n  - legacy-flag",
		);
		writeFileSync(path, seeded);

		const response = await postLabels(root, "MIK-001", {
			labels: ["herdr"],
		});
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(true);
		if (!payload.ok) throw new Error("expected ok response");
		// Selected known Label first, then the preserved unknown Label.
		expect(payload.issue.labels).toEqual(["herdr", "legacy-flag"]);
		expect(diskLabels(root, "ready", "MIK-001")).toEqual([
			"herdr",
			"legacy-flag",
		]);
	});

	test("does not add Status Log, Reports, or Notes entries", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		await postLabels(root, "MIK-001", { labels: ["herdr"] });
		const after = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		// Body sections are byte-identical: only frontmatter changed.
		const bodyOf = (text: string) =>
			text.split("\n---\n").slice(1).join("\n---\n");
		expect(bodyOf(after)).toBe(bodyOf(before));
		expect(after).not.toContain("Status Log\n\n-");
	});

	test("rejects a config-unknown selected Label with unknown_label and no write", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postLabels(root, "MIK-001", {
			labels: ["nope"],
		});
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("unknown_label");
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	test("rejects a missing labels array with invalid_request and no write", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postLabels(root, "MIK-001", {});
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("invalid_request");
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	test("rejects an unknown Issue ID with issue_not_found and no write", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postLabels(root, "MIK-999", { labels: ["herdr"] });
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		expect(listFiles(root).sort()).toEqual(before);
	});

	test("rejects a non-loopback Host before mutating", async () => {
		const root = tempProject();
		const before = readFileSync(issueFile(root, "ready", "MIK-001"), "utf8");
		const response = await postLabels(
			root,
			"MIK-001",
			{ labels: ["herdr"] },
			{ url: "http://evil.example/api/issues/MIK-001/labels", origin: null },
		);
		expect(response.status).toBe(403);
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("forbidden_origin");
		expect(readFileSync(issueFile(root, "ready", "MIK-001"), "utf8")).toBe(
			before,
		);
	});

	// Cross-site / mismatched-port Origin rejection is unit-tested deterministically
	// in origin-guard.test.ts, which avoids the happy-dom global `Request` pollution
	// that strips the Origin header when component tests run in the same process.

	test("allows a non-browser request that omits Origin on loopback", async () => {
		const root = tempProject();
		const response = await postLabels(
			root,
			"MIK-001",
			{ labels: ["herdr"] },
			{ origin: null },
		);
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(true);
	});

	test("rejects a malformed JSON body", async () => {
		const root = tempProject();
		const response = await postLabels(root, "MIK-001", "{ not json");
		expect(response.status).toBe(400);
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("invalid_request");
	});

	test("never writes outside the active project root for a traversal ID", async () => {
		const root = tempProject();
		const before = listFiles(root).sort();
		const response = await postLabels(root, encodeURIComponent("../../evil"), {
			labels: ["herdr"],
		});
		const payload = (await response.json()) as LabelsResponse;
		expect(payload.ok).toBe(false);
		if (payload.ok) throw new Error("expected error response");
		expect(payload.error.code).toBe("issue_not_found");
		expect(listFiles(root).sort()).toEqual(before);
	});
});
