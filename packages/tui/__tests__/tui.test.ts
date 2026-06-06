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
import cliPackageJson from "../../cli/package.json" with { type: "json" };
import {
	ArchivePrompt,
	appendSelectedIssueNote,
	applyNoteInput,
	archiveSelectedIssue,
	BoardView,
	beginGitHubMirrorSubmission,
	beginSelectedIssueGitHubMirror,
	buildArchivePromptViewModel,
	buildBoardViewModel,
	buildDetailPageViewModel,
	buildDetailViewModel,
	buildGitHubMirrorPromptViewModel,
	buildLabelPromptViewModel,
	buildMovePromptViewModel,
	buildNotePromptViewModel,
	buildTuiModel,
	buildTuiTheme,
	ColumnPane,
	confirmSelectedIssueGitHubMirror,
	createTuiAppElement,
	DetailPage,
	DetailView,
	Footer,
	GitHubMirrorPrompt,
	getAdjacentMoveTarget,
	getMoveTargets,
	getSelectedDetails,
	Header,
	IssueCard,
	keyToDirection,
	keyToTuiAction,
	LabelPrompt,
	loadTuiModel,
	MIN_COLUMN_WIDTH,
	MovePrompt,
	moveLabelFocus,
	moveSelectedIssue,
	moveSelectedIssueByDirection,
	moveSelection,
	NotePrompt,
	refreshTuiModel,
	renderTuiText,
	TUI_VERSION,
	TuiAppView,
	type TuiGitHubMirrorOperations,
	type TuiModel,
	type TuiSelection,
	toggleFocusedLabel,
	updateSelectedIssueLabels,
	visibleColumnCountForViewport,
} from "../src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");
type FakeGitHubOptions = Parameters<
	NonNullable<TuiGitHubMirrorOperations["pushGitHubMirror"]>
>[0];

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

function styledContentPlain(content: unknown): string {
	if (typeof content === "string") return content;
	if (!content || typeof content !== "object") return "";
	const styled = content as { chunks?: unknown[] };
	return (styled.chunks ?? [])
		.map((chunk) => {
			if (typeof chunk === "string") return chunk;
			if (chunk && typeof chunk === "object") {
				return String((chunk as { text?: unknown }).text ?? "");
			}
			return "";
		})
		.join("");
}

function styledContentChunk(content: unknown, text: string): unknown {
	if (!content || typeof content !== "object") return undefined;
	const styled = content as { chunks?: unknown[] };
	return (styled.chunks ?? []).find(
		(chunk) =>
			chunk &&
			typeof chunk === "object" &&
			(chunk as { text?: unknown }).text === text,
	);
}

function collectTextContent(element: unknown): string {
	if (typeof element === "string" || typeof element === "number") {
		return String(element);
	}
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
		styledContentPlain(node.props?.content),
		...children.map(collectTextContent),
		collectTextContent(rendered),
	].join("");
}

function findElementByType(
	element: unknown,
	type: string,
): { props?: Record<string, unknown> } | undefined {
	if (!element || typeof element !== "object") return undefined;
	const node = element as {
		type?: unknown;
		props?: { children?: unknown };
	};
	if (node.type === type) return node;
	const children = Array.isArray(node.props?.children)
		? node.props.children
		: [node.props?.children];
	const childMatch = children
		.map((child) => findElementByType(child, type))
		.find(Boolean);
	if (childMatch) return childMatch;
	const rendered =
		typeof node.type === "function" ? node.type(node.props) : undefined;
	return findElementByType(rendered, type);
}

function findElementById(
	element: unknown,
	id: string,
):
	| {
			props?: {
				children?: unknown;
				id?: unknown;
				border?: unknown;
				content?: unknown;
				style?: Record<string, unknown>;
				title?: unknown;
				bottomTitle?: unknown;
			};
	  }
	| undefined {
	if (!element || typeof element !== "object") return undefined;
	const node = element as {
		type?: unknown;
		props?: {
			children?: unknown;
			border?: unknown;
			content?: unknown;
			id?: unknown;
			style?: Record<string, unknown>;
			title?: unknown;
			bottomTitle?: unknown;
		};
	};
	if (node.props?.id === id) return node;
	const children = Array.isArray(node.props?.children)
		? node.props.children
		: [node.props?.children];
	const childMatch = children
		.map((child) => findElementById(child, id))
		.find(Boolean);
	if (childMatch) return childMatch;
	const rendered =
		typeof node.type === "function" ? node.type(node.props) : undefined;
	return findElementById(rendered, id);
}

function configureGitHub(root: string, autoPush = false): void {
	const configPath = join(root, ".mikan", "config.yaml");
	writeFileSync(
		configPath,
		`${readFileSync(configPath, "utf8")}github:\n  repo: takemo101/mikan\n  auto_push_mirrors: ${autoPush}\n`,
	);
}

function addGitHubMirrorFrontmatter(
	root: string,
	id: string,
	number: number,
): void {
	const path = join(root, ".mikan", "ready", `${id}.md`);
	writeFileSync(
		path,
		readFileSync(path, "utf8").replace(
			"updated_at: 2026-05-30T00:00:00Z\n---",
			`updated_at: 2026-05-30T00:00:00Z\ngithub_issue:\n  repo: takemo101/mikan\n  number: ${number}\n  url: https://github.com/takemo101/mikan/issues/${number}\n  last_mirrored_at: 2026-05-30T00:00:00Z\n---`,
		),
	);
}

