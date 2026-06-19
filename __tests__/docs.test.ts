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
const cliManual = readFileSync(join(repoRoot, "site", "cli.md"), "utf8");
const tuiManual = readFileSync(join(repoRoot, "site", "tui.md"), "utf8");
const mcpManual = readFileSync(
	join(repoRoot, "site", "mcp-and-skills.md"),
	"utf8",
);
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

	test("README surfaces document Issue Metadata", () => {
		for (const docs of [readme, packageReadme]) {
			expect(docs).toContain("Issue Metadata");
			expect(docs).toContain("--metadata");
			expect(docs).toContain("MIKAN_ISSUE_METADATA");
		}
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
			"metadata.path",
		]) {
			expect(configManual).toContain(`<code v-pre>{{${placeholder}}}</code>`);
		}
	});

	test("manual pages document Issue Metadata", () => {
		expect(configManual).toContain("MIKAN_ISSUE_METADATA");
		expect(configManual).toContain("{{metadata.browser_required}}");
		expect(configManual).toContain("Metadata is not a hook filter");
		expect(vitepressConfig).toContain("/cli");
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

	test("workspace Repository docs cover config, CLI, TUI, MCP, and Mirror", () => {
		// README overview links to the manual and shows repository/affects.
		expect(readme).toContain("Workspace Repositories");
		expect(readme).toContain(
			'mikan add "Fix login contract" --repository backend --affects frontend',
		);
		expect(readme).toContain("https://takemo101.github.io/mikan/config");
		expect(packageReadme).toContain("Workspace Repositories");
		expect(packageReadme).toContain("--repository backend --affects frontend");

		// Config manual shows the complete repositories example.
		expect(configManual).toContain("repositories:");
		for (const repoId of ["id: workspace", "id: frontend", "id: backend"]) {
			expect(configManual).toContain(repoId);
		}
		expect(configManual).toContain("repositories[].github.repo");

		// CLI manual shows the add example with --repository and --affects.
		expect(cliManual).toContain(
			'mikan add "Fix login contract" --repository backend --affects frontend',
		);

		// TUI manual describes f filtering by primary repository only.
		expect(tuiManual).toContain("Filter Cards by primary Repository");
		expect(tuiManual).toContain("does not filter by `affects`");

		// MCP manual documents repository/affects on create/update/read.
		expect(mcpManual).toContain("`repository`");
		expect(mcpManual).toContain("`affects`");

		// GitHub Mirror manual distinguishes single-project vs workspace targets.
		expect(githubMirrorManual).toContain("repositories[].github.repo");
		expect(githubMirrorManual).toContain("Single-project versus workspace");
	});

	test("workspace docs say Labels and affects never choose the Mirror target", () => {
		for (const manual of [
			readme,
			configManual,
			cliManual,
			githubMirrorManual,
		]) {
			expect(manual).toContain("affects");
		}
		// Explicit statements that Labels and affects do not pick the Mirror target.
		expect(configManual).toContain(
			"Labels also never decide Repository ownership or the Mirror target",
		);
		expect(githubMirrorManual).toContain(
			"Labels and `affects` never choose the Mirror target",
		);
		expect(mcpManual).toContain("never choose the Mirror target");
	});

	test("workspace docs avoid bidirectional sync and assert non-scheduler scope", () => {
		for (const manual of [readme, configManual, mcpManual]) {
			expect(manual).not.toContain("bidirectional");
		}
		expect(readme).toContain("not a multi-project scheduler or worker pool");
		expect(mcpManual).toContain("not a scheduler, worker pool");
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
