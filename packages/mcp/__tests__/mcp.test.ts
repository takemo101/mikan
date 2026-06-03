import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProject } from "@mikan/project-config";
import {
	appendIssueTool,
	createIssueTool,
	createMikanMcpCli,
	getBoardTool,
	getIssueTool,
	getMcpManifest,
	listIssuesTool,
	moveIssueTool,
	updateIssueTool,
} from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-mcp-"));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	expect(init.ok).toBe(true);
	return root;
}

describe("MCP tools", () => {
	test("schemas are exposed through incur manifest", async () => {
		let stdout = "";
		await createMikanMcpCli({ cwd: tempProject(), now }).serve(["--llms"], {
			stdout: (chunk) => {
				stdout += chunk;
			},
			exit: () => {},
		});

		expect(stdout).toContain("get_board");
		expect(stdout).toContain("list_issues");
		expect(stdout).toContain("get_issue");
		expect(stdout).toContain("create_issue");
		expect(stdout).toContain("move_issue");
		expect(stdout).toContain("depends_on");
		expect(stdout).not.toContain("complete_issue");
	});

	test("getMcpManifest returns the incur-backed discovery manifest", async () => {
		const manifest = await getMcpManifest({ cwd: tempProject(), now });
		expect(manifest).toContain("get_board");
		expect(manifest).toContain("create_issue");
		expect(manifest).toContain("append_issue");

		const full = await getMcpManifest(
			{ cwd: tempProject(), now },
			{ full: true },
		);
		expect(full).toContain("create_issue");
		// The full manifest is more detailed than the summary manifest.
		expect(full.length).toBeGreaterThan(manifest.length);
	});

	test("read tools return board, list, get, archived filtering, and warnings", () => {
		const cwd = tempProject();
		createIssueTool(
			{ title: "Visible", status: "ready", labels: ["automation"] },
			{ cwd, now },
		);
		createIssueTool({ title: "Old", status: "archived" }, { cwd, now });
		writeFileSync(join(cwd, ".mikan", "ready", "BAD.md"), "---\nid: [\n---\n");

		const board = getBoardTool({}, { cwd });
		const archived = getBoardTool({ include_archived: true }, { cwd });
		const listed = listIssuesTool({ status: "ready" }, { cwd });
		const archivedList = listIssuesTool({ status: "archived" }, { cwd });
		const issue = getIssueTool({ id: "MIK-001" }, { cwd });

		expect(board.ok).toBe(true);
		expect(archived.ok).toBe(true);
		expect(listed.ok).toBe(true);
		expect(archivedList.ok).toBe(true);
		expect(issue.ok).toBe(true);
		if (
			!board.ok ||
			!archived.ok ||
			!listed.ok ||
			!archivedList.ok ||
			!issue.ok
		)
			throw new Error("expected ok");
		expect(JSON.stringify(board.data)).not.toContain("archived");
		expect(JSON.stringify(archived.data)).toContain("archived");
		expect(JSON.stringify(listed.data)).toContain("MIK-001");
		expect(JSON.stringify(archivedList.data)).toContain("MIK-002");
		expect(JSON.stringify(issue.data)).toContain("markdown");
		expect(JSON.stringify(board.data)).toContain("malformed_issue");
	});

	test("read tools expose dependency read model fields", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Prerequisite\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Prerequisite\n`,
		);
		writeFileSync(
			join(cwd, ".mikan", "backlog", "MIK-002.md"),
			`---\nid: MIK-002\ntitle: Dependent\ndepends_on:\n  - MIK-001\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Dependent\n`,
		);

		const board = getBoardTool({}, { cwd });
		const listed = listIssuesTool({}, { cwd });
		const issue = getIssueTool({ id: "MIK-002" }, { cwd });

		expect(board.ok).toBe(true);
		expect(listed.ok).toBe(true);
		expect(issue.ok).toBe(true);
		if (!board.ok || !listed.ok || !issue.ok) throw new Error("expected ok");
		for (const data of [board.data, listed.data, issue.data]) {
			const json = JSON.stringify(data);
			expect(json).toContain('"depends_on":["MIK-001"]');
			expect(json).toContain('"unmet_dependencies":["MIK-001"]');
			expect(json).toContain('"dependency_status":"blocked"');
		}
	});

	test("mutation tools create, update, move, append, and reject invalid inputs", () => {
		const cwd = tempProject();
		const created = createIssueTool(
			{ title: "First", labels: ["automation"] },
			{ cwd, now },
		);
		const updated = updateIssueTool(
			{ id: "MIK-001", title: "Updated", labels: ["herdr"] },
			{ cwd, now },
		);
		const moved = moveIssueTool(
			{ id: "MIK-001", status: "blocked", log: "Waiting" },
			{ cwd, now },
		);
		const report = appendIssueTool(
			{
				id: "MIK-001",
				section: "Reports",
				source: "docs-scout",
				body: "Report",
			},
			{ cwd, now },
		);
		const note = appendIssueTool(
			{ id: "MIK-001", section: "Notes", body: "Free note" },
			{ cwd, now },
		);
		const unknown = moveIssueTool(
			{ id: "MIK-001", status: "missing" },
			{ cwd, now },
		);

		expect(created.ok).toBe(true);
		expect(updated.ok).toBe(true);
		expect(moved.ok).toBe(true);
		expect(report.ok).toBe(true);
		expect(note.ok).toBe(true);
		expect(unknown.ok).toBe(false);
		const issue = getIssueTool({ id: "MIK-001" }, { cwd });
		expect(JSON.stringify(issue)).toContain("Updated");
		expect(JSON.stringify(issue)).toContain("blocked");
		expect(JSON.stringify(issue)).toContain("docs-scout");
		expect(JSON.stringify(issue)).toContain("Free note");
	});

	test("create_issue and update_issue accept depends_on dependencies", () => {
		const cwd = tempProject();
		createIssueTool({ title: "Prerequisite" }, { cwd, now });

		const created = createIssueTool(
			{ title: "Dependent", depends_on: ["MIK-001"] },
			{ cwd, now },
		);
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error("expected ok");
		const createdJson = JSON.stringify(created.data);
		expect(createdJson).toContain('"depends_on":["MIK-001"]');
		expect(createdJson).toContain('"unmet_dependencies":["MIK-001"]');
		expect(createdJson).toContain('"dependency_status":"blocked"');

		const updated = updateIssueTool(
			{ id: "MIK-002", depends_on: [] },
			{ cwd, now },
		);
		expect(updated.ok).toBe(true);
		if (!updated.ok) throw new Error("expected ok");
		const updatedJson = JSON.stringify(updated.data);
		expect(updatedJson).toContain('"depends_on":[]');
		expect(updatedJson).toContain('"dependency_status":"ready"');
	});

	test("update_issue without depends_on leaves dependencies unchanged", () => {
		const cwd = tempProject();
		createIssueTool({ title: "Prerequisite" }, { cwd, now });
		createIssueTool(
			{ title: "Dependent", depends_on: ["MIK-001"] },
			{ cwd, now },
		);

		const updated = updateIssueTool(
			{ id: "MIK-002", title: "Renamed" },
			{ cwd, now },
		);
		expect(updated.ok).toBe(true);
		if (!updated.ok) throw new Error("expected ok");
		const json = JSON.stringify(updated.data);
		expect(json).toContain('"title":"Renamed"');
		expect(json).toContain('"depends_on":["MIK-001"]');
	});

	test("depends_on with a malformed Issue ID is rejected", () => {
		const cwd = tempProject();
		const created = createIssueTool(
			{ title: "Dependent", depends_on: ["not-an-id"] },
			{ cwd, now },
		);
		expect(created.ok).toBe(false);

		createIssueTool({ title: "Real" }, { cwd, now });
		const updated = updateIssueTool(
			{ id: "MIK-001", depends_on: ["nope"] },
			{ cwd, now },
		);
		expect(updated.ok).toBe(false);
	});
});