function fakeTuiGithubMirror(number: number, calls: string[] = []) {
	return {
		mirrorIssueToGitHub: async (options: FakeGitHubOptions) => {
			calls.push(`mirror:${options.id}`);
			return {
				ok: true as const,
				value: {
					issue_id: options.id,
					action: "created" as const,
					github_issue: {
						repo: "takemo101/mikan",
						number,
						url: `https://github.com/takemo101/mikan/issues/${number}`,
					},
					warnings: [],
				},
			};
		},
		pushGitHubMirror: async (options: FakeGitHubOptions) => {
			calls.push(`push:${options.id}`);
			return {
				ok: true as const,
				value: {
					issue_id: options.id,
					action: "updated" as const,
					github_issue: {
						repo: "takemo101/mikan",
						number,
						url: `https://github.com/takemo101/mikan/issues/${number}`,
					},
					warnings: [],
				},
			};
		},
	};
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

	test("loads and renders dependency read model in cards and detail", () => {
		const root = tempProject();
		writeFileSync(
			join(root, ".mikan", "ready", "MIK-002.md"),
			`---\nid: MIK-002\ntitle: Dependent issue\ndepends_on:\n  - MIK-001\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Dependent issue\n`,
		);
		const model = loadTuiModel(root);
		const dependent = model.columns[1]?.cards.find(
			(card) => card.id === "MIK-002",
		);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 1,
			detailOpen: true,
		};
		const page = buildDetailPageViewModel(model, selection);
		const text = renderTuiText(model, { ...selection, detailOpen: false });
		const tree = TuiAppView({ model, selection });

		expect(dependent).toMatchObject({
			dependsOn: ["MIK-001"],
			unmetDependencies: ["MIK-001"],
			dependencyStatus: "blocked",
		});
		expect(text).toContain("MIK-002");
		expect(text).toContain("deps!");
		expect(text).not.toContain("🔒");
		expect(page).toMatchObject({
			dependsOnText: "MIK-001",
			unmetDependenciesText: "MIK-001",
			dependencyStatus: "blocked",
			warningCount: 1,
		});
		expect(
			buildDetailPageViewModel(model, {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: true,
			})?.warningCount,
		).toBe(0);
		expect(collectTextContent(tree)).toContain("deps unmet MIK-001");
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
		expect(text).toContain("┌─ ▶ Ready ─");
		expect(text).toContain("│ ▶ MIK-001 Ready issue");
		expect(text).toContain("│ ▶ MIK-001 Ready issue");
		expect(text).toContain("│   (empty)");
		expect(text).toContain("Warnings: 1 malformed_issue | w details");
		expect(text).not.toContain("Flow sequence in block collection");
		expect(text).toContain("Columns: Backlog / Ready / Active ▶");
		expect(text).toContain("↑↓ card | ←→ column");
		expect(text).toContain("enter detail");
		expect(text).toContain("? keys");
	});

	test("renders warning details only when the warning panel is open", () => {
		const model = loadTuiModel(tempProject());

		const boardText = renderTuiText(model, {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
		});
		const warningText = renderTuiText(model, {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			warningsOpen: true,
		});

		expect(boardText).toContain("Warnings: 1 malformed_issue | w details");
		expect(boardText).not.toContain("Flow sequence in block collection");
		expect(warningText).toContain("Warning details");
		expect(warningText).toContain("Flow sequence in block collection");
	});

	test("renders warning details as a centered modal overlay", () => {
		const model = loadTuiModel(tempProject());
		const tree = TuiAppView({
			model,
			selection: {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: false,
				warningsOpen: true,
			},
		});
		const backdrop = findElementById(tree, "warning-panel-backdrop");
		const panel = findElementById(tree, "warning-panel");

		expect(backdrop?.props?.style).toMatchObject({
			alignItems: "center",
			justifyContent: "center",
			position: "absolute",
			zIndex: 10,
		});
		expect(panel?.props).toMatchObject({
			border: true,
			title: "Warning details",
		});
		expect(panel?.props?.style).toMatchObject({
			flexDirection: "column",
			width: "70%",
		});
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

	test("builds a board viewport with counts, focus, empty states, and three visible columns", () => {
		const model = loadTuiModel(tempProject());
		const backlogView = buildBoardViewModel(
			model,
			{ columnIndex: 0, cardIndex: 0, detailOpen: false },
			{ visibleColumnCount: 3 },
		);
		const readyView = buildBoardViewModel(
			model,
			{ columnIndex: 1, cardIndex: 0, detailOpen: false },
			{ visibleColumnCount: 3 },
		);
		const blockedView = buildBoardViewModel(
			model,
			{ columnIndex: 3, cardIndex: 0, detailOpen: false },
			{ visibleColumnCount: 3 },
		);
		const completedView = buildBoardViewModel(
			model,
			{ columnIndex: 4, cardIndex: 0, detailOpen: false },
			{ visibleColumnCount: 3 },
		);

		expect(backlogView.visibleColumns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
		]);
		expect(readyView.visibleColumns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
		]);
		expect(blockedView.visibleColumns.map((column) => column.id)).toEqual([
			"ready",
			"active",
			"blocked",
		]);
		expect(completedView.visibleColumns.map((column) => column.id)).toEqual([
			"active",
			"blocked",
			"completed",
		]);
		expect(readyView.hasColumnsBefore).toBe(false);
		expect(readyView.hasColumnsAfter).toBe(true);
		expect(completedView.hasColumnsBefore).toBe(true);
		expect(completedView.hasColumnsAfter).toBe(false);
		expect(readyView.columns[1]).toMatchObject({
			id: "ready",
			title: "Ready",
			count: 1,
			active: true,
			empty: false,
		});
		expect(readyView.columns[1]?.cards[0]).toMatchObject({
			id: "MIK-001",
			selected: true,
			labelsText: "automation",
		});
		expect(readyView.columns[0]).toMatchObject({
			empty: true,
			emptyText: "No Issues",
		});
	});

	test("derives responsive visible Column count clamped to 2..5", () => {
		expect(MIN_COLUMN_WIDTH).toBe(40);
		// Narrow viewports clamp up to the minimum of 2 Columns.
		expect(visibleColumnCountForViewport(39)).toBe(2);
		expect(visibleColumnCountForViewport(80)).toBe(2);
		// Auto mode waits for wider terminals before showing 4 or 5 Columns.
		expect(visibleColumnCountForViewport(120)).toBe(3);
		expect(visibleColumnCountForViewport(159)).toBe(3);
		expect(visibleColumnCountForViewport(160)).toBe(4);
		expect(visibleColumnCountForViewport(199)).toBe(4);
		expect(visibleColumnCountForViewport(200)).toBe(5);
		// Very wide viewports clamp down to the maximum of 5 Columns.
		expect(visibleColumnCountForViewport(480)).toBe(5);
	});

	test("auto-sizes the board Column viewport from viewport width", () => {
		const model = loadTuiModel(tempProject());
		const selection = { columnIndex: 0, cardIndex: 0, detailOpen: false };

		const narrowView = buildBoardViewModel(model, selection, {
			viewportWidth: MIN_COLUMN_WIDTH,
		});
		const normalView = buildBoardViewModel(model, selection, {
			viewportWidth: MIN_COLUMN_WIDTH * 3,
		});
		const wideView = buildBoardViewModel(model, selection, {
			viewportWidth: MIN_COLUMN_WIDTH * 4,
		});
		const veryWideView = buildBoardViewModel(model, selection, {
			viewportWidth: MIN_COLUMN_WIDTH * 12,
		});

		expect(narrowView.visibleColumns).toHaveLength(2);
		expect(normalView.visibleColumns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
		]);
		expect(wideView.visibleColumns).toHaveLength(4);
		// All five configured Columns fit on a very wide viewport.
		expect(veryWideView.visibleColumns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
			"blocked",
			"completed",
		]);
	});

	test("explicit visibleColumnCount overrides responsive viewport width", () => {
		const model = loadTuiModel(tempProject());
		const selection = { columnIndex: 0, cardIndex: 0, detailOpen: false };

		const fixedView = buildBoardViewModel(model, selection, {
			visibleColumnCount: 3,
			viewportWidth: MIN_COLUMN_WIDTH * 12,
		});

		expect(fixedView.visibleColumns.map((column) => column.id)).toEqual([
			"backlog",
			"ready",
			"active",
		]);
	});

	test("fixed columns mode renders up to five configured Columns", () => {
		const model = loadTuiModel(tempProject());
		const tree = TuiAppView({
			model,
			selection: { columnIndex: 0, cardIndex: 0, detailOpen: false },
			columns: 5,
			viewportWidth: MIN_COLUMN_WIDTH * 2,
		});

		// Fixed count wins over the narrow viewport width: all five Columns show.
		expect(findElementById(tree, "column-backlog")).toBeTruthy();
		expect(findElementById(tree, "column-ready")).toBeTruthy();
		expect(findElementById(tree, "column-active")).toBeTruthy();
		expect(findElementById(tree, "column-blocked")).toBeTruthy();
		expect(findElementById(tree, "column-completed")).toBeTruthy();
		expect(collectTextContent(tree)).toContain(
			"Columns: Backlog / Ready / Active / Blocked / Completed",
		);
	});

	test("auto columns mode derives visible Columns from viewport width", () => {
		const model = loadTuiModel(tempProject());
		const selection = { columnIndex: 0, cardIndex: 0, detailOpen: false };

		const narrow = TuiAppView({
			model,
			selection,
			columns: "auto",
			viewportWidth: MIN_COLUMN_WIDTH * 2,
		});
		const wide = TuiAppView({
			model,
			selection,
			columns: "auto",
			viewportWidth: MIN_COLUMN_WIDTH * 12,
		});

		// Narrow auto viewport clamps to two visible Columns.
		expect(findElementById(narrow, "column-backlog")).toBeTruthy();
		expect(findElementById(narrow, "column-ready")).toBeTruthy();
		expect(findElementById(narrow, "column-active")).toBeUndefined();
		// Wide auto viewport reveals all five configured Columns.
		expect(findElementById(wide, "column-completed")).toBeTruthy();
		expect(collectTextContent(wide)).toContain(
			"Columns: Backlog / Ready / Active / Blocked / Completed",
		);
	});

	test("renders Column viewport indicators when offscreen Columns exist", () => {
		const model = loadTuiModel(tempProject());

		const middleTree = TuiAppView({
			model,
			selection: { columnIndex: 3, cardIndex: 0, detailOpen: false },
		});
		const endTree = TuiAppView({
			model,
			selection: { columnIndex: 4, cardIndex: 0, detailOpen: false },
		});

		expect(collectTextContent(middleTree)).toContain(
			"Columns: ◀ Ready / Active / Blocked ▶",
		);
		expect(collectTextContent(endTree)).toContain(
			"Columns: ◀ Active / Blocked / Completed",
		);
		expect(collectTextContent(endTree)).not.toContain(
			"Active / Blocked / Completed ▶",
		);
	});

	test("windows overflowing Column cards around the selected Issue", () => {
		const model = {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: Array.from({ length: 8 }, (_, index) => ({
						id: `MIK-${String(index + 1).padStart(3, "0")}`,
						title: `Issue ${index + 1}`,
						labels: [],
						status: "ready",
						path: `/tmp/MIK-${String(index + 1).padStart(3, "0")}.md`,
					})),
				},
			],
			warnings: [],
		};

		const view = buildBoardViewModel(
			model,
			{ columnIndex: 0, cardIndex: 5, detailOpen: false },
			{ visibleCardCount: 4 },
		);
		const column = view.columns[0];

		expect(column?.visibleCards.map((card) => card.id)).toEqual([
			"MIK-004",
			"MIK-005",
			"MIK-006",
			"MIK-007",
		]);
		expect(column).toMatchObject({
			hiddenCardsBefore: 3,
			hiddenCardsAfter: 1,
			cardRangeText: "4-7/8 | ↑3 | ↓1",
		});
		expect(column?.visibleCards[2]).toMatchObject({
			id: "MIK-006",
			selected: true,
		});
		if (!column) throw new Error("expected column");
		const tree = ColumnPane({ column });
		const columnElement = findElementById(tree, "column-ready");
		expect(columnElement?.props?.bottomTitle).toBe("4-7/8 | ↑3 | ↓1");
		expect(collectTextContent(tree)).not.toContain("4-7/8 | ↑3 | ↓1");
	});

	test("derives visible Column cards from viewport height", () => {
		const model = {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: Array.from({ length: 40 }, (_, index) => ({
						id: `MIK-${String(index + 1).padStart(3, "0")}`,
						title: `Issue ${index + 1}`,
						labels: [],
						status: "ready",
						path: `/tmp/MIK-${String(index + 1).padStart(3, "0")}.md`,
					})),
				},
			],
			warnings: [],
		};

		const shortView = buildBoardViewModel(
			model,
			{ columnIndex: 0, cardIndex: 4, detailOpen: false },
			{ viewportHeight: 16 },
		);
		const tallView = buildBoardViewModel(
			model,
			{ columnIndex: 0, cardIndex: 4, detailOpen: false },
			{ viewportHeight: 24 },
		);
		const screenshotHeightView = buildBoardViewModel(
			model,
			{ columnIndex: 0, cardIndex: 7, detailOpen: false },
			{ viewportHeight: 36 },
		);

		expect(shortView.columns[0]?.visibleCards).toHaveLength(10);
		expect(tallView.columns[0]?.visibleCards).toHaveLength(18);
		expect(screenshotHeightView.columns[0]?.visibleCards).toHaveLength(30);
		expect(screenshotHeightView.columns[0]?.cardRangeText).toBe(
			"1-30/40 | ↑0 | ↓10",
		);
	});

	test("renders detail Markdown window from viewport height", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Ready issue\nlabels: []\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n${Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n")}\n`,
		);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
			detailScrollOffset: 3,
		};

		const shortPage = buildDetailPageViewModel(model, selection, {
			viewportHeight: 12,
		});
		const tallPage = buildDetailPageViewModel(model, selection, {
			viewportHeight: 18,
		});
		const tree = TuiAppView({ model, selection, viewportHeight: 12 });
		const text = collectTextContent(tree);

		expect(shortPage?.visibleMarkdownLines).toHaveLength(4);
		expect(tallPage?.visibleMarkdownLines).toHaveLength(10);
		expect(shortPage).toMatchObject({
			hiddenLinesBefore: 3,
			hiddenLinesAfter: 23,
			lineRangeText: "Lines: 4-7/30 | ↑3 ↓23",
		});
		expect(text).toContain("MIK-001 │ Ready issue │ Lines: 4-7/30 | ↑3 ↓23");
		expect(text).toContain("ready · labels none");
		expect(text).not.toContain("────────────────");
		expect(text).not.toContain("line 30");
	});

	test("renders detail GitHub Mirror metadata without board card markers", () => {
		const cwd = tempProject();
		configureGitHub(cwd);
		addGitHubMirrorFrontmatter(cwd, "MIK-001", 123);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};

		const page = buildDetailPageViewModel(model, selection);
		const detailTree = TuiAppView({ model, selection });
		const boardText = renderTuiText(model, { ...selection, detailOpen: false });

		expect(model.githubRepo).toBe("takemo101/mikan");
		expect(model.columns[1]?.cards[0]?.githubIssue).toMatchObject({
			repo: "takemo101/mikan",
			number: 123,
		});
		expect(page?.githubText).toBe("GitHub #123");
		expect(collectTextContent(detailTree)).toContain("GitHub #123");
		expect(boardText).not.toContain("GitHub #123");
	});

	test("TUI model exposes configured Labels in config order", () => {
		const model = buildTuiModel(
			{
				columns: [],
				warnings: [],
			},
			[
				{ id: "automation", title: "Automation" },
				{ id: "herdr", title: "Herdr" },
			],
		);

		expect(model.labels).toEqual([
			{ id: "automation", title: "Automation" },
			{ id: "herdr", title: "Herdr" },
		]);
		expect(model.labelTitles).toEqual({
			automation: "Automation",
			herdr: "Herdr",
		});
	});

	test("renders detail label titles while preserving label IDs", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "config.yaml"),
			`project:
  key: MIK
  name: mikan
board:
  columns:
    - id: backlog
      title: Backlog
    - id: ready
      title: Ready
    - id: active
      title: Active
    - id: blocked
      title: Blocked
    - id: completed
      title: Completed
    - id: archived
      title: Archived
labels:
  - id: automation
    title: Automation Work
`,
		);
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---
id: MIK-001
title: Ready issue
labels:
  - automation
