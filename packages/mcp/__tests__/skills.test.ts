import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	installMcpServerForAgent,
	installSkillForAgent,
	skillAgentInstallers,
} from "../src/index.ts";

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("skill agent installers", () => {
	test("exposes the supported skill agent registry", () => {
		expect(skillAgentInstallers.map((installer) => installer.agent)).toEqual([
			"pi",
			"antigravity",
			"jcode",
			"claude-code",
			"opencode",
			"codex",
			"copilot-vscode",
			"copilot-cli",
		]);
	});

	test("installs the mikan SKILL.md using each agent's convention", () => {
		const cases = [
			{
				agent: "pi",
				global: join(".pi", "agent", "skills", "mikan", "SKILL.md"),
				workspace: join(".pi", "skills", "mikan", "SKILL.md"),
			},
			{
				agent: "jcode",
				global: join(".jcode", "skills", "mikan", "SKILL.md"),
				workspace: join(".jcode", "skills", "mikan", "SKILL.md"),
			},
			{
				agent: "claude-code",
				global: join(".claude", "skills", "mikan", "SKILL.md"),
				workspace: join(".claude", "skills", "mikan", "SKILL.md"),
			},
			{
				agent: "opencode",
				global: join(".config", "opencode", "skills", "mikan", "SKILL.md"),
				workspace: join(".opencode", "skills", "mikan", "SKILL.md"),
			},
		] as const;
		for (const { agent, global, workspace } of cases) {
			const home = tempDir(`mikan-skill-${agent}-home-`);
			const cwd = tempDir(`mikan-skill-${agent}-cwd-`);
			try {
				const globalResult = installSkillForAgent(agent, { home });
				const workspaceResult = installSkillForAgent(agent, {
					cwd,
					global: false,
				});
				expect(globalResult.scope).toBe("global");
				expect(globalResult.path).toBe(join(home, global));
				expect(workspaceResult.scope).toBe("workspace");
				expect(workspaceResult.path).toBe(join(cwd, workspace));
				expect(existsSync(globalResult.path)).toBe(true);
				expect(existsSync(workspaceResult.path)).toBe(true);
			} finally {
				rmSync(home, { recursive: true, force: true });
				rmSync(cwd, { recursive: true, force: true });
			}
		}
	});

	test("installs antigravity SKILL.md using Antigravity skills conventions", () => {
		const home = tempDir("mikan-skill-antigravity-home-");
		const cwd = tempDir("mikan-skill-antigravity-cwd-");
		try {
			const globalResult = installSkillForAgent("antigravity", { home });
			expect(globalResult.scope).toBe("global");
			expect(globalResult.path).toBe(
				join(home, ".gemini", "antigravity-cli", "skills", "mikan", "SKILL.md"),
			);
			expect(readFileSync(globalResult.path, "utf8")).toContain(
				"---\nname: mikan",
			);

			const workspaceResult = installSkillForAgent("antigravity", {
				cwd,
				global: false,
			});
			expect(workspaceResult.scope).toBe("workspace");
			expect(workspaceResult.path).toBe(
				join(cwd, ".agents", "skills", "mikan", "SKILL.md"),
			);
			expect(readFileSync(workspaceResult.path, "utf8")).toContain(
				"---\nname: mikan",
			);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("installs Copilot SKILL.md using Copilot agent skill conventions", () => {
		const home = tempDir("mikan-skill-copilot-home-");
		const cwd = tempDir("mikan-skill-copilot-cwd-");
		try {
			for (const agent of ["copilot-cli", "copilot-vscode"] as const) {
				const globalResult = installSkillForAgent(agent, { home });
				expect(globalResult.scope).toBe("global");
				expect(globalResult.path).toBe(
					join(home, ".copilot", "skills", "mikan", "SKILL.md"),
				);
				expect(readFileSync(globalResult.path, "utf8")).toContain(
					"---\nname: mikan",
				);

				const workspaceResult = installSkillForAgent(agent, {
					cwd,
					global: false,
				});
				expect(workspaceResult.scope).toBe("workspace");
				expect(workspaceResult.path).toBe(
					join(cwd, ".github", "skills", "mikan", "SKILL.md"),
				);
				expect(readFileSync(workspaceResult.path, "utf8")).toContain(
					"---\nname: mikan",
				);
			}
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("installs codex skill globally and rejects workspace scope", () => {
		const home = tempDir("mikan-skill-codex-home-");
		const cwd = tempDir("mikan-skill-codex-cwd-");
		try {
			const result = installSkillForAgent("codex", { home });
			expect(result.scope).toBe("global");
			expect(result.path).toBe(
				join(home, ".codex", "skills", "mikan", "SKILL.md"),
			);
			expect(existsSync(result.path)).toBe(true);

			expect(() =>
				installSkillForAgent("codex", { home, cwd, global: false }),
			).toThrow("Codex skills are global-only");
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("the installed skill teaches compact mikan operating rules", () => {
		const home = tempDir("mikan-skill-content-");
		try {
			const result = installSkillForAgent("claude-code", { home });
			const doc = readFileSync(result.path, "utf8");
			// SKILL.md frontmatter convention and scope.
			expect(doc).toContain("name: mikan");
			expect(doc).toContain("local-first Markdown Issue board");

			// The skill should be compact operating guidance, not a mini manual.
			expect(doc.length).toBeLessThan(3800);
			expect(doc).toContain("## Default workflow");
			for (const phrase of [
				"Read the board or target Issue first",
				"Check warnings and unmet_dependencies",
				"Move substantial work to the board's active work column",
				"Append Reports for findings, validation, blockers, and review results",
				"Move to the done column only after acceptance criteria and validation pass",
				"Use the board's configured Status columns",
			]) {
				expect(doc).toContain(phrase);
			}

			// Tells agents to use MCP first, then fall back to the CLI when needed.
			expect(doc).toContain("Prefer MCP tools");
			expect(doc).toContain("Use CLI only when MCP is unavailable");
			expect(doc).toContain("Do not edit `.mikan/**/*.md` directly");
			expect(doc).toContain("MCP and CLI are unavailable");
			expect(doc).toContain(
				'mikan add "Title" --repository backend --affects frontend',
			);
			expect(doc).not.toContain("push_github_mirror");
			expect(doc).not.toContain("mikan list --status ready");
			for (const tool of [
				"get_board",
				"list_issues",
				"get_issue",
				"create_issue",
				"update_issue",
				"move_issue",
				"append_issue",
				"mirror_issue_to_github",
			]) {
				expect(doc).toContain(tool);
			}

			// Workspace operation and Mirror target invariants remain explicit.
			expect(doc).toContain("## Workspace mode");
			expect(doc).toContain("every Issue needs a primary `repository`");
			expect(doc).toContain("`affects` only for additional Repositories");
			expect(doc).toContain("repeat the primary `repository` in `affects`");
			expect(doc).toContain(
				"New Mirrors use `Issue.repository -> repositories[].github.repo`",
			);
			expect(doc).toContain(
				"Labels and `affects` never choose the Mirror target",
			);
			expect(doc).toContain(
				"top-level `github.repo` is not a workspace fallback",
			);
			expect(doc).toContain(
				"`github.auto_push_mirrors` only controls `mikan watch`",
			);

			// Boundaries and vocabulary stay concise.
			expect(doc).toContain("Dependencies are advisory");
			expect(doc).toContain("GitHub Mirror is one-way publication");
			expect(doc).toContain("Use Issue, not Task or ticket");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("skill installation does not modify MCP config", () => {
		const home = tempDir("mikan-skill-indep-home-");
		const cwd = tempDir("mikan-skill-indep-cwd-");
		try {
			installSkillForAgent("claude-code", { home });
			installSkillForAgent("opencode", { home });
			// No MCP config files are created by skill installation.
			expect(existsSync(join(home, ".claude.json"))).toBe(false);
			expect(
				existsSync(join(home, ".config", "opencode", "opencode.json")),
			).toBe(false);
			expect(existsSync(join(cwd, ".mcp.json"))).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("MCP installation does not modify skills", () => {
		const home = tempDir("mikan-mcp-indep-home-");
		try {
			installMcpServerForAgent("claude-code", { home });
			// No skill files are created by MCP registration.
			expect(
				existsSync(join(home, ".claude", "skills", "mikan", "SKILL.md")),
			).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("rejects unsupported skill agents with a clear error", () => {
		expect(() => installSkillForAgent("cursor", {})).toThrow(
			"Unsupported skill agent: cursor. Supported agents: pi, antigravity, jcode, claude-code, opencode, codex, copilot-vscode, copilot-cli",
		);
	});
});
