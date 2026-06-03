import { describe, expect, test } from "bun:test";
// Type-only facade guard.
//
// Referencing each public type through a namespace type import means tsc fails
// if any of these names is removed or renamed. Value-export names are guarded at
// runtime below; these tuples guard the type surface at typecheck time.
import type * as cliTypes from "../packages/cli/src/index.ts";
import * as cli from "../packages/cli/src/index.ts";
import type * as coreTypes from "../packages/core/src/index.ts";
import * as core from "../packages/core/src/index.ts";
import type * as githubTypes from "../packages/github/src/index.ts";
import * as github from "../packages/github/src/index.ts";
import type * as mcpTypes from "../packages/mcp/src/index.ts";
import * as mcp from "../packages/mcp/src/index.ts";
import type * as projectConfigTypes from "../packages/project-config/src/index.ts";
import * as projectConfig from "../packages/project-config/src/index.ts";
import type * as tuiTypes from "../packages/tui/src/index.ts";
import * as tui from "../packages/tui/src/index.ts";

// MIK-076 facade safety checks.
//
// This refactor series (MIK-077..MIK-089) extracts oversized package internals
// into smaller, deeper Modules. It is intentionally behavior-preserving: public
// package facades, CLI/MCP/TUI behavior, and core file semantics must not change.
// These characterization checks lock the released facade export names so the
// extraction series cannot silently remove or rename a public export.

const CORE_FACADE = [
	"appendIssue",
	"appendToSection",
	"createIssue",
	"findIssueById",
	"findMaxIssueSequence",
	"isWriteLocked",
	"moveIssue",
	"parseIssueId",
	"parseIssueDocument",
	"parseIssueMarkdown",
	"parseLabelId",
	"parseProjectKey",
	"parseStatusId",
	"parseUtcTimestamp",
	"scanBoard",
	"serializeIssue",
	"updateIssue",
] as const;

const PROJECT_CONFIG_FACADE = [
	"DEFAULT_COLUMNS",
	"DEFAULT_LABELS",
	"findProjectConfig",
	"initProject",
	"loadProjectConfig",
] as const;

const GITHUB_FACADE = [
	"defaultGhApiRunner",
	"mirrorIssueToGitHub",
	"pushGitHubMirror",
] as const;

const CLI_FACADE = [
	"main",
	"runCli",
	"runInteractiveCommand",
	"runWatchOnce",
	"watchProject",
] as const;

const MCP_FACADE = [
	"appendIssueTool",
	"createIssueTool",
	"createMikanMcpCli",
	"getBoardTool",
	"getIssueTool",
	"installMcpServerForAgent",
	"listIssuesTool",
	"mcpAgentInstallers",
	"mirrorIssueToGitHubTool",
	"moveIssueTool",
	"pushGitHubMirrorTool",
	"startMcpServer",
	"updateIssueTool",
] as const;

const TUI_FACADE = [
	"ArchivePrompt",
	"BoardView",
	"ColumnPane",
	"DetailPage",
	"DetailPane",
	"DetailView",
	"Footer",
	"Header",
	"HelpPanel",
	"IssueCard",
	"LogPane",
	"MovePrompt",
	"NotePrompt",
	"TUI_VERSION",
	"TuiAppView",
	"WarningPanel",
	"appendSelectedIssueNote",
	"applyNoteInput",
	"archiveSelectedIssue",
	"buildArchivePromptViewModel",
	"buildBoardViewModel",
	"buildDetailPageViewModel",
	"buildDetailViewModel",
	"buildMovePromptViewModel",
	"buildNotePromptViewModel",
	"buildTuiModel",
	"buildTuiTheme",
	"columnWidthPercent",
	"createTuiAppElement",
	"getAdjacentMoveTarget",
	"getMoveTargets",
	"getSelectedDetails",
	"keyToDirection",
	"keyToTuiAction",
	"launchTui",
	"loadTuiModel",
	"moveSelectedIssue",
	"moveSelectedIssueByDirection",
	"moveSelection",
	"refreshTuiModel",
	"renderTuiText",
] as const;

