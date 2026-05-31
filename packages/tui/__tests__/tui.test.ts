import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIssue, moveIssue } from "@mikan/core";
import { initProject, loadProjectConfig } from "@mikan/project-config";
import {
	appendSelectedIssueNote,
	applyNoteInput,
	buildTuiModel,
	getMoveTargets,
	getSelectedDetails,
	keyToDirection,
	loadTuiModel,
	moveSelectedIssue,
	moveSelection,
	refreshTuiModel,
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

	test("renders a readable Kanban board with selected card, empty lanes, warnings, and footer", () => {
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
		};

		const text = renderTuiText(model, selection);

		expect(text).toContain("┌─ Backlog ─");
		expect(text).toContain("┌─ Ready ─");
		expect(text).toContain("│ > MIK-001 Ready issue");
		expect(text).toContain("│   [automation]");
		expect(text).toContain("│   (empty)");
		expect(text).toContain("Warnings");
		expect(text).toContain("↑/↓ select");
		expect(text).toContain("←/→ column");
		expect(text).toContain("enter details");
		expect(text).toContain("q quit");
	});

	test("moves selection, opens detail pane, and closes it with escape", () => {
		const model = loadTuiModel(tempProject());
		let selection: TuiSelection = {
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
		};

		selection = moveSelection(model, selection, "right");
		selection = moveSelection(model, selection, "enter");
		selection = moveSelection(model, selection, "escape");

		expect(selection.columnIndex).toBe(1);
		expect(selection.cardIndex).toBe(0);
		expect(selection.detailOpen).toBe(false);
	});

	test("renders detail sections including Summary, Status Log, Reports, Notes, and herdr", () => {
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};
		const details = getSelectedDetails(model, selection);
		const text = renderTuiText(model, selection);

		expect(details?.summary).toContain("Ready issue");
		expect(details?.statusLog).toContain("Moved to ready");
		expect(details?.reports).toContain("Report body");
		expect(details?.notes).toContain("Note body");
		expect(details?.herdr).toContain("Herdr body");
		expect(text).toContain("Detail: MIK-001 Ready issue");
		expect(text).toContain("## Summary");
		expect(text).toContain("## Status Log");
		expect(text).toContain("## Reports");
		expect(text).toContain("## Notes");
		expect(text).toContain("## Herdr");
		expect(text).toContain("esc back");
	});

	test("maps OpenTUI return and escape keys to detail actions", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");

		expect(keyToDirection("return")).toBe("enter");
		expect(keyToDirection("m")).toBeUndefined();
		expect(keyToTuiAction("escape")).toBe("escape");
	});

	test("maps q to the quit action", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");

		expect(keyToTuiAction("q")).toBe("quit");
	});

	test("opens a move interaction with configured target Statuses", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			moveOpen: true,
		};

		expect(keyToTuiAction("m")).toBe("move");
		expect(getMoveTargets(model, selection).map((target) => target.id)).toEqual(
			["backlog", "active", "blocked", "completed"],
		);
		expect(renderTuiText(model, selection)).toContain("Move MIK-001 to Status");
		expect(renderTuiText(model, selection)).toContain("> backlog");
	});

	test("moves the selected Issue through core mutation and refreshes selection", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const result = moveSelectedIssue({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			targetStatus: "backlog",
			now,
		});

		expect(result.ok).toBe(true);
		expect(existsSync(join(cwd, ".mikan", "backlog", "MIK-001.md"))).toBe(true);
		expect(result.selection.columnIndex).toBe(0);
		expect(result.selection.cardIndex).toBe(0);
		expect(result.message).toContain("MIK-001 moved to backlog");
		expect(
			readFileSync(join(cwd, ".mikan", "backlog", "MIK-001.md"), "utf8"),
		).toContain("Moved from ready to backlog");
	});

	test("move interaction reports mutation errors without crashing", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const invalid = moveSelectedIssue({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			targetStatus: "unknown",
			now,
		});
		writeFileSync(join(cwd, ".mikan", ".state", "write.lock"), "held");
		const locked = moveSelectedIssue({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			targetStatus: "backlog",
			now,
		});

		expect(invalid.ok).toBe(false);
		expect(invalid.message).toContain("Unknown Status");
		expect(locked.ok).toBe(false);
		expect(locked.message).toContain("write lock");
	});

	test("opens an append-note interaction for the selected Issue", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");
		const model = loadTuiModel(tempProject());
		const selection = moveSelection(
			model,
			{ columnIndex: 1, cardIndex: 0, detailOpen: false },
			"append-note",
		);

		expect(keyToTuiAction("a")).toBe("append-note");
		expect(selection.noteOpen).toBe(true);
		expect(renderTuiText(model, selection)).toContain("Append note to MIK-001");
		expect(
			renderTuiText(model, applyNoteInput(selection, "a", true)),
		).toContain("Note: A");
		expect(
			applyNoteInput({ ...selection, noteDraft: "A" }, "space").noteDraft,
		).toBe("A ");
		expect(
			applyNoteInput({ ...selection, noteDraft: "AB" }, "backspace").noteDraft,
		).toBe("A");
		expect(moveSelection(model, selection, "escape").noteOpen).toBe(false);
	});

	test("appends a note through core mutation and refreshes details", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const result = appendSelectedIssueNote({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			body: "Fresh note from TUI",
			now,
		});

		expect(result.ok).toBe(true);
		expect(result.message).toContain("MIK-001 note appended");
		expect(
			readFileSync(join(cwd, ".mikan", "ready", "MIK-001.md"), "utf8"),
		).toContain("Fresh note from TUI");
		expect(getSelectedDetails(result.model, result.selection)?.notes).toContain(
			"Fresh note from TUI",
		);
	});

	test("append-note rejects empty submissions", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const result = appendSelectedIssueNote({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			body: "  ",
			now,
		});

		expect(result.ok).toBe(false);
		expect(result.message).toContain("Note cannot be empty");
	});

	test("refresh keeps the selected Issue and open interaction when it still exists", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const refreshed = refreshTuiModel({
			cwd,
			model,
			selection: {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: true,
				moveOpen: true,
				moveTargetIndex: 2,
				noteOpen: true,
				noteDraft: "Draft note",
				message: "Still here",
			},
		});

		expect(refreshed.selection.columnIndex).toBe(1);
		expect(refreshed.selection.cardIndex).toBe(0);
		expect(refreshed.selection.detailOpen).toBe(true);
		expect(refreshed.selection.moveOpen).toBe(true);
		expect(refreshed.selection.moveTargetIndex).toBe(2);
		expect(refreshed.selection.noteOpen).toBe(true);
		expect(refreshed.selection.noteDraft).toBe("Draft note");
		expect(refreshed.selection.message).toBe("Still here");
	});

	test("refresh follows a selected Issue moved by another writer", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const loaded = loadProjectConfig(cwd);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) throw new Error("config failed");
		moveIssue({
			projectRoot: loaded.value.projectRoot,
			config: loaded.value.config,
			id: "MIK-001",
			status: "backlog",
			log: "external move",
			now,
		});

		const refreshed = refreshTuiModel({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
		});

		expect(refreshed.selection.columnIndex).toBe(0);
		expect(refreshed.selection.cardIndex).toBe(0);
	});

	test("refresh falls back safely when the selected Issue disappears", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		unlinkSync(join(cwd, ".mikan", "ready", "MIK-001.md"));

		const refreshed = refreshTuiModel({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: true },
		});

		expect(refreshed.selection.columnIndex).toBe(1);
		expect(refreshed.selection.cardIndex).toBe(0);
		expect(refreshed.selection.detailOpen).toBe(false);
	});

	test("buildTuiModel is pure for startup smoke", () => {
		const model = buildTuiModel({ columns: [], warnings: [] });

		expect(model).toEqual({ columns: [], warnings: [] });
	});
});
