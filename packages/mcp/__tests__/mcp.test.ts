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
		expect(stdout).not.toContain("complete_issue");
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
});
