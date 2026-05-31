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
	BoardView,
	buildBoardViewModel,
	buildDetailViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
	buildTuiModel,
	buildTuiTheme,
	ColumnPane,
	createTuiAppElement,
	DetailPane,
	DetailView,
	Footer,
	getMoveTargets,
	getSelectedDetails,
	IssueCard,
	keyToDirection,
	LogPane,
	loadTuiModel,
	MovePrompt,
	moveSelectedIssue,
	moveSelection,
	NotePrompt,
	refreshTuiModel,
	renderTuiText,
	TuiAppView,
	type TuiSelection,
} from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");

function collectElementTypes(element: unknown): unknown[] {
	if (!element || typeof element !== "object") return [];
	const node = element as {
		type?: unknown;
		props?: { children?: unknown };
	};
	const children = Array.isArray(node.props?.children)
		? node.props.children
		: [node.props?.children];
	const rendered =
		typeof node.type === "function" ? node.type(node.props) : undefined;
	return [
		node.type,
		...children.flatMap(collectElementTypes),
		...collectElementTypes(rendered),
	];
}

function collectTextContent(element: unknown): string {
	if (!element || typeof element !== "object") return "";
	const node = element as {
		type?: unknown;
		props?: { children?: unknown; content?: unknown };
	};
	const children = Array.isArray(node.props?.children)
		? node.props.children
		: [node.props?.children];
	const rendered =
		typeof node.type === "function" ? node.type(node.props) : undefined;
	return [
		typeof node.props?.content === "string" ? node.props.content : "",
		...children.map(collectTextContent),
		collectTextContent(rendered),
	].join("\n");
}

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

	test("defines semantic theme tokens for TUI surfaces and states", () => {
		const theme = buildTuiTheme();

		expect(theme.base).toMatchObject({
			canvas: expect.any(String),
			surface: expect.any(String),
			text: expect.any(String),
			muted: expect.any(String),
		});
		expect(theme.interactive).toMatchObject({
			accent: expect.any(String),
			focus: expect.any(String),
		});
		expect(theme.feedback).toMatchObject({
			warning: expect.any(String),
			error: expect.any(String),
			success: expect.any(String),
		});
	});

	test("builds a board view model with counts, focus, empty states, and adaptive groups", () => {
		const model = loadTuiModel(tempProject());
		const view = buildBoardViewModel(model, {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
		});

		expect(view.groups.length).toBe(2);
		expect(view.groups[0]?.columns.length).toBe(4);
		expect(view.groups[1]?.columns.length).toBe(1);
		expect(view.columns[1]).toMatchObject({
			id: "ready",
			title: "Ready",
			count: 1,
			active: true,
			empty: false,
		});
		expect(view.columns[1]?.cards[0]).toMatchObject({
			id: "MIK-001",
			selected: true,
			labelsText: "automation",
		});
		expect(view.columns[0]).toMatchObject({
			empty: true,
			emptyText: "No Issues",
		});
	});

	test("builds an OpenTUI component tree with named board layout boundaries", () => {
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			moveOpen: true,
			noteOpen: true,
		};

		const element = createTuiAppElement({ model, selection });
		const tree = TuiAppView({ model, selection });

		expect(element.type).toBe(TuiAppView);
		expect(tree.type).toBe("box");
		expect(collectElementTypes(tree)).toContain(BoardView);
		expect(collectElementTypes(tree)).toContain(ColumnPane);
		expect(collectElementTypes(tree)).toContain(IssueCard);
		expect(collectElementTypes(tree)).toContain(Footer);
		expect(collectElementTypes(tree)).toContain(MovePrompt);
		expect(collectElementTypes(tree)).toContain(NotePrompt);
		expect(collectTextContent(tree)).toContain("malformed_issue");
	});

	test("detail mode switches to split-pane detail boundaries", () => {
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};

		const tree = TuiAppView({ model, selection });

		expect(collectElementTypes(tree)).not.toContain(BoardView);
		expect(collectElementTypes(tree)).toContain(DetailView);
		expect(collectElementTypes(tree)).toContain(DetailPane);
		expect(collectElementTypes(tree)).toContain(LogPane);
		expect(collectTextContent(tree)).toContain("Labels: automation");
		expect(collectTextContent(tree)).toContain("Herdr body");
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

	test("builds a split-pane detail view model with grouped Issues and separated sections", () => {
		const model = loadTuiModel(tempProject());
		const view = buildDetailViewModel(model, {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		});

		expect(view?.selected).toMatchObject({
			id: "MIK-001",
			title: "Ready issue",
			status: "ready",
			labelsText: "automation",
		});
		expect(view?.groups.map((group) => group.status)).toContain("ready");
		expect(view?.groups[1]?.cards[0]).toMatchObject({
			id: "MIK-001",
			selected: true,
		});
		expect(view?.sections.summary).toContain("Ready issue");
		expect(view?.sections.statusLog).toContain("Moved to ready");
		expect(view?.sections.reports).toContain("Report body");
		expect(view?.sections.notes).toContain("Note body");
		expect(view?.sections.herdr).toContain("Herdr body");
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

	test("detail view handles missing optional sections", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Ready issue\nlabels: []\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Ready issue\n`,
		);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};
		const view = buildDetailViewModel(model, selection);
		const text = collectTextContent(TuiAppView({ model, selection }));

		expect(view?.sections.statusLog).toBe("");
		expect(view?.sections.reports).toBe("");
		expect(view?.sections.notes).toBe("");
		expect(view?.sections.herdr).toBe("");
		expect(text).toContain("(empty)");
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

	test("builds focused move and note prompt view models", () => {
		const model = loadTuiModel(tempProject());
		const moveSelectionState: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			moveOpen: true,
			moveTargetIndex: 1,
		};
		const noteSelectionState: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			noteOpen: true,
			noteDraft: "Draft",
			message: "Note cannot be empty",
		};

		expect(buildMovePromptViewModel(model, moveSelectionState)).toMatchObject({
			title: "Move MIK-001",
			focused: true,
			hint: "enter move  esc cancel",
		});
		expect(
			buildMovePromptViewModel(model, moveSelectionState)?.targets[1],
		).toMatchObject({ id: "active", selected: true });
		expect(buildNotePromptViewModel(model, noteSelectionState)).toMatchObject({
			title: "Append note to MIK-001",
			focused: true,
			draft: "Draft",
			feedback: "Note cannot be empty",
			hint: "enter append  esc cancel",
		});
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