created_at: 2026-05-30T00:00:00Z
updated_at: 2026-05-30T00:00:00Z
---

# Ready issue
`,
		);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};

		const page = buildDetailPageViewModel(model, selection);
		const tree = TuiAppView({ model, selection });
		const text = collectTextContent(tree);

		expect(model.columns[1]?.cards[0]?.labels).toEqual(["automation"]);
		expect(page?.labelsText).toBe("Automation Work");
		expect(text).toContain("ready · labels #Automation Work");
		expect(text).not.toContain("ready · labels #automation");
	});

	test("renders detail title and metadata in a fixed header above the scrolling Markdown body", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Ready issue\nlabels: [automation]\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n${Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n")}\n`,
		);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
			detailScrollOffset: 10,
		};

		const theme = buildTuiTheme();
		const tree = TuiAppView({ model, selection, viewportHeight: 14, theme });
		const header = findElementById(tree, "detail-header");
		const body = findElementById(tree, "detail-markdown-body");
		const markdown = findElementById(tree, "detail-markdown");

		expect(header?.props?.style).toMatchObject({ flexShrink: 0 });
		expect(body?.props?.style).toMatchObject({
			flexGrow: 1,
			minHeight: 0,
			overflow: "hidden",
		});
		expect(markdown?.props?.style).toMatchObject({
			flexGrow: 1,
			minHeight: 0,
			overflow: "hidden",
		});
		const headerChildren = Array.isArray(header?.props?.children)
			? header.props.children
			: [header?.props?.children];
		const titleLine = headerChildren[0] as { props?: { content?: unknown } };
		const metaLine = headerChildren[1] as { props?: { content?: unknown } };

		expect(styledContentPlain(titleLine.props?.content)).toBe(
			"MIK-001 │ Ready issue │ Lines: 11-16/30 | ↑10 ↓14",
		);
		expect(
			styledContentChunk(titleLine.props?.content, "MIK-001"),
		).toBeTruthy();
		expect(
			styledContentChunk(titleLine.props?.content, "Ready issue"),
		).toBeTruthy();
		expect(
			styledContentChunk(titleLine.props?.content, "Lines: 11-16/30 | ↑10 ↓14"),
		).toBeTruthy();
		expect(styledContentPlain(metaLine.props?.content)).toBe(
			"ready · labels #Automation",
		);
		expect(styledContentChunk(metaLine.props?.content, "ready")).toBeTruthy();
		expect(
			styledContentChunk(metaLine.props?.content, "#Automation"),
		).toBeTruthy();
		expect(collectTextContent(body)).toContain("line 11");
		expect(collectTextContent(body)).not.toContain("MIK-001 │ Ready issue");
	});

	test("colors blocked detail status as warning instead of success", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "blocked", "MIK-003.md"),
			`---\nid: MIK-003\ntitle: Blocked issue\nlabels: []\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Blocked issue\n`,
		);
		const model = loadTuiModel(cwd);
		const theme = buildTuiTheme();
		const tree = TuiAppView({
			model,
			selection: { columnIndex: 3, cardIndex: 0, detailOpen: true },
			theme,
		});
		const header = findElementById(tree, "detail-header");

		const headerChildren = Array.isArray(header?.props?.children)
			? header.props.children
			: [header?.props?.children];
		const metaLine = headerChildren[1] as { props?: { content?: unknown } };

		expect(styledContentChunk(metaLine.props?.content, "blocked")).toBeTruthy();
	});

	test("omits zero scroll indicators from detail metadata", () => {
		const cwd = tempProject();
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Ready issue\nlabels: []\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n${Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n")}\n`,
		);
		const model = loadTuiModel(cwd);
		const topPage = buildDetailPageViewModel(
			model,
			{ columnIndex: 1, cardIndex: 0, detailOpen: true, detailScrollOffset: 0 },
			{ visibleLineCount: 4 },
		);
		const bottomPage = buildDetailPageViewModel(
			model,
			{ columnIndex: 1, cardIndex: 0, detailOpen: true, detailScrollOffset: 8 },
			{ visibleLineCount: 4 },
		);

		expect(topPage?.lineRangeText).toBe("Lines: 1-4/12 | ↓8");
		expect(bottomPage?.lineRangeText).toBe("Lines: 9-12/12 | ↑8");
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
		const theme = buildTuiTheme();

		expect(element.type).toBe(TuiAppView);
		expect(tree.type).toBe("box");
		expect(collectElementTypes(tree)).toContain(BoardView);
		expect(collectElementTypes(tree)).toContain(ColumnPane);
		expect(collectElementTypes(tree)).toContain(IssueCard);
		expect(collectElementTypes(tree)).toContain(Footer);
		expect(collectElementTypes(tree)).toContain(Header);
		expect(findElementById(tree, "mikan-header")?.props?.style).toMatchObject({
			color: theme.interactive.accent,
		});
		expect(TUI_VERSION).toBe(cliPackageJson.version);
		expect(collectTextContent(tree)).toContain(
			`🍊 mikan v${cliPackageJson.version}`,
		);
		expect(findElementById(tree, "mikan-main")?.props?.style).toMatchObject({
			flexGrow: 1,
		});
		expect(findElementById(tree, "mikan-footer")?.props?.style).toMatchObject({
			marginTop: "auto",
		});
		expect(findElementById(tree, "column-backlog")?.props?.style).toMatchObject(
			{
				width: "33%",
			},
		);
		expect(findElementById(tree, "column-ready")?.props?.style).toMatchObject({
			width: "34%",
		});
		expect(findElementById(tree, "column-ready-lane-fill")).toBeUndefined();
		expect(findElementById(tree, "column-active")?.props?.style).toMatchObject({
			width: "33%",
		});
		expect(findElementById(tree, "column-active-lane-fill")).toBeUndefined();
		expect(findElementById(tree, "column-active-empty")?.props).toMatchObject({
			content: "No Issues",
		});
		expect(collectElementTypes(tree)).toContain(MovePrompt);
		expect(collectElementTypes(tree)).toContain(NotePrompt);
		expect(collectTextContent(tree)).toContain("malformed_issue");
	});

	test("uses a quiet citrus palette for the TUI", () => {
		const theme = buildTuiTheme();

		expect(theme).toMatchObject({
			base: {
				canvas: "#1f1a14",
				surface: "#2a2118",
				text: "#eadfce",
				muted: "#9c8870",
			},
			interactive: {
				accent: "#f0a04b",
				focus: "#f6c177",
				selectedSurface: "#3a2a1d",
			},
			feedback: {
				warning: "#f6c177",
				error: "#d66a4a",
				success: "#8faa5f",
			},
		});
	});

	test("makes active Column and selected Issue visually obvious", () => {
		const model = loadTuiModel(tempProject());
		const theme = buildTuiTheme();
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
		};

		const tree = TuiAppView({ model, selection, theme });
		const column = findElementById(tree, "column-ready");
		const card = findElementById(tree, "card-MIK-001");

		expect(column?.props?.title).toBe("▶ Ready (1)");
		expect(column?.props).toMatchObject({ border: true });
		expect(column?.props?.style).toMatchObject({
			backgroundColor: theme.base.surface,
			borderColor: theme.interactive.accent,
		});
		expect(card?.props).toMatchObject({ border: false });
		expect(card?.props?.style).toMatchObject({
			backgroundColor: theme.interactive.selectedSurface,
			height: 1,
		});
		expect(card?.props?.style?.color).toBeUndefined();
		const cardText = findElementByType(card, "text");
		expect(styledContentPlain(cardText?.props?.content)).toBe(
			"▶ MIK-001 │ Ready issue #automation",
		);
		expect(
			styledContentChunk(cardText?.props?.content, "MIK-001"),
		).toBeTruthy();
		expect(
			styledContentChunk(cardText?.props?.content, "Ready issue"),
		).toBeTruthy();
		expect(collectTextContent(tree)).toContain("▶ MIK-001 │ Ready issue");
	});

	test("renders unselected Cards quietly without label overlap", () => {
		const theme = buildTuiTheme();
		const card = IssueCard({
			card: {
				id: "MIK-002",
				title: "Quiet issue",
				labels: ["automation"],
				status: "ready",
				path: "/tmp/MIK-002.md",
			},
			selected: false,
			theme,
		});

		const cardProps = card.props as {
			border?: unknown;
			style?: Record<string, unknown>;
		};

		expect(cardProps).toMatchObject({ border: false });
		expect(cardProps.style).toMatchObject({
			backgroundColor: theme.base.surface,
			height: 1,
		});
		expect(cardProps.style?.color).toBeUndefined();
		const cardText = findElementByType(card, "text");
		expect(styledContentPlain(cardText?.props?.content)).toBe(
			"MIK-002 │ Quiet issue #automation",
		);
		expect(
			styledContentChunk(cardText?.props?.content, "MIK-002"),
		).toBeTruthy();
		expect(
			styledContentChunk(cardText?.props?.content, "Quiet issue"),
		).toBeTruthy();
		expect(
			styledContentChunk(cardText?.props?.content, "#automation"),
		).toBeTruthy();
	});

	test("renders mode-specific footer hints", () => {
		const model = loadTuiModel(tempProject());
		const boardText = collectTextContent(
			TuiAppView({
				model,
				selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			}),
		);
		const detailText = collectTextContent(
			TuiAppView({
				model,
				selection: { columnIndex: 1, cardIndex: 0, detailOpen: true },
			}),
		);
		const modalText = collectTextContent(
			TuiAppView({
				model,
				selection: {
					columnIndex: 1,
					cardIndex: 0,
					detailOpen: false,
					moveOpen: true,
				},
			}),
		);

		expect(boardText).toContain(
			"Board | ↑↓ card | ←→ column | enter detail | ? keys",
		);
		expect(detailText).toContain("Detail | ↑↓ scroll | esc board | ? keys");
		expect(modalText).toContain("Modal | enter confirm | esc cancel | ? keys");
		expect(detailText).not.toContain("j/k card");
	});

	test("escape closes help before underlying modal state", () => {
		const model = loadTuiModel(tempProject());
		const selection = moveSelection(
			model,
			{
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: false,
				archiveOpen: true,
				helpOpen: true,
			},
			"escape",
		);

		expect(selection).toMatchObject({
			helpOpen: false,
			archiveOpen: true,
		});
	});

	test("renders full key help when help is open", () => {
		const model = loadTuiModel(tempProject());
		const text = collectTextContent(
			TuiAppView({
				model,
				selection: {
					columnIndex: 1,
					cardIndex: 0,
					detailOpen: false,
					helpOpen: true,
				},
			}),
		);

		expect(text).toContain("Key help");
		expect(text).toContain("H/L move Issue");
		expect(text).toContain("m move menu");
		expect(text).toContain("w warning details");
		expect(text).toContain("n append Note");
		expect(text).toContain("note: enter newline, ctrl+s save");
		expect(text).toContain("e edit Labels");
	});

	test("detail mode switches to a polished full-page Markdown detail page", () => {
		const model = loadTuiModel(tempProject());
		const theme = buildTuiTheme();
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};

		const tree = TuiAppView({ model, selection, theme });
		const page = buildDetailPageViewModel(model, selection);
		const detailPage = findElementById(tree, "detail-page");

		expect(collectElementTypes(tree)).not.toContain(BoardView);
		expect(collectElementTypes(tree)).toContain(DetailPage);
		expect(collectElementTypes(tree)).not.toContain(DetailView);
		expect(detailPage?.props).toMatchObject({
			border: true,
			title: "Detail",
		});
		expect(detailPage?.props?.style).toMatchObject({
			borderColor: theme.interactive.accent,
		});
		expect(page).toMatchObject({
			id: "MIK-001",
			title: "Ready issue",
			status: "ready",
			labelsText: "Automation",
		});
		expect(page?.markdown).toContain("# Ready issue");
		expect(collectTextContent(tree)).toContain("MIK-001 │ Ready issue");
		expect(collectTextContent(tree)).toContain("ready · labels #Automation");
		expect(collectTextContent(tree)).toContain("# Ready issue");
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

	test("keeps board mode when opening detail on an empty Column", () => {
		const model = loadTuiModel(tempProject());
		const selection = moveSelection(
			model,
			{ columnIndex: 0, cardIndex: 0, detailOpen: false },
			"enter",
		);

		expect(selection).toMatchObject({
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
			message: "No Issue selected",
		});
		expect(renderTuiText(model, selection)).toContain("Board | ↑↓ card");
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
			labelsText: "Automation",
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

	test("detail page scrolls Markdown independently from board selection", () => {
		const cwd = tempProject();
		const bodyLines = Array.from(
			{ length: 45 },
			(_, index) => `line ${index + 1}`,
		).join("\n");
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Ready issue\nlabels: []\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Ready issue\n\n${bodyLines}\n`,
		);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};
		const down = moveSelection(model, selection, "down");
		const downAgain = moveSelection(model, down, "down");
		let downClamped = downAgain;
		for (let index = 0; index < 100; index++) {
			downClamped = moveSelection(model, downClamped, "down");
		}
		const up = moveSelection(model, downClamped, "up");
		const page = buildDetailPageViewModel(model, downAgain, {
			visibleLineCount: 2,
		});

		expect(down.columnIndex).toBe(1);
		expect(down.cardIndex).toBe(0);
		expect(down.detailScrollOffset).toBe(1);
		expect(downClamped.detailScrollOffset).toBe(7);
		expect(up.detailScrollOffset).toBe(6);
		expect(page?.visibleMarkdownLines).toEqual(["line 1", "line 2"]);
	});

	test("detail page ignores left and right column navigation", () => {
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
			detailScrollOffset: 2,
		};

		const left = moveSelection(model, selection, "left");
		const right = moveSelection(model, selection, "right");

		expect(left).toMatchObject(selection);
		expect(right).toMatchObject(selection);
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
		expect(text).toContain("# Ready issue");
	});

	test("maps OpenTUI return and escape keys to detail actions", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");

		expect(keyToDirection("return")).toBe("enter");
		expect(keyToDirection("h")).toBe("left");
		expect(keyToDirection("l")).toBe("right");
		expect(keyToDirection("j")).toBe("down");
		expect(keyToDirection("k")).toBe("up");
		expect(keyToDirection("m")).toBeUndefined();
		expect(keyToTuiAction("r")).toBe("reload");
		expect(keyToTuiAction("h", true)).toBe("move-left");
		expect(keyToTuiAction("l", true)).toBe("move-right");
		expect(keyToTuiAction("H")).toBe("move-left");
		expect(keyToTuiAction("L")).toBe("move-right");
		expect(keyToTuiAction("w")).toBe("warnings");
		expect(keyToTuiAction("?")).toBe("help");
		expect(keyToTuiAction("escape")).toBe("escape");
	});

	test("moves selected Issue left and right by Status order", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
		};

		expect(getAdjacentMoveTarget(model, selection, "left")).toMatchObject({
			id: "backlog",
		});
		expect(getAdjacentMoveTarget(model, selection, "right")).toMatchObject({
			id: "active",
		});
		const moved = moveSelectedIssueByDirection({
			cwd,
			model,
			selection,
			direction: "left",
			now,
		});

		expect(moved.ok).toBe(true);
		expect(moved.message).toContain("MIK-001 moved to backlog");
		expect(moved.selection.columnIndex).toBe(0);
	});

	test("maps q to the quit action", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");

		expect(keyToTuiAction("q")).toBe("quit");
	});

	test("scopes action feedback to the footer instead of rendering a separate message row", () => {
		const model = loadTuiModel(tempProject());
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			message: "MIK-001 moved to backlog",
		};

		const tree = TuiAppView({ model, selection });
		const footer = findElementById(tree, "mikan-footer") as
			| { props?: { content?: unknown } }
			| undefined;

		expect(footer?.props?.content).toBe(
			"Board | ↑↓ card | ←→ column | enter detail | ? keys    MIK-001 moved to backlog",
		);
		expect(
			collectTextContent(tree).match(/MIK-001 moved to backlog/g) ?? [],
		).toHaveLength(1);
		expect(renderTuiText(model, selection)).toContain(
			"Board | ↑↓ card | ←→ column | enter detail | ? keys    MIK-001 moved to backlog",
		);
		expect(renderTuiText(model, selection)).not.toContain(
			"\nMIK-001 moved to backlog\n\nBoard |",
		);
	});

	test("opens a Label editor with selected Labels as a draft", async () => {
		const model: TuiModel = {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: [
						{
							id: "MIK-001",
							title: "Ready issue",
							labels: ["automation", "legacy-label"],
							status: "ready",
							path: "/tmp/MIK-001.md",
						},
					],
				},
			],
			warnings: [],
			labels: [
				{ id: "automation", title: "Automation" },
				{ id: "herdr", title: "Herdr" },
			],
			labelTitles: { automation: "Automation", herdr: "Herdr" },
		};
		const selection = moveSelection(
			model,
			{ columnIndex: 0, cardIndex: 0, detailOpen: false },
			"edit-labels",
		);

		expect(keyToTuiAction("e")).toBe("edit-labels");
		expect(selection.labelOpen).toBe(true);
		expect(selection.labelDraftIds).toEqual(["automation"]);
		expect(selection.labelFocusIndex).toBe(0);
	});

	test("builds Label prompt view model with checked known Labels and read-only unknown Labels", () => {
		const model: TuiModel = {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: [
						{
							id: "MIK-001",
							title: "Ready issue",
							labels: ["automation", "legacy-label"],
							status: "ready",
							path: "/tmp/MIK-001.md",
						},
					],
				},
			],
			warnings: [],
			labels: [
				{ id: "automation", title: "Automation" },
				{ id: "herdr", title: "Herdr" },
			],
			labelTitles: { automation: "Automation", herdr: "Herdr" },
		};

		const view = buildLabelPromptViewModel(model, {
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
			labelOpen: true,
			labelFocusIndex: 1,
			labelDraftIds: ["automation", "herdr"],
		});

		expect(view).toMatchObject({
			title: "Edit Labels for MIK-001",
			focused: true,
			hint: "space toggle  enter save  esc cancel",
			unknownLabels: ["legacy-label"],
		});
		expect(view?.labels).toEqual([
			{
				id: "automation",
				title: "Automation",
				checked: true,
				focused: false,
			},
			{ id: "herdr", title: "Herdr", checked: true, focused: true },
		]);
	});

	test("moves Label focus and toggles focused Label draft", () => {
		const model: TuiModel = {
			columns: [],
			warnings: [],
			labels: [
				{ id: "automation", title: "Automation" },
				{ id: "herdr", title: "Herdr" },
			],
			labelTitles: { automation: "Automation", herdr: "Herdr" },
		};
		const focused = moveLabelFocus(
			model,
			{
				columnIndex: 0,
				cardIndex: 0,
				detailOpen: false,
				labelOpen: true,
				labelFocusIndex: 0,
				labelDraftIds: ["automation"],
			},
			"down",
		);
		const toggled = toggleFocusedLabel(model, focused);

		expect(focused.labelFocusIndex).toBe(1);
		expect(toggled.labelDraftIds).toEqual(["automation", "herdr"]);
	});

	test("escape closes Label editor without saving draft", () => {
		const model: TuiModel = {
			columns: [],
			warnings: [],
			labels: [{ id: "automation", title: "Automation" }],
			labelTitles: { automation: "Automation" },
		};
		const closed = moveSelection(
			model,
			{
				columnIndex: 0,
				cardIndex: 0,
				detailOpen: false,
				labelOpen: true,
				labelDraftIds: [],
			},
			"escape",
		);

		expect(closed.labelOpen).toBe(false);
		expect(closed.labelDraftIds).toEqual([]);
	});

	test("renders Label editor modal with checked and unknown Labels", () => {
		const model: TuiModel = {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: [
						{
							id: "MIK-001",
							title: "Ready issue",
							labels: ["automation", "legacy-label"],
							status: "ready",
							path: "/tmp/MIK-001.md",
						},
					],
				},
			],
			warnings: [],
			labels: [
				{ id: "automation", title: "Automation" },
				{ id: "herdr", title: "Herdr" },
			],
			labelTitles: { automation: "Automation", herdr: "Herdr" },
		};

		const tree = TuiAppView({
			model,
			selection: {
				columnIndex: 0,
				cardIndex: 0,
				detailOpen: false,
				labelOpen: true,
				labelFocusIndex: 0,
				labelDraftIds: ["automation"],
			},
		});
		const text = collectTextContent(tree);

		expect(collectElementTypes(tree)).toContain(LabelPrompt);
		expect(text).toContain("Edit Labels for MIK-001");
		expect(text).toContain("▶ [x] Automation");
		expect(text).toContain("  [ ] Herdr");
		expect(text).toContain("Unknown Labels (read-only): legacy-label");
	});

	test("renders explanatory Label modal when no Labels are configured", () => {
		const model: TuiModel = {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: [
						{
							id: "MIK-001",
							title: "Ready issue",
							labels: [],
							status: "ready",
							path: "/tmp/MIK-001.md",
						},
					],
				},
			],
			warnings: [],
			labels: [],
			labelTitles: {},
		};

		const text = renderTuiText(model, {
			columnIndex: 0,
			cardIndex: 0,
			detailOpen: false,
			labelOpen: true,
		});

		expect(text).toContain(
			"No Labels configured. Add Labels in .mikan/config.yaml.",
		);
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
			noteCursorOffset: 5,
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
			inputLines: ["Draft▌"],
			hint: "enter newline  ctrl+s save  esc cancel",
		});
		expect(buildNotePromptViewModel(model, noteSelectionState)?.feedback).toBe(
			undefined,
		);

		const longNote = "one\ntwo\nthree\nfour\nfive\nsix";
		expect(
			buildNotePromptViewModel(model, {
				...noteSelectionState,
				noteDraft: longNote,
				noteCursorOffset: longNote.length,
			})?.inputLines,
		).toEqual(["two", "three", "four", "five", "six▌"]);
		expect(
			buildNotePromptViewModel(model, {
				...noteSelectionState,
				noteDraft: longNote,
				noteCursorOffset: "one\ntwo".length,
			})?.inputLines,
		).toEqual(["one", "two▌"]);
	});

	test("renders GitHub Mirror confirmation modal", async () => {
		const cwd = tempProject();
		configureGitHub(cwd);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			githubConfirmOpen: true,
		};

		const prompt = buildGitHubMirrorPromptViewModel(model, selection);
		const tree = TuiAppView({ model, selection });
		const text = collectTextContent(tree);

		expect(prompt).toMatchObject({
			title: "Create GitHub Mirror for MIK-001?",
			focused: true,
		});
		expect(prompt?.body).toContain("Ready issue");
		expect(prompt?.body).toContain("Repo: takemo101/mikan");
		expect(prompt?.body).toContain(
			"Local Markdown remains the source of truth",
		);
		expect(collectElementTypes(tree)).toContain(GitHubMirrorPrompt);
		expect(findElementById(tree, "github-mirror-prompt")).toBeTruthy();
		expect(text).toContain("enter create  esc cancel");
	});

	test("renders move and note interactions as centered modal overlays", () => {
		const model = loadTuiModel(tempProject());
		const theme = buildTuiTheme();
		const moveSelectionState: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			moveOpen: true,
		};
		const noteSelectionState: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			noteOpen: true,
			noteDraft: "Draft",
			noteCursorOffset: 5,
		};

		const moveTree = TuiAppView({
			model,
			selection: moveSelectionState,
			theme,
		});
		const noteTree = TuiAppView({
			model,
			selection: noteSelectionState,
			theme,
		});
		const moveBackdrop = findElementById(moveTree, "move-modal-backdrop");
		const moveModal = findElementById(moveTree, "move-prompt");
		const noteBackdrop = findElementById(noteTree, "note-modal-backdrop");
		const noteModal = findElementById(noteTree, "note-prompt");

		expect(moveBackdrop?.props?.style).toMatchObject({
			alignItems: "center",
			justifyContent: "center",
		});
		expect(moveBackdrop?.props?.style).not.toHaveProperty("backgroundColor");
		expect(moveModal?.props).toMatchObject({ border: true });
		expect(moveModal?.props?.style).toMatchObject({
			backgroundColor: theme.base.surface,
			borderColor: theme.interactive.focus,
		});
		expect(noteBackdrop?.props?.style).toMatchObject({
			alignItems: "center",
			justifyContent: "center",
		});
		expect(noteBackdrop?.props?.style).not.toHaveProperty("backgroundColor");
		expect(noteModal?.props).toMatchObject({ border: true });
		expect(noteModal?.props?.style).toMatchObject({
			backgroundColor: theme.base.surface,
			borderColor: theme.interactive.focus,
		});
		const noteText = collectTextContent(noteTree);
		expect(noteText).toContain("Note:");
		expect(noteText).toContain("Draft▌");
		expect(noteText).toContain("enter newline  ctrl+s save  esc cancel");
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

		expect(keyToTuiAction("n")).toBe("append-note");
		expect(keyToTuiAction("a")).toBe("archive");
		expect(selection.noteOpen).toBe(true);
		expect(renderTuiText(model, selection)).toContain("Append note to MIK-001");
		const typedNoteText = renderTuiText(
			model,
			applyNoteInput(selection, "a", true),
		);
		expect(typedNoteText).toContain("Note:");
		expect(typedNoteText).toContain("A▌");
		expect(
			applyNoteInput(
				{ ...selection, noteDraft: "A", noteCursorOffset: 1 },
				"space",
			).noteDraft,
		).toBe("A ");
		expect(
			applyNoteInput(
				{ ...selection, noteDraft: "AB", noteCursorOffset: 2 },
				"backspace",
			).noteDraft,
		).toBe("A");
		expect(
			applyNoteInput(
				{ ...selection, noteDraft: "A", noteCursorOffset: 1 },
				"enter",
			).noteDraft,
		).toBe("A\n");
		expect(keyToTuiAction("s", false, true)).toBe("save-note");
		expect(moveSelection(model, selection, "escape").noteOpen).toBe(false);
	});

	test("edits Note drafts with a line-local cursor", () => {
		const base: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
			noteOpen: true,
			noteDraft: "abc",
			noteCursorOffset: 1,
		};
		const inserted = applyNoteInput(base, "X");
		const left = applyNoteInput(base, "left");
		const leftBound = applyNoteInput({ ...base, noteCursorOffset: 0 }, "left");
		const right = applyNoteInput(base, "right");
		const multiline: TuiSelection = {
			...base,
			noteDraft: "ab\ncd",
			noteCursorOffset: 3,
		};
		const rightLineEnd = applyNoteInput(
			{ ...multiline, noteCursorOffset: 5 },
			"right",
		);
		const backspaced = applyNoteInput(
			{ ...base, noteDraft: "abcd", noteCursorOffset: 2 },
			"backspace",
		);
		const newlineInserted = applyNoteInput(
			{ ...base, noteDraft: "abcd", noteCursorOffset: 2 },
			"enter",
		);

		expect(inserted.noteDraft).toBe("aXbc");
		expect(inserted.noteCursorOffset).toBe(2);
		expect(left.noteCursorOffset).toBe(0);
		expect(leftBound.noteCursorOffset).toBe(0);
		expect(right.noteCursorOffset).toBe(2);
		expect(applyNoteInput(multiline, "left").noteCursorOffset).toBe(3);
		expect(rightLineEnd.noteCursorOffset).toBe(5);
		expect(backspaced.noteDraft).toBe("acd");
		expect(backspaced.noteCursorOffset).toBe(1);
		expect(newlineInserted.noteDraft).toBe("ab\ncd");
		expect(newlineInserted.noteCursorOffset).toBe(3);
	});

	test("updates selected Issue Labels through core mutation and preserves unknown Labels", () => {
		const cwd = tempProject();
		const init = initProject(cwd, { key: "MIK", name: "mikan" });
		expect(init.ok).toBe(true);
		if (!init.ok) throw new Error("expected init");
		writeFileSync(
			join(cwd, ".mikan", "config.yaml"),
			`project:
  key: MIK
  name: mikan
board:
  columns:
    - id: ready
      title: Ready
labels:
  - id: automation
    title: Automation
  - id: herdr
    title: Herdr
`,
		);
		writeFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			`---
id: MIK-001
title: Ready issue
labels:
  - legacy-label
created_at: 2026-05-30T00:00:00Z
updated_at: 2026-05-30T00:00:00Z
---

# Ready issue
`,
		);
		const model = loadTuiModel(cwd);
		const result = updateSelectedIssueLabels({
			cwd,
			model,
			selection: {
				columnIndex: 0,
				cardIndex: 0,
				detailOpen: false,
				labelOpen: true,
				labelDraftIds: ["herdr", "automation"],
			},
			now: () => new Date("2026-05-30T01:00:00Z"),
		});

		expect(result.ok).toBe(true);
		expect(result.message).toBe("MIK-001 Labels updated");
		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);
		expect(markdown).toContain(
			"labels:\n  - automation\n  - herdr\n  - legacy-label",
		);
		expect(markdown).not.toContain("Labels updated via TUI");
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

	test("appends multiline Note Markdown and keeps empty submissions open", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const empty = appendSelectedIssueNote({
			cwd,
			model,
			selection: {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: false,
				noteOpen: true,
				noteDraft: "   ",
			},
			body: "   ",
			now,
		});
		const result = appendSelectedIssueNote({
			cwd,
			model,
			selection: { columnIndex: 1, cardIndex: 0, detailOpen: false },
			body: "Line one\n- Line two",
			now,
		});
		const markdown = readFileSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			"utf8",
		);

		expect(empty.ok).toBe(false);
		expect(empty.selection.noteOpen).toBe(true);
		expect(empty.message).toContain("Note cannot be empty");
		expect(result.ok).toBe(true);
		expect(markdown).toContain("Line one\n- Line two");
		expect(markdown).not.toContain("▌");
	});

	test("opens and cancels a GitHub Mirror confirmation modal", async () => {
		const cwd = tempProject();
		configureGitHub(cwd);
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
		};

		const opened = await beginSelectedIssueGitHubMirror({
			cwd,
			model,
			selection,
		});
		const cancelled = moveSelection(model, opened.selection, "escape");

		expect(keyToTuiAction("g")).toBe("github");
		expect(opened.ok).toBe(true);
		expect(opened.selection.githubConfirmOpen).toBe(true);
		expect(cancelled.githubConfirmOpen).toBe(false);
	});

	test("closes the GitHub Mirror modal while submission is running", () => {
		const selection = beginGitHubMirrorSubmission({
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
			githubConfirmOpen: true,
		});

		expect(selection.githubConfirmOpen).toBe(false);
		expect(selection.githubBusy).toBe(true);
		expect(selection.message).toBe("GitHub mirror running...");
	});

	test("creates and pushes GitHub Mirrors from the selected Issue", async () => {
		const cwd = tempProject();
		configureGitHub(cwd);
		const calls: string[] = [];
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: true,
			githubConfirmOpen: true,
		};

		const created = await confirmSelectedIssueGitHubMirror({
			cwd,
			model,
			selection,
			githubMirror: fakeTuiGithubMirror(123, calls),
		});
		addGitHubMirrorFrontmatter(cwd, "MIK-001", 123);
		const pushed = await beginSelectedIssueGitHubMirror({
			cwd,
			model: loadTuiModel(cwd),
			selection,
			githubMirror: fakeTuiGithubMirror(123, calls),
		});

		expect(created.ok).toBe(true);
		expect(created.message).toBe("GitHub mirror created #123");
		expect(created.selection.githubConfirmOpen).toBe(false);
		expect(pushed.ok).toBe(true);
		expect(pushed.message).toBe("GitHub mirror pushed #123");
		expect(calls).toEqual(["mirror:MIK-001", "push:MIK-001"]);
	});

	test("ignores duplicate GitHub Mirror submissions while one is running", async () => {
		const cwd = tempProject();
		configureGitHub(cwd);
		const calls: string[] = [];
		const model = loadTuiModel(cwd);
		const result = await confirmSelectedIssueGitHubMirror({
			cwd,
			model,
			selection: {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: true,
				githubConfirmOpen: true,
				githubBusy: true,
			},
			githubMirror: fakeTuiGithubMirror(123, calls),
		});

		expect(result.ok).toBe(false);
		expect(result.message).toBe("GitHub mirror already running");
		expect(calls).toEqual([]);
	});

	test("reports GitHub Mirror config and operation errors in the footer message", async () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const selection: TuiSelection = {
			columnIndex: 1,
			cardIndex: 0,
			detailOpen: false,
		};

		const missingRepo = await beginSelectedIssueGitHubMirror({
			cwd,
			model,
			selection,
		});
		configureGitHub(cwd);
		const failed = await confirmSelectedIssueGitHubMirror({
			cwd,
			model: loadTuiModel(cwd),
			selection: { ...selection, githubConfirmOpen: true },
			githubMirror: {
				mirrorIssueToGitHub: async () => ({
					ok: false as const,
					error: { kind: "github_error", message: "gh auth failed" },
				}),
			},
		});

		expect(missingRepo.ok).toBe(false);
		expect(missingRepo.message).toContain("Set github.repo");
		expect(failed.ok).toBe(false);
		expect(failed.message).toBe("gh auth failed");
	});

	test("opens an archive confirmation modal before archiving", async () => {
		const { keyToTuiAction } = await import("../src/index.ts");
		const model = loadTuiModel(tempProject());
		const selection = moveSelection(
			model,
			{ columnIndex: 1, cardIndex: 0, detailOpen: true },
			"archive",
		);
		const tree = TuiAppView({ model, selection });
		const prompt = findElementById(tree, "archive-prompt");

		expect(keyToTuiAction("a")).toBe("archive");
		expect(selection.archiveOpen).toBe(true);
		expect(selection.detailOpen).toBe(true);
		expect(buildArchivePromptViewModel(model, selection)).toMatchObject({
			title: "Archive MIK-001?",
			focused: true,
			hint: "enter archive  esc cancel",
		});
		expect(collectElementTypes(tree)).toContain(ArchivePrompt);
		expect(prompt?.props).toMatchObject({ border: true });
		expect(collectTextContent(prompt)).toContain(
			"Move to archived. It will disappear from the default board.",
		);
		expect(moveSelection(model, selection, "escape").archiveOpen).toBe(false);
	});

	test("archives the selected Issue and removes it from the default board", () => {
		const cwd = tempProject();
		const model = loadTuiModel(cwd);
		const result = archiveSelectedIssue({
			cwd,
			model,
			selection: {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: true,
				archiveOpen: true,
			},
			now,
		});

		expect(result.ok).toBe(true);
		expect(result.message).toContain("MIK-001 archived");
		expect(existsSync(join(cwd, ".mikan", "archived", "MIK-001.md"))).toBe(
			true,
		);
		expect(result.model.columns.flatMap((column) => column.cards)).toHaveLength(
			0,
		);
		expect(result.selection.detailOpen).toBe(false);
		expect(result.selection.archiveOpen).toBe(false);
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
				detailScrollOffset: 12,
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
		expect(refreshed.selection.detailScrollOffset).toBe(12);
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

		expect(model).toEqual({
			columns: [],
			warnings: [],
			labels: [],
			labelTitles: {},
		});
	});
});
