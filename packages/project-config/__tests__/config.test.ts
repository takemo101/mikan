import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_COLUMNS,
	DEFAULT_LABELS,
	findProjectConfig,
	initProject,
	loadProjectConfig,
} from "../src/index.ts";

function tempProject(): string {
	return mkdtempSync(join(tmpdir(), "mikan-config-"));
}

function writeConfig(root: string, content: string): void {
	mkdirSync(join(root, ".mikan"), { recursive: true });
	writeFileSync(join(root, ".mikan", "config.yaml"), content);
}

describe("project config", () => {
	test("initializes default config, status directories, state, and issue template", () => {
		const root = tempProject();

		const result = initProject(root, { key: "MIK", name: "mikan" });

		expect(result.ok).toBe(true);
		expect(existsSync(join(root, ".mikan", "config.yaml"))).toBe(true);
		for (const column of DEFAULT_COLUMNS) {
			expect(existsSync(join(root, ".mikan", column.id))).toBe(true);
		}
		expect(existsSync(join(root, ".mikan", ".state"))).toBe(true);
		expect(existsSync(join(root, ".mikan", "templates", "issue.md"))).toBe(
			true,
		);

		const loaded = loadProjectConfig(root);
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) throw new Error("expected config to load");
		expect(loaded.value.config.project).toEqual({ key: "MIK", name: "mikan" });
		expect(loaded.value.config.board.columns).toEqual(DEFAULT_COLUMNS);
		expect(loaded.value.config.labels).toEqual(DEFAULT_LABELS);
	});

	test("rejects invalid init options before writing config", () => {
		const root = tempProject();

		const result = initProject(root, { key: "", name: "" });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid init options");
		expect(result.error.kind).toBe("invalid_config");
		expect(existsSync(join(root, ".mikan", "config.yaml"))).toBe(false);
	});

	test("discovers config by walking upward", () => {
		const root = tempProject();
		const nested = join(root, "src", "feature");
		initProject(root, { key: "MIK", name: "mikan" });
		mkdirSync(nested, { recursive: true });

		const found = findProjectConfig(nested);

		expect(found.ok).toBe(true);
		if (!found.ok) throw new Error("expected config discovery");
		expect(found.value.projectRoot).toBe(root);
		expect(found.value.configPath).toBe(join(root, ".mikan", "config.yaml"));
	});

	test("returns a typed error when project fields are missing", () => {
		const root = tempProject();
		writeConfig(
			root,
			`board:\n  columns:\n    - id: backlog\n      title: Backlog\n`,
		);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain("project");
	});

	test("returns a typed error when columns are empty", () => {
		const root = tempProject();
		writeConfig(
			root,
			`project:\n  key: MIK\n  name: mikan\nboard:\n  columns: []\n`,
		);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain("columns");
	});

	test("returns a typed error when columns are missing", () => {
		const root = tempProject();
		writeConfig(root, `project:\n  key: MIK\n  name: mikan\nboard: {}\n`);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain("columns");
	});

	test("returns a typed error for invalid column IDs", () => {
		const root = tempProject();
		writeConfig(
			root,
			`project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: In Progress\n      title: In Progress\n`,
		);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain(
			"status id must be lowercase kebab-case",
		);
	});

	test("returns a typed error for invalid label IDs", () => {
		const root = tempProject();
		writeConfig(
			root,
			`project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: backlog\n      title: Backlog\nlabels:\n  - id: Needs Review\n    title: Needs Review\n`,
		);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain(
			"label id must be lowercase kebab-case",
		);
	});

	test("returns a typed error for duplicate column IDs", () => {
		const root = tempProject();
		writeConfig(
			root,
			`project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: backlog\n      title: Backlog\n    - id: backlog\n      title: Duplicate\n`,
		);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain("duplicate column id");
	});

	test("returns a typed error for duplicate label IDs", () => {
		const root = tempProject();
		writeConfig(
			root,
			`project:\n  key: MIK\n  name: mikan\nboard:\n  columns:\n    - id: backlog\n      title: Backlog\nlabels:\n  - id: automation\n    title: Automation\n  - id: automation\n    title: Duplicate\n`,
		);

		const result = loadProjectConfig(root);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid config");
		expect(result.error.kind).toBe("invalid_config");
		expect(result.error.message).toContain("duplicate label id");
	});

	test("writes config yaml with default columns and labels", () => {
		const root = tempProject();
		initProject(root, { key: "MIK", name: "mikan" });

		const config = readFileSync(join(root, ".mikan", "config.yaml"), "utf8");

		expect(config).toContain("key: MIK");
		expect(config).toContain("id: backlog");
		expect(config).toContain("id: automation");
	});
});