describe("package facade safety checks (MIK-076)", () => {
	// Additions are allowed during the refactor; removals and renames are not.
	const cases: Array<[string, Record<string, unknown>, readonly string[]]> = [
		["@mikan/core", core, CORE_FACADE],
		["@mikan/project-config", projectConfig, PROJECT_CONFIG_FACADE],
		["@mikan/github", github, GITHUB_FACADE],
		["@takemo101/mikan (cli)", cli, CLI_FACADE],
		["@mikan/mcp", mcp, MCP_FACADE],
		["@mikan/tui", tui, TUI_FACADE],
	];

	for (const [name, mod, facade] of cases) {
		test(`${name} preserves its public value exports`, () => {
			expect(Object.keys(mod)).toEqual(expect.arrayContaining([...facade]));
			for (const exportName of facade) {
				expect(mod[exportName]).toBeDefined();
			}
		});
	}

	test("documents that the extraction series is behavior-preserving", () => {
		// Sentinel: this suite exists to keep MIK-077..MIK-089 a refactor, not a
		// redesign. If you intentionally change a public facade, update the facade
		// lists here in the same change so the intent stays explicit.
		expect(CORE_FACADE.length).toBeGreaterThan(0);
		expect(PROJECT_CONFIG_FACADE.length).toBeGreaterThan(0);
		expect(GITHUB_FACADE.length).toBeGreaterThan(0);
		expect(CLI_FACADE.length).toBeGreaterThan(0);
		expect(MCP_FACADE.length).toBeGreaterThan(0);
		expect(TUI_FACADE.length).toBeGreaterThan(0);
	});
});

// --- Type-level facade guards (checked by `bun run typecheck`) ---

type _CoreTypeFacade = [
	coreTypes.Result<unknown, unknown>,
	coreTypes.IssueId,
	coreTypes.StatusId,
	coreTypes.LabelId,
	coreTypes.ProjectKey,
	coreTypes.UtcTimestamp,
	coreTypes.IssueParseError,
	coreTypes.GitHubIssueReference,
	coreTypes.IssueFrontmatter,
	coreTypes.ParsedIssue,
	coreTypes.ColumnConfig,
	coreTypes.LabelConfig,
	coreTypes.BoardConfig,
	coreTypes.DependencyStatus,
	coreTypes.BoardIssue,
	coreTypes.BoardColumn,
	coreTypes.BoardWarning,
	coreTypes.BoardSnapshot,
	coreTypes.ScanBoardOptions,
	coreTypes.MutationError,
	coreTypes.IssueLocation,
	coreTypes.CreateIssueOptions,
	coreTypes.UpdateIssueOptions,
	coreTypes.MoveIssueOptions,
	coreTypes.AppendIssueOptions,
];

type _ProjectConfigTypeFacade = [
	projectConfigTypes.Result<unknown, unknown>,
	projectConfigTypes.ColumnConfig,
	projectConfigTypes.LabelConfig,
	projectConfigTypes.HookConfig,
	projectConfigTypes.ProjectConfig,
	projectConfigTypes.ProjectConfigError,
	projectConfigTypes.ProjectConfigLocation,
	projectConfigTypes.LoadedProjectConfig,
];

type _GitHubTypeFacade = [
	githubTypes.GhApiRequest,
	githubTypes.GhApiRunner,
	githubTypes.GitHubMirrorOptions,
	githubTypes.GitHubMirrorResult,
	githubTypes.GitHubMirrorError,
];

type _CliTypeFacade = [
	cliTypes.CliResult,
	cliTypes.CliOptions,
	cliTypes.InteractiveCommandOptions,
];

type _McpTypeFacade = [
	mcpTypes.McpAgent,
	mcpTypes.McpAgentInstaller,
	mcpTypes.McpAgentInstallOptions,
	mcpTypes.McpAgentInstallResult,
	mcpTypes.McpGithubMirrorOperations,
	mcpTypes.McpRuntime,
	mcpTypes.McpToolError,
	mcpTypes.McpToolResult<unknown>,
];

type _TuiTypeFacade = [
	tuiTypes.FooterMode,
	tuiTypes.TuiCard,
	tuiTypes.TuiColumn,
	tuiTypes.TuiWarning,
	tuiTypes.TuiModel,
	tuiTypes.TuiTheme,
	tuiTypes.BoardCardView,
	tuiTypes.BoardColumnView,
	tuiTypes.BoardViewModel,
	tuiTypes.BoardViewOptions,
	tuiTypes.DetailViewModel,
	tuiTypes.DetailPageViewModel,
	tuiTypes.DetailPageOptions,
	tuiTypes.MovePromptViewModel,
	tuiTypes.NotePromptViewModel,
	tuiTypes.ArchivePromptViewModel,
	tuiTypes.TuiSelection,
	tuiTypes.MoveTarget,
	tuiTypes.TuiMutationResult,
	tuiTypes.MoveSelectedIssueResult,
	tuiTypes.TuiRefreshResult,
	tuiTypes.TuiDetails,
	tuiTypes.TuiAppViewProps,
	tuiTypes.FooterProps,
];

// Reference the guard tuples so they are not flagged as unused.
export type FacadeTypeGuards = [
	_CoreTypeFacade,
	_ProjectConfigTypeFacade,
	_GitHubTypeFacade,
	_CliTypeFacade,
	_McpTypeFacade,
	_TuiTypeFacade,
];
