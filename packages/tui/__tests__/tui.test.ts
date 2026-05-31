import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIssue } from "@mikan/core";
import { initProject } from "@mikan/project-config";
import {
	buildTuiModel,
	getSelectedDetails,
	keyToDirection,
	loadTuiModel,
	moveSelection,
	renderTuiText,
	type TuiSelection,
} from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-tui-"));
	const init = initProject(root, { key: "MIK", name: "mikan" });
	expect(init.ok).toBe(true);
	if (!init.ok) throw new Error("init failed");
	createIssue({
		projectRoot: root,
		config: init.value.config,
		title: "Ready issue",
		status: "ready",
		labels: ["automation"],
		now,
	});
	writeFileSync(
		join(root, ".mikan", "ready", "MIK-001.md"),
		`---\nid: MIK-001\ntitle: Ready issue\nlabels:\n  - automation\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Ready issue\n\n## Status Log\n\nMoved to ready\n\n## Reports\n\nReport body\n\n## Notes\n\nNote body\n\n## Herdr\n\nHerdr body\n`,
	);
	writeFileSync(join(root, ".mikan", "ready", "BAD.md"), "---\nid: [\n---\n");
	return root;
}

describe("TUI model and navigation", () => {
	test("loads configured columns, cards, labels, and warnings excluding archived", () => {
		const model = loadTuiModel(tempProject());

		expect(model.columns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
			"blocked",
			"completed",
		]);
		expect(model.columns[1]?.cards[0]).toMatchObject({
			id: "MIK-001",
			title: "Ready issue",
			labels: ["automation"],
		});
		expect(model.warnings.join("\n")).toContain("malformed_issue");
	});

	test("loads hook failure warnings", () => {
		const root = tempProject();
		mkdirSync(join(root, ".mikan", ".state"), { recursive: true });
		writeFileSync(
			join(root, ".mikan", ".state", "hook-log.ndjson"),
			`${JSON.stringify({
				issue_id: "MIK-001",
				command: "false",
				exit_code: 1,
				error: "nope",
			})}\n`,
		);

		const model = loadTuiModel(root);

		expect(model.warnings.join("\n")).toContain("hook_failure");
		expect(model.warnings.join("\n")).toContain("nope");
	});

	test("moves selection and opens detail pane", () => {
		const model = loadTuiModel(tempProject());
		let selection: TuiSelection = {
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
		};

		selection = moveSelection(model, selection, "right");
		selection = moveSelection(model, selection, "enter");

		expect(selection.columnIndex).toBe(1);
		expect(selection.detailOpen).toBe(true);
		expect(renderTuiText(model, selection)).toContain(
			"MIK-001 Ready issue [automation]",
		);
	});

	test("extracts detail sections including Status Log, Reports, Notes, and herdr", () => {
		const model = loadTuiModel(tempProject());
		const details = getSelectedDetails(model, {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		});

		expect(details?.statusLog).toContain("Moved to ready");
		expect(details?.reports).toContain("Report body");
		expect(details?.notes).toContain("Note body");
		expect(details?.herdr).toContain("Herdr body");
	});

	test("maps OpenTUI return key to detail open action", () => {
		expect(keyToDirection("return")).toBe("enter");
	});

	test("buildTuiModel is pure for startup smoke", () => {
		const model = buildTuiModel({ columns: [], warnings: [] });

		expect(model).toEqual({ columns: [], warnings: [] });
	});
});
