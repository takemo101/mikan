import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkillForAgent, skillAgentInstallers } from "../src/index.ts";

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

describe("skill agent installers", () => {
	test("exposes the supported skill agent registry", () => {
		expect(skillAgentInstallers.map((installer) => installer.agent)).toEqual([
			"claude-code",
			"opencode",
			"codex",
		]);
	});

	test("installs a mikan skill for each supported agent in global scope", () => {
		for (const agent of skillAgentInstallers.map(
			(installer) => installer.agent,
		)) {
			const home = tempDir(`mikan-skill-${agent}-home-`);
			try {
				const result = installSkillForAgent(agent, { home });
				expect(result.agent).toBe(agent);
				expect(result.scope).toBe("global");
				expect(result.path).toBe(join(home, ".mikan", "skills", `${agent}.md`));
				expect(readFileSync(result.path, "utf8")).toContain("mikan");
			} finally {
				rmSync(home, { recursive: true, force: true });
			}
		}
	});

	test("installs a workspace-local skill when global is disabled", () => {
		const cwd = tempDir("mikan-skill-ws-");
		try {
			const result = installSkillForAgent("claude-code", {
				cwd,
				global: false,
			});
			expect(result.scope).toBe("workspace");
			expect(result.path).toBe(join(cwd, ".mikan", "skills", "claude-code.md"));
			expect(readFileSync(result.path, "utf8")).toContain("mikan");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("rejects unsupported skill agents with a clear error", () => {
		expect(() => installSkillForAgent("pi", {})).toThrow(
			"Unsupported skill agent: pi. Supported agents: claude-code, opencode, codex",
		);
	});
});
