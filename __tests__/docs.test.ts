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
const browserManual = readFileSync(
	join(repoRoot, "site", "browser.md"),
	"utf8",
);
const mcpManual = readFileSync(
	join(repoRoot, "site", "mcp-and-skills.md"),
	"utf8",
);
const githubMirrorManual = readFileSync(
	join(repoRoot, "site", "github-mirror.md"),
	"utf8",
);
const designDoc = readFileSync(join(repoRoot, "docs", "design.md"), "utf8");
const browserDesignDoc = readFileSync(
	join(repoRoot, "docs", "browser.md"),
	"utf8",
);
const contextDoc = readFileSync(join(repoRoot, "CONTEXT.md"), "utf8");
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

	test("durable docs capture the planned mikan browser design", () => {
		for (const required of [
			"mikan browser",
			"local Browser UI adapter",
			"React 19",
			"Vite",
			"Hono",
			"Tailwind CSS v4",
			"React Aria Components",
			"Atlassian Pragmatic Drag and Drop",
			"react-markdown",
			"remark-gfm",
			"TanStack Query",
			"TanStack Router",
			"Local Command Board",
			"Focused Markdown Modal",
			"Moved via mikan browser",
			"{ ok: false, error: { code, message } }",
		]) {
			expect(browserDesignDoc).toContain(required);
			expect(designDoc).toContain(required);
		}

		expect(browserDesignDoc).toContain("raw HTML disabled or escaped");
		expect(browserDesignDoc).toContain(
			"Repository filtering by primary `repository` only",
		);
		for (const actionDesign of [
			"Primary | +Affected",
			"includeAffected=1",
			"top action bar",
			"Edit labels",
			"Archived via mikan browser",
			"POST /api/issues/:id/github-mirror",
		]) {
			expect(browserDesignDoc).toContain(actionDesign);
			expect(designDoc).toContain(actionDesign);
		}
		expect(browserDesignDoc).toContain("Host/Origin");
		expect(browserDesignDoc).toContain("packages/browser");
		expect(designDoc).toContain("packages/browser");
		expect(designDoc).toContain("no mandatory/shared server");
		expect(contextDoc).toContain("**Browser UI**");
		expect(contextDoc).toContain("not a shared dashboard");
	});
});

describe("mikan browser user documentation", () => {
	test("README overviews mikan browser and links to the manual", () => {
		expect(readme).toContain("mikan browser");
		expect(readme).toContain("| `mikan browser` |");
		expect(readme).toContain("--port");
		expect(readme).toContain("--no-open");
		expect(readme).toContain("https://takemo101.github.io/mikan/browser");
	});

	test("package README documents the mikan browser command and flags", () => {
		expect(packageReadme).toContain("mikan browser");
		expect(packageReadme).toContain("--port");
		expect(packageReadme).toContain("--no-open");
		expect(packageReadme).toContain(
			"https://takemo101.github.io/mikan/browser",
		);
	});

	test("Browser manual documents local-only runtime behavior", () => {
		expect(browserManual).toContain("mikan browser");
		expect(browserManual).toContain("foreground process");
		expect(browserManual).toContain("127.0.0.1");
		expect(browserManual).toContain("--port");
		expect(browserManual).toContain("--no-open");
		expect(browserManual).toContain("Ctrl-C");
		expect(browserManual).toContain("opens your browser automatically");
	});

	test("Browser manual documents initial UI support", () => {
		for (const required of [
			"Board display",
			"Repository filter",
			"Markdown detail modal",
			"Focused Markdown Modal",
			"Append Reports/Notes",
			"drag-and-drop Status move",
			"Moved via mikan browser",
		]) {
			expect(browserManual).toContain(required);
		}
	});

	test("Browser manual preserves guardrails and source-of-truth scope", () => {
		expect(browserManual).toContain("Markdown remains the source of truth");
		expect(browserManual).toContain("not a shared dashboard");
		expect(browserManual).toContain("mandatory daemon");
		expect(browserManual).toContain("scheduler");
		expect(browserManual).toContain("database");
		expect(browserManual).toContain("GitHub sync surface");
		expect(browserManual).toContain("agent runtime");
		expect(browserManual).toContain("Host/Origin");
	});

	test("Browser manual documents raw HTML behavior in Markdown rendering", () => {
		expect(browserManual).toContain("react-markdown");
		expect(browserManual).toContain("remark-gfm");
		expect(browserManual).toContain("Raw HTML");
		expect(browserManual).toContain("cannot inject elements");
	});

	test("Browser manual documents planned detail actions and remaining deferred surfaces", () => {
		for (const planned of [
			"Primary | +Affected",
			"includeAffected=1",
			"Edit labels",
			"Create/Update GitHub Mirror",
			"Archived via mikan browser",
			"Labels and `affects` never choose the target",
		]) {
			expect(browserManual).toContain(planned);
		}

		for (const deferred of [
			"unarchive and show-archived Browser views",
			"editing `repository` or `affects` from Browser",
			"full keyboard shortcut parity with the TUI",
			"remote or shared dashboard mode",
		]) {
			expect(browserManual).toContain(deferred);
		}
	});

	test("Browser is linked from the manual navigation and CLI page", () => {
		expect(vitepressConfig).toContain("/browser");
		expect(cliManual).toContain("mikan browser");
		expect(cliManual).toContain("./browser.md");
	});

	test("README scopes the no-drag/drop limitation to the TUI", () => {
		expect(readme).toContain(
			"no drag/drop board interactions in the TUI (the local Browser board supports drag-and-drop Status moves)",
		);
	});
});
