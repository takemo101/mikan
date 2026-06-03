// @mikan/core public facade.
//
// Domain behavior lives in focused internal Modules (see docs/design.md):
// - primitives.ts: Result plus always-valid branded primitives and parsers
// - issue-markdown.ts: Issue frontmatter/Markdown parsing and preservation
// - dependency.ts: Dependency readiness read-model
// - board-scan.ts: Status directory scanning and Board Snapshot construction
// - write-lock.ts: single-writer lock and atomic writes
// - issue-mutations.ts: Issue create/update/move/append file mutation rules
//
// This entrypoint only composes those Modules into the stable public surface.

export type {
	BoardColumn,
	BoardConfig,
	BoardIssue,
	BoardSnapshot,
	BoardWarning,
	ColumnConfig,
	IssueLocation,
	LabelConfig,
	MutationError,
	ScanBoardOptions,
} from "./board-scan.ts";
export {
	findIssueById,
	findMaxIssueSequence,
	scanBoard,
} from "./board-scan.ts";
export type { DependencyStatus } from "./dependency.ts";
export type { GitHubIssueReference, ParsedIssue } from "./issue-markdown.ts";
export { parseIssueMarkdown } from "./issue-markdown.ts";
export type {
	AppendIssueOptions,
	CreateIssueOptions,
	MoveIssueOptions,
	UpdateIssueOptions,
} from "./issue-mutations.ts";
export {
	appendIssue,
	appendToSection,
	createIssue,
	moveIssue,
	updateIssue,
} from "./issue-mutations.ts";
export type {
	IssueId,
	IssueParseError,
	LabelId,
	ProjectKey,
	Result,
	StatusId,
	UtcTimestamp,
} from "./primitives.ts";
export {
	parseIssueId,
	parseLabelId,
	parseProjectKey,
	parseStatusId,
	parseUtcTimestamp,
} from "./primitives.ts";
export { isWriteLocked } from "./write-lock.ts";
