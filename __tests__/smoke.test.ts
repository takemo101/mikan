import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, runWatchOnce } from "../packages/cli/src/index.ts";
import {
	appendIssueTool,
	createIssueTool,
	getBoardTool,
	moveIssueTool,
} from "../packages/mcp/src/index.ts";
import {
	appendSelectedIssueNote,
	getSelectedDetails,
	loadTuiModel,
	moveSelectedIssue,
	renderTuiText,
} from "../packages/tui/src/index.ts";

const now = () => new Date("2026-05-30T00:00:00Z");

function tempProject(): string {
	return mkdtempSync(join(tmpdir(), "mikan-smoke-"));
}

async function cli(cwd: string, argv: string[]) {
	return runCli(argv, { cwd, now });
}

describe("end-to-end smoke flow", () => {
	test("CLI, MCP, TUI data, and watch work together in a temp project", async () => {
		const cwd = tempProject();

		expect((await cli(cwd, ["init"])).exitCode).toBe(0);
		expect(
			(await cli(cwd, ["add", "First", "--label", "automation"])).stdout,
		).toContain("MIK-001");
		expect((await cli(cwd, ["list"])).stdout).toContain("MIK-001 First");
		expect((await cli(cwd, ["show", "MIK-001"])).stdout).toContain("# First");
		expect(
			(await cli(cwd, ["update", "MIK-001", "--title", "Updated"])).exitCode,
		).toBe(0);
		expect(
			(await cli(cwd, ["move", "MIK-001", "ready", "--log", "Ready"])).exitCode,
		).toBe(0);
		expect(
			(
				await cli(cwd, [
					"append",
					"MIK-001",
					"--section",
					"Notes",
					"--body",
					"Smoke note",
				])
			).exitCode,
		).toBe(0);
		expect((await cli(cwd, ["mcp"])).stdout).toContain("MCP server");
		expect((await cli(cwd, ["tui"])).stdout).toContain("OpenTUI");

		expect(getBoardTool({}, { cwd }).ok).toBe(true);
		expect(createIssueTool({ title: "From MCP" }, { cwd, now }).ok).toBe(true);
		expect(
			moveIssueTool(
				{ id: "MIK-002", status: "blocked", log: "Blocked" },
				{ cwd, now },
			).ok,
		).toBe(true);
		expect(
			appendIssueTool(
				{
					id: "MIK-002",
					section: "Reports",
					source: "docs-scout",
					body: "MCP report",
				},
				{ cwd, now },
			).ok,
		).toBe(true);

		const tuiModel = loadTuiModel(cwd);
		expect(JSON.stringify(tuiModel)).toContain("Updated");
		expect(JSON.stringify(tuiModel)).toContain("From MCP");
		expect(
			renderTuiText(tuiModel, {
				columnIndex: 1,
				cardIndex: 0,
				detailOpen: false,
			}),
		).toContain("m move  a append note");
		const tuiMove = moveSelectedIssue({
			cwd,
			model: tuiModel,
			selection: { columnIndex: 3, cardIndex: 0, detailOpen: false },
			targetStatus: "active",
			now,
		});
		expect(tuiMove.ok).toBe(true);
		const tuiAppend = appendSelectedIssueNote({
			cwd,
			model: tuiMove.model,
			selection: tuiMove.selection,
			body: "TUI smoke note",
			now,
		});
		expect(tuiAppend.ok).toBe(true);
		expect(
			getSelectedDetails(tuiAppend.model, tuiAppend.selection)?.notes,
		).toContain("TUI smoke note");

		writeFileSync(
			join(cwd, ".mikan", "config.yaml"),
			`${readFileSync(join(cwd, ".mikan", "config.yaml"), "utf8")}hooks:\n  on_enter:\n    completed:\n      - "echo {{issue_id}} {{to_status}} >> .mikan/.state/smoke-hook.log"\n`,
		);
		runWatchOnce({ cwd, now });
		renameSync(
			join(cwd, ".mikan", "ready", "MIK-001.md"),
			join(cwd, ".mikan", "completed", "MIK-001.md"),
		);
		runWatchOnce({ cwd, now });
		expect(
			existsSync(join(cwd, ".mikan", ".state", "watcher-snapshot.json")),
		).toBe(true);
		expect(
			readFileSync(join(cwd, ".mikan", ".state", "smoke-hook.log"), "utf8"),
		).toContain("MIK-001 completed");
	});
});
