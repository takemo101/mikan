import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type BoardConfig,
	findMaxIssueSequence,
	scanBoard,
} from "../src/index.ts";

const config: BoardConfig = {
	board: {
		columns: [
			{ id: "backlog", title: "Backlog" },
			{ id: "ready", title: "Ready" },
			{ id: "archived", title: "Archived" },
		],
	},
	labels: [
		{ id: "automation", title: "Automation" },
		{ id: "herdr", title: "Herdr" },
	],
};

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-board-"));
	for (const status of ["backlog", "ready", "archived"]) {
		mkdirSync(join(root, ".mikan", status), { recursive: true });
	}
	return root;
}

function issue(
	id: string,
	title = id,
	labels: string[] = ["automation"],
): string {
	return `---\nid: ${id}\ntitle: ${title}\nlabels:\n${labels.map((label) => `  - ${label}`).join("\n")}\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# ${title}\n`;
}

function writeIssue(
	root: string,
	status: string,
	id: string,
	body = issue(id),
): string {
	const path = join(root, ".mikan", status, `${id}.md`);
	writeFileSync(path, body);
	return path;
}

describe("board scanner", () => {
	test("returns grouped board snapshot in config order", () => {
		const root = tempProject();
		writeIssue(root, "ready", "MIK-002", issue("MIK-002", "Ready issue"));
		writeIssue(root, "backlog", "MIK-001", issue("MIK-001", "Backlog issue"));

		const result = scanBoard({ projectRoot: root, config });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected board");
		expect(result.value.columns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
		]);
		expect(
			result.value.columns[0]?.issues.map((item) => String(item.issue.id)),
		).toEqual(["MIK-001"]);
		expect(
			result.value.columns[1]?.issues.map((item) => String(item.issue.id)),
		).toEqual(["MIK-002"]);
		expect(result.value.warnings).toEqual([]);
	});

	test("hides archived by default and includes it when requested", () => {
		const root = tempProject();
		writeIssue(root, "archived", "MIK-099");

		const hidden = scanBoard({ projectRoot: root, config });
		const included = scanBoard({
			projectRoot: root,
			config,
			includeArchived: true,
		});

		expect(hidden.ok).toBe(true);
		expect(included.ok).toBe(true);
		if (!hidden.ok || !included.ok) throw new Error("expected board");
		expect(hidden.value.columns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
		]);
		expect(included.value.columns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"archived",
		]);
		expect(
			included.value.columns[2]?.issues.map((item) => String(item.issue.id)),
		).toEqual(["MIK-099"]);
	});

	test("reports duplicates, unknown labels, unknown directories, and malformed files", () => {
		const root = tempProject();
		writeIssue(
			root,
			"backlog",
			"MIK-001",
			issue("MIK-001", "One", ["unknown"]),
		);
		writeIssue(root, "ready", "MIK-001");
		writeIssue(root, "ready", "MIK-002", "---\nid: [\n---\n");
		mkdirSync(join(root, ".mikan", "custom"), { recursive: true });
		writeFileSync(
			join(root, ".mikan", "custom", "MIK-003.md"),
			issue("MIK-003"),
		);

		const result = scanBoard({
			projectRoot: root,
			config,
			includeArchived: true,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected board");
		expect(result.value.warnings.map((warning) => warning.kind).sort()).toEqual(
			[
				"duplicate_issue_id",
				"malformed_issue",
				"unknown_directory",
				"unknown_label",
			],
		);
		expect(
			result.value.columns.flatMap((column) =>
				column.issues.map((item) => String(item.issue.id)),
			),
		).not.toContain("MIK-003");
	});

	test("finds max Issue sequence across configured directories including archived", () => {
		const root = tempProject();
		writeIssue(root, "backlog", "MIK-001");
		writeIssue(root, "archived", "MIK-120");
		writeIssue(root, "ready", "OTHER-999");

		expect(
			findMaxIssueSequence({ projectRoot: root, config, projectKey: "MIK" }),
		).toBe(120);
	});
});
