import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const packageReadme = readFileSync(
	join(repoRoot, "packages", "cli", "README.md"),
	"utf8",
);
const configManual = readFileSync(join(repoRoot, "site", "config.md"), "utf8");
const githubMirrorManual = readFileSync(
	join(repoRoot, "site", "github-mirror.md"),
	"utf8",
);
const vitepressConfig = readFileSync(
	join(repoRoot, "site", ".vitepress", "config.ts"),
	"utf8",
);

const mcpAgents = [
	"pi",
	"antigravity",
	"jcode",
	"claude-code",
	"opencode",
	"codex",
	"copilot-vscode",
	"copilot-cli",
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

	test("README documents skills add for every MCP agent as separate from MCP registration", () => {
		expect(readme).toContain("mikan skills add --agent");
		for (const agent of mcpAgents) {
			expect(readme).toContain(`\`${agent}\``);
		}
		expect(readme).toContain("separate");
		expect(readme).toContain("never changes MCP config");
	});

	test("README includes Claude Code, opencode, Codex, Copilot, and incur discovery", () => {
		expect(readme).toContain("mikan mcp add --agent claude-code");
		expect(readme).toContain("mikan mcp add --agent opencode");
		expect(readme).toContain("mikan mcp add --agent codex");
		expect(readme).toContain("mikan mcp add --agent copilot-vscode");
		expect(readme).toContain("mikan mcp add --agent copilot-cli");
		expect(readme).toContain("mikan skills add --agent pi");
		expect(readme).toContain("mikan skills add --agent claude-code");
		expect(readme).toContain("mikan skills add --agent copilot-cli");
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

describe("manual site documentation", () => {
	test("config page escapes hook placeholders for VitePress", () => {
		for (const placeholder of [
			"issue_id",
			"issue_path",
			"from_status",
			"to_status",
			"project_root",
		]) {
			expect(configManual).toContain(`<code v-pre>{{${placeholder}}}</code>`);
		}
	});

	test("GitHub Mirror manual documents one-way publication surfaces", () => {
		for (const required of [
			"GitHub Mirror",
			"one-way",
			"github.repo",
			"github.auto_push_mirrors",
			"gh auth login",
			"mikan github mirror MIK-001",
			"TUI action",
			"mirror_issue_to_github",
			"mikan watch --github-push",
			"label creation fails",
			"GitHub state is never authoritative",
		]) {
			expect(githubMirrorManual).toContain(required);
		}
	});

	test("GitHub Mirror docs avoid sync framing and are linked from docs surfaces", () => {
		expect(githubMirrorManual).not.toContain("bidirectional sync");
		expect(githubMirrorManual).not.toContain("GitHub sync");
		expect(githubMirrorManual).not.toContain("push_github_mirror");
		expect(githubMirrorManual).not.toContain("mikan github push");
		expect(readme).toContain("https://takemo101.github.io/mikan/github-mirror");
		expect(packageReadme).toContain(
			"https://takemo101.github.io/mikan/github-mirror",
		);
		expect(vitepressConfig).toContain("/github-mirror");
		expect(configManual).toContain("github.auto_push_mirrors");
	});
});
