import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
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
import type { BoardApiResponse } from "../src/index.ts";
import { createBrowserApp } from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-board-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	if (!init.ok) throw new Error("init failed");
	const created = createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Ready issue",
		status: "ready",
		labels: ["automation"],
		now,
	});
	if (!created.ok) throw new Error("createIssue failed");
	return root;
}

function emptyDir(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-browser-empty-"));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-board-assets-"));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function boardApp(projectRoot: string) {
	return createBrowserApp({ assetsDir: tempAssets(), projectRoot });
}

async function getBoard(projectRoot: string): Promise<Response> {
	const app = boardApp(projectRoot);
	return app.fetch(new Request("http://127.0.0.1/api/board"));
}

// Snapshot of every file path + content under a directory, used to prove the
// read-only Board API never writes to the project.
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

describe("GET /api/board", () => {
	test("returns the shared BoardViewModel plus project metadata", async () => {
		const root = tempProject();
		const response = await getBoard(root);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");

		const body = (await response.json()) as BoardApiResponse;
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");

		expect(body.project.key).toBe("MIK");
		expect(body.project.name).toBe("mikan");
		expect(typeof body.project.root).toBe("string");

		expect(body.board.columns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
			"blocked",
			"completed",
		]);
		const ready = body.board.columns.find((column) => column.id === "ready");
		expect(ready?.cards[0]).toMatchObject({
			id: "MIK-001",
			title: "Ready issue",
			labels: ["automation"],
			status: "ready",
			dependencyStatus: "ready",
		});
		expect(body.board.warnings).toEqual([]);
		expect(body.board.warningDetails).toBeUndefined();
		expect(body.board.labels).toContainEqual({
			id: "automation",
			title: "Automation",
		});
	});

	test("propagates board-scan warnings", async () => {
		const root = tempProject();
		writeFileSync(join(root, ".mikan", "ready", "BAD.md"), "---\nid: [\n---\n");

		const response = await getBoard(root);
		const body = (await response.json()) as BoardApiResponse;
		expect(body.ok).toBe(true);
		if (!body.ok) throw new Error("expected ok response");

		expect(body.board.warnings.length).toBeGreaterThan(0);
		expect(
			body.board.warnings.some((w) => w.startsWith("malformed_issue")),
		).toBe(true);
		expect(body.board.warningDetails?.[0]).toMatchObject({
			kind: "malformed_issue",
		});
	});

	test("maps a missing project config to a user-fixable error envelope", async () => {
		const response = await getBoard(emptyDir());
		expect(response.status).toBe(200);
		const body = (await response.json()) as BoardApiResponse;
		expect(body.ok).toBe(false);
		if (body.ok) throw new Error("expected error response");
		expect(body.error.code).toBe("config_not_found");
		expect(typeof body.error.message).toBe("string");
		expect(body.error.message.length).toBeGreaterThan(0);
	});

	test("maps invalid config to an invalid_config error envelope", async () => {
		const root = emptyDir();
		mkdirSync(join(root, ".mikan"), { recursive: true });
		writeFileSync(join(root, ".mikan", "config.yaml"), "project: : :\n");

		const response = await getBoard(root);
		const body = (await response.json()) as BoardApiResponse;
		expect(body.ok).toBe(false);
		if (body.ok) throw new Error("expected error response");
		expect(body.error.code).toBe("invalid_config");
	});

	test("does not write to the project on read", async () => {
		const root = tempProject();
		const before = snapshotTree(join(root, ".mikan"));
		await getBoard(root);
		await getBoard(root);
		const after = snapshotTree(join(root, ".mikan"));
		expect(after).toEqual(before);
	});
});
