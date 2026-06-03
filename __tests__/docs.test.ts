import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const packageReadme = readFileSync(
	join(repoRoot, "packages", "cli", "README.md"),
	"utf8",
);

const mcpAgents = [
	"pi",
	"antigravity",
	"jcode",
	"claude-code",
	"opencode",
	"codex",
];

describe("agent setup documentation", () => {
	test("README documents mikan mcp add for every supported agent", () => {
		expect(readme).toContain("mikan mcp add --agent");
		// Assert the backtick-wrapped agent names from the supported-agents list,
		// not loose substrings (e.g. "pi") that could match incidentally.
		for (const agent of mcpAgents) {
			expect(readme).toContain(`\`${agent}\``);
		}
	});

	test("README documents skills add as separate from MCP registration", () => {
		expect(readme).toContain("mikan skills add --agent");
		expect(readme).toContain("separate");
		expect(readme).toContain("never changes MCP config");
	});

	test("README includes Claude Code, opencode, Codex, and incur discovery", () => {
		expect(readme).toContain("mikan mcp add --agent claude-code");
		expect(readme).toContain("mikan mcp add --agent opencode");
		expect(readme).toContain("mikan mcp add --agent codex");
		expect(readme).toContain("mikan skills add --agent claude-code");
		expect(readme).toContain("mikan mcp llms");
	});

	test("README states mikan stays stdio MCP only with no scheduler/runtime", () => {
		expect(readme).toContain("stdio MCP only");
		expect(readme).toContain("no HTTP server");
	});

	test("package README documents mcp add, skills add, and the stdio-only scope", () => {
		expect(packageReadme).toContain("mikan mcp add --agent");
		expect(packageReadme).toContain("mikan skills add --agent");
		expect(packageReadme).toContain("mikan mcp llms");
		expect(packageReadme).toContain("stdio MCP only");
		expect(packageReadme).toContain("separate");
	});
});
