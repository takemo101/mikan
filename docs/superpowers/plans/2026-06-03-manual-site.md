# mikan Manual Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal cuekit-style VitePress manual site for mikan.

**Architecture:** The site lives in `site/` and is documentation-only. VitePress scripts are added at the root, and a workspace test guards the docs scripts and expected manual-site files. Product source of truth remains `docs/design.md` and domain vocabulary remains `CONTEXT.md`.

**Tech Stack:** VitePress 1.6.4, Bun workspace scripts, TypeScript config for VitePress, Markdown pages, Bun tests, Biome.

---

## File Structure

- Modify `package.json`: add `docs:dev`, `docs:build`, `docs:preview`, and dev dependency `vitepress`.
- Modify `__tests__/workspace.test.ts`: assert docs scripts and manual-site files exist.
- Create `site/.vitepress/config.ts`: VitePress site metadata, navigation, sidebar, local search, GitHub links.
- Create `site/index.md`: home page.
- Create `site/install.md`: install and verification guide.
- Create `site/quickstart.md`: first board flow.
- Create `site/cli.md`: CLI command reference.
- Create `site/tui.md`: TUI behavior and keybindings.
- Create `site/mcp-and-skills.md`: MCP and skills setup.
- Create `site/config.md`: `.mikan/config.yaml`, directories, labels, hooks.

---

### Task 1: Add docs scripts and dependency

**Files:**
- Modify: `package.json`
- Test: `__tests__/workspace.test.ts`

- [ ] **Step 1: Update workspace test for docs scripts**

Add expectations to `__tests__/workspace.test.ts` that verify:

```ts
expect(packageJson.scripts["docs:dev"]).toBe("vitepress dev site");
expect(packageJson.scripts["docs:build"]).toBe("vitepress build site");
expect(packageJson.scripts["docs:preview"]).toBe("vitepress preview site");
expect(packageJson.devDependencies.vitepress).toBe("1.6.4");
```

- [ ] **Step 2: Run the focused test and observe failure**

Run:

```sh
bun test __tests__/workspace.test.ts
```

Expected: FAIL because docs scripts and `vitepress` are not yet declared.

- [ ] **Step 3: Add scripts and dependency**

In `package.json`, add root scripts:

```json
"docs:dev": "vitepress dev site",
"docs:build": "vitepress build site",
"docs:preview": "vitepress preview site"
```

Add dev dependency:

```json
"vitepress": "1.6.4"
```

- [ ] **Step 4: Install dependency**

Run:

```sh
bun install
```

Expected: `bun.lock` updates and install succeeds.

- [ ] **Step 5: Run focused test**

Run:

```sh
bun test __tests__/workspace.test.ts
```

Expected: PASS for workspace tests.

---

### Task 2: Add VitePress config and page existence guard

**Files:**
- Create: `site/.vitepress/config.ts`
- Modify: `__tests__/workspace.test.ts`

- [ ] **Step 1: Add page existence test**

Add a test in `__tests__/workspace.test.ts` that checks these paths exist:

```ts
const manualSiteFiles = [
  "site/.vitepress/config.ts",
  "site/index.md",
  "site/install.md",
  "site/quickstart.md",
  "site/cli.md",
  "site/tui.md",
  "site/mcp-and-skills.md",
  "site/config.md",
];

for (const file of manualSiteFiles) {
  expect(await exists(join(repoRoot, file))).toBe(true);
}
```

Use the same file-existence helper style already present in `workspace.test.ts`.

- [ ] **Step 2: Run focused test and observe failure**

Run:

```sh
bun test __tests__/workspace.test.ts
```

Expected: FAIL because `site/` files do not exist yet.

- [ ] **Step 3: Create VitePress config**

Create `site/.vitepress/config.ts` with:

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "mikan",
  description: "Tiny local-first Issue board for AI-assisted development",
  lang: "en-US",
  base: "/mikan/",
  lastUpdated: true,
  cleanUrls: true,
  srcDir: ".",
  outDir: ".vitepress/dist",
  cacheDir: ".vitepress/cache",
  head: [["meta", { name: "theme-color", content: "#f59e0b" }]],
  themeConfig: {
    nav: [
      { text: "Quickstart", link: "/quickstart" },
      { text: "Install", link: "/install" },
      { text: "CLI", link: "/cli" },
      { text: "TUI", link: "/tui" },
      { text: "MCP & Skills", link: "/mcp-and-skills" },
      { text: "GitHub", link: "https://github.com/takemo101/mikan" },
    ],
    sidebar: {
      "/": [
        {
          text: "Getting Started",
          items: [
            { text: "Quickstart", link: "/quickstart" },
            { text: "Install", link: "/install" },
          ],
        },
        {
          text: "Usage",
          items: [
            { text: "CLI", link: "/cli" },
            { text: "TUI", link: "/tui" },
            { text: "Config", link: "/config" },
          ],
        },
        {
          text: "Agent Integration",
          items: [{ text: "MCP & Skills", link: "/mcp-and-skills" }],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/takemo101/mikan" }],
    editLink: {
      pattern: "https://github.com/takemo101/mikan/edit/main/site/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "© 2026 takemo101",
    },
    search: { provider: "local" },
  },
});
```

---

### Task 3: Write initial manual pages

**Files:**
- Create: `site/index.md`
- Create: `site/install.md`
- Create: `site/quickstart.md`
- Create: `site/cli.md`
- Create: `site/tui.md`
- Create: `site/mcp-and-skills.md`
- Create: `site/config.md`

- [ ] **Step 1: Create pages from existing README content**

Write concise pages that cover exactly the approved initial structure:

- `index.md`: home layout with hero and feature cards.
- `install.md`: npm install, one-off `npx`/`bunx`, Bun execution note, verification.
- `quickstart.md`: `mikan init`, `add`, `list`, `show`, `tui`.
- `cli.md`: primitive commands table and examples.
- `tui.md`: keyboard flow, detail mode, modal actions, `--columns`.
- `mcp-and-skills.md`: `mcp add`, supported agents, `skills add`, `mcp llms`, stdio-only scope.
- `config.md`: `.mikan/` tree, config schema sample, labels, hooks, state files.

- [ ] **Step 2: Run focused test**

Run:

```sh
bun test __tests__/workspace.test.ts
```

Expected: PASS.

---

### Task 4: Build and validate docs

**Files:**
- Read/build: `site/**`

- [ ] **Step 1: Run docs build**

Run:

```sh
bun run docs:build
```

Expected: VitePress builds into `site/.vitepress/dist` without broken internal links.

- [ ] **Step 2: Run workspace checks**

Run:

```sh
bun run typecheck
bun run test
bun run check
```

Expected: all pass. If `.mikan/.state/watcher-snapshot.json` is regenerated, remove it before `bun run check` and before committing:

```sh
rm -f .mikan/.state/watcher-snapshot.json
```

- [ ] **Step 3: Commit implementation**

Run:

```sh
but status -fv
but stage package.json bun.lock __tests__/workspace.test.ts site docs/superpowers/plans/2026-06-03-manual-site.md add-manual-site --status-after
but commit add-manual-site --only -m "Add VitePress manual site" --status-after
```

---

## Self-Review

- Spec coverage: all requested minimal pages, VitePress scripts, build validation, and test guard are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified future implementation steps remain.
- Type consistency: VitePress config uses `defineConfig`, scripts match test expectations, and paths match planned files.
