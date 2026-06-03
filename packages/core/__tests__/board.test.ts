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

const dependencyConfig: BoardConfig = {
	...config,
	board: {
		columns: [
			{ id: "backlog", title: "Backlog" },
			{ id: "ready", title: "Ready" },
			{ id: "completed", title: "Completed" },
			{ id: "archived", title: "Archived" },
		],
	},
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
	dependencies: string[] = [],
): string {
	return `---\nid: ${id}\ntitle: ${title}\nlabels:\n${labels.map((label) => `  - ${label}`).join("\n")}${
		dependencies.length > 0
			? `\ndepends_on:\n${dependencies.map((dependency) => `  - ${dependency}`).join("\n")}`
			: ""
	}\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# ${title}\n`;
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

	test("warns and hides Issues with malformed GitHub Mirror frontmatter", () => {
		const root = tempProject();
		writeIssue(
			root,
			"ready",
			"MIK-001",
			`---\nid: MIK-001\ntitle: Mirrored\ngithub_issue:\n  repo: not-a-repo\n  number: 0\n  url: not a url\n  last_mirrored_at: yesterday\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Mirrored\n`,
		);

		const result = scanBoard({ projectRoot: root, config });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected board");
		expect(result.value.columns.flatMap((column) => column.issues)).toEqual([]);
		expect(result.value.warnings).toContainEqual(
			expect.objectContaining({
				kind: "malformed_issue",
			}),
		);
		expect(result.value.warnings[0]?.message).toContain("github_issue.repo");
	});

	test("derives dependency readiness and warns without hiding Issues", () => {
		const root = tempProject();
		mkdirSync(join(root, ".mikan", "completed"), { recursive: true });
		writeIssue(root, "completed", "MIK-001");
		writeIssue(
			root,
			"ready",
			"MIK-002",
			issue("MIK-002", "Ready", ["automation"], ["MIK-001"]),
		);
		writeIssue(
			root,
			"ready",
			"MIK-003",
			issue("MIK-003", "Blocked", ["automation"], ["MIK-004"]),
		);
		writeIssue(root, "backlog", "MIK-004");

		const result = scanBoard({ projectRoot: root, config: dependencyConfig });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected board");
		const issues = result.value.columns.flatMap((column) => column.issues);
		const ready = issues.find((item) => String(item.issue.id) === "MIK-002");
		const blocked = issues.find((item) => String(item.issue.id) === "MIK-003");
		expect(ready?.dependencyStatus).toBe("ready");
		expect(ready?.unmetDependencies.map(String)).toEqual([]);
		expect(blocked?.dependencyStatus).toBe("blocked");
		expect(blocked?.unmetDependencies.map(String)).toEqual(["MIK-004"]);
		expect(result.value.warnings).toContainEqual(
			expect.objectContaining({
				kind: "dependency_incomplete",
				issueId: "MIK-003",
			}),
		);
	});

	test("warns on missing, archived, self, and cyclic dependencies", () => {
		const root = tempProject();
		mkdirSync(join(root, ".mikan", "completed"), { recursive: true });
		writeIssue(
			root,
			"ready",
			"MIK-001",
			issue("MIK-001", "Missing", ["automation"], ["MIK-999"]),
		);
		writeIssue(
			root,
			"ready",
			"MIK-002",
			issue("MIK-002", "Self", ["automation"], ["MIK-002"]),
		);
		writeIssue(
			root,
			"ready",
			"MIK-003",
			issue("MIK-003", "Cycle A", ["automation"], ["MIK-004"]),
		);
		writeIssue(
			root,
			"ready",
			"MIK-004",
			issue("MIK-004", "Cycle B", ["automation"], ["MIK-003"]),
		);
		writeIssue(root, "archived", "MIK-005");
		writeIssue(
			root,
			"ready",
			"MIK-006",
			issue("MIK-006", "Archived", ["automation"], ["MIK-005"]),
		);

		const result = scanBoard({
			projectRoot: root,
			config: dependencyConfig,
			includeArchived: true,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected board");
		const warningKinds = result.value.warnings.map((warning) => warning.kind);
		expect(warningKinds).toContain("dependency_missing");
		expect(warningKinds).toContain("dependency_self");
		expect(warningKinds).toContain("dependency_cycle");
		expect(warningKinds).toContain("dependency_archived");
		const issueSix = result.value.columns
			.flatMap((column) => column.issues)
			.find((item) => String(item.issue.id) === "MIK-006");
		expect(issueSix?.dependencyStatus).toBe("blocked");
		expect(issueSix?.unmetDependencies.map(String)).toEqual(["MIK-005"]);
	});

	test("includes hook failure log entries as board warnings", () => {
		const root = tempProject();
		writeIssue(root, "backlog", "MIK-001");
		mkdirSync(join(root, ".mikan", ".state"), { recursive: true });
		writeFileSync(
			join(root, ".mikan", ".state", "hook-log.ndjson"),
			`${JSON.stringify({
				timestamp: "2026-05-30T00:00:00Z",
				issue_id: "MIK-001",
				from_status: "backlog",
				to_status: "ready",
				command: "exit 7",
				exit_code: 7,
				error: "boom",
			})}\n`,
		);

		const result = scanBoard({ projectRoot: root, config });

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected board");
		expect(result.value.warnings).toContainEqual(
			expect.objectContaining({
				kind: "hook_failure",
				issueId: "MIK-001",
			}),
		);
		expect(result.value.warnings[0]?.message).toContain("exit 7");
		expect(result.value.warnings[0]?.message).toContain("boom");
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
