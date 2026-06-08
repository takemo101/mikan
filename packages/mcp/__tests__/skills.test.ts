import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
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

	test("installs antigravity rules without overwriting existing global rules", () => {
		const home = tempDir("mikan-skill-antigravity-home-");
		const cwd = tempDir("mikan-skill-antigravity-cwd-");
		try {
			const existingPath = join(home, ".gemini", "GEMINI.md");
			installSkillForAgent("antigravity", { home });
			const first = readFileSync(existingPath, "utf8");
			expect(first).toContain("mikan");
			expect(first).toContain("local-first");
			expect(first).not.toContain("---\nname: mikan");

			const workspaceResult = installSkillForAgent("antigravity", {
				cwd,
				global: false,
			});
			expect(workspaceResult.scope).toBe("workspace");
			expect(workspaceResult.path).toBe(
				join(cwd, ".agents", "rules", "mikan.md"),
			);
			expect(readFileSync(workspaceResult.path, "utf8")).toContain("# mikan");

			const preserved = "# Existing Rules\n\nKeep this.\n";
			writeFileSync(existingPath, preserved);
			installSkillForAgent("antigravity", { home });
			installSkillForAgent("antigravity", { home });
			const updated = readFileSync(existingPath, "utf8");
			expect(updated).toContain(preserved);
			expect(updated.match(/BEGIN mikan instructions/g)?.length).toBe(1);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("installs Copilot instructions using verified Copilot conventions", () => {
		const home = tempDir("mikan-skill-copilot-home-");
		const cwd = tempDir("mikan-skill-copilot-cwd-");
		try {
			const cliGlobal = installSkillForAgent("copilot-cli", { home });
			expect(cliGlobal.scope).toBe("global");
			expect(cliGlobal.path).toBe(
				join(home, ".copilot", "copilot-instructions.md"),
			);
			expect(readFileSync(cliGlobal.path, "utf8")).toContain("# mikan");

			const cliWorkspace = installSkillForAgent("copilot-cli", {
				cwd,
				global: false,
			});
			expect(cliWorkspace.scope).toBe("workspace");
			expect(cliWorkspace.path).toBe(
				join(cwd, ".github", "copilot-instructions.md"),
			);

			const vscodeWorkspace = installSkillForAgent("copilot-vscode", {
				cwd,
				global: false,
			});
			expect(vscodeWorkspace.scope).toBe("workspace");
			expect(vscodeWorkspace.path).toBe(
				join(cwd, ".github", "copilot-instructions.md"),
			);
			expect(() => installSkillForAgent("copilot-vscode", { home })).toThrow(
				"VS Code personal Copilot instructions path is not verified",
			);
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

	test("the installed skill teaches mikan, the MCP tools, and advisory deps", () => {
		const home = tempDir("mikan-skill-content-");
		try {
			const result = installSkillForAgent("claude-code", { home });
			const doc = readFileSync(result.path, "utf8");
			// SKILL.md frontmatter convention.
			expect(doc).toContain("name: mikan");
			// Explains mikan as a local-first Issue board.
			expect(doc).toContain("local-first");
			expect(doc).toContain("Issue board");
			// Tells agents to use the MCP tools for reads, mutations, and appends.
			expect(doc).not.toContain("push_github_mirror");
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
			// Issue vocabulary and append targets.
			expect(doc).toContain("Issue ID");
			expect(doc).toContain("Report");
			expect(doc).toContain("Note");
			// Dependencies described as advisory read-model data.
			expect(doc).toContain("depends_on");
			expect(doc).toContain("dependency_status");
			expect(doc).toContain("advisory");
			// GitHub Mirror described as explicit one-way publication.
			expect(doc).toContain("GitHub Mirror is one-way");
			expect(doc).toContain("external mirrors only");
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
