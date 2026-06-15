import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendIssue,
	type BoardConfig,
	createIssue,
	moveIssue,
	updateIssue,
} from "../src/index.ts";

const config: BoardConfig & { project: { key: string; name: string } } = {
	project: { key: "MIK", name: "mikan" },
	board: {
		columns: [
			{ id: "backlog", title: "Backlog" },
			{ id: "ready", title: "Ready" },
			{ id: "blocked", title: "Blocked" },
			{ id: "completed", title: "Completed" },
			{ id: "archived", title: "Archived" },
		],
	},
	labels: [
		{ id: "automation", title: "Automation" },
		{ id: "herdr", title: "Herdr" },
	],
};

const t1 = () => new Date("2026-05-30T00:00:00Z");
const t2 = () => new Date("2026-05-30T01:02:03Z");

function tempProject(): string {
	const root = mkdtempSync(join(tmpdir(), "mikan-mutation-"));
	for (const column of config.board.columns) {
		mkdirSync(join(root, ".mikan", column.id), { recursive: true });
	}
	mkdirSync(join(root, ".mikan", ".state"), { recursive: true });
	return root;
}

function seed(root: string): void {
	const result = createIssue({
		projectRoot: root,
		config,
		title: "Seed",
		labels: ["automation"],
		now: t1,
	});
	expect(result.ok).toBe(true);
}

function readIssue(root: string, status: string, id = "MIK-001"): string {
	return readFileSync(join(root, ".mikan", status, `${id}.md`), "utf8");
}

describe("core mutations", () => {
	test("create uses next ID, required frontmatter, standard body, and atomic temp cleanup", () => {
		const root = tempProject();

		const result = createIssue({
			projectRoot: root,
			config,
			title: "New issue",
			status: "ready",
			labels: ["automation"],
			now: t1,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected create");
		expect(String(result.value.issue.id)).toBe("MIK-001");
		const markdown = readIssue(root, "ready");
		expect(markdown).toContain("id: MIK-001");
		expect(markdown).toContain("updated_at: 2026-05-30T00:00:00Z");
		expect(markdown).toContain("## Status Log");
		expect(
			readdirSync(join(root, ".mikan", "ready")).some((file) =>
				file.endsWith(".tmp"),
			),
		).toBe(false);
	});

	test("create writes Issue Metadata", () => {
		const root = tempProject();

		const result = createIssue({
			projectRoot: root,
			config,
			title: "Metadata issue",
			metadata: {
				agent_hint: "frontend",
				browser_required: true,
				context_files: ["packages/tui/src/index.ts"],
			},
			now: t1,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected create");
		expect(result.value.issue.metadata).toEqual({
			agent_hint: "frontend",
			browser_required: true,
			context_files: ["packages/tui/src/index.ts"],
		});
		const markdown = readIssue(root, "backlog");
		expect(markdown).toContain("metadata:");
		expect(markdown).toContain("agent_hint: frontend");
		expect(markdown).toContain("browser_required: true");
	});

	test("create writes declared dependencies", () => {
		const root = tempProject();

		const result = createIssue({
			projectRoot: root,
			config,
			title: "Dependent issue",
			dependencies: ["MIK-001", "MIK-002"],
			now: t1,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected create");
		expect(result.value.issue.dependencies.map(String)).toEqual([
			"MIK-001",
			"MIK-002",
		]);
		expect(result.value.dependencyStatus).toBe("blocked");
		expect(result.value.unmetDependencies.map(String)).toEqual([
			"MIK-001",
			"MIK-002",
		]);
		const markdown = readIssue(root, "backlog");
		expect(markdown).toContain("depends_on:");
		expect(markdown).toContain("- MIK-001");
		expect(markdown).toContain("- MIK-002");
	});

	test("create returns ready dependency state when dependencies are completed", () => {
		const root = tempProject();
		seed(root);
		moveIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			status: "completed",
			now: t1,
		});

		const result = createIssue({
			projectRoot: root,
			config,
			title: "Dependent issue",
			dependencies: ["MIK-001"],
			now: t2,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected create");
		expect(result.value.dependencyStatus).toBe("ready");
		expect(result.value.unmetDependencies.map(String)).toEqual([]);
	});

	test("create normalizes generated timestamps to whole-second UTC", () => {
		const root = tempProject();

		const result = createIssue({
			projectRoot: root,
			config,
			title: "Generated time",
			now: () => new Date("2026-05-30T00:00:00.123Z"),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected create");
		expect(readIssue(root, "backlog")).toContain(
			"created_at: 2026-05-30T00:00:00Z",
		);
	});

	test("update replaces dependencies", () => {
		const root = tempProject();
		seed(root);

		const result = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			dependencies: ["MIK-002"],
			now: t2,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected update");
		expect(result.value.issue.dependencies.map(String)).toEqual(["MIK-002"]);
		expect(result.value.dependencyStatus).toBe("blocked");
		expect(result.value.unmetDependencies.map(String)).toEqual(["MIK-002"]);
		const markdown = readIssue(root, "backlog");
		expect(markdown).toContain("depends_on:");
		expect(markdown).toContain("- MIK-002");
		expect(markdown).toContain("updated_at: 2026-05-30T01:02:03Z");
	});

	test("update returns refreshed dependency state", () => {
		const root = tempProject();
		seed(root);
		moveIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			status: "completed",
			now: t1,
		});
		const dependent = createIssue({
			projectRoot: root,
			config,
			title: "Dependent",
			now: t2,
		});
		expect(dependent.ok).toBe(true);

		const result = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-002",
			dependencies: ["MIK-001"],
			now: t2,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected update");
		expect(result.value.dependencyStatus).toBe("ready");
		expect(result.value.unmetDependencies.map(String)).toEqual([]);
	});

	test("update replaces, preserves, and clears Issue Metadata", () => {
		const root = tempProject();
		writeFileSync(
			join(root, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Seed\nmetadata:\n  agent_hint: frontend\n  browser_required: true\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Seed\n`,
		);

		const preserved = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			title: "Still metadata",
			now: t2,
		});
		expect(preserved.ok).toBe(true);
		if (!preserved.ok) throw new Error("expected preserve update");
		expect(preserved.value.issue.metadata).toEqual({
			agent_hint: "frontend",
			browser_required: true,
		});

		const replaced = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			metadata: { agent_hint: "backend" },
			now: t2,
		});
		expect(replaced.ok).toBe(true);
		if (!replaced.ok) throw new Error("expected replace update");
		expect(replaced.value.issue.metadata).toEqual({ agent_hint: "backend" });
		expect(readIssue(root, "backlog")).not.toContain("browser_required");

		const cleared = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			metadata: {},
			now: t2,
		});
		expect(cleared.ok).toBe(true);
		if (!cleared.ok) throw new Error("expected clear update");
		expect(cleared.value.issue.metadata).toEqual({});
		expect(readIssue(root, "backlog")).toContain("metadata: {}");
	});

	test("create and update reject malformed Issue Metadata", () => {
		const root = tempProject();
		seed(root);

		const created = createIssue({
			projectRoot: root,
			config,
			title: "Bad metadata",
			metadata: [],
		});
		const updated = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			metadata: { value: Number.NaN },
		});

		expect(created.ok).toBe(false);
		if (created.ok) throw new Error("expected invalid metadata");
		expect(created.error.message).toContain("metadata must be an object");
		expect(updated.ok).toBe(false);
		if (updated.ok) throw new Error("expected invalid metadata");
		expect(updated.error.message).toContain(
			"metadata.value must be JSON-compatible",
		);
	});

	test("update preserves existing dependencies when omitted", () => {
		const root = tempProject();
		writeFileSync(
			join(root, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Seed\ndepends_on:\n  - MIK-002\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Seed\n`,
		);

		const result = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			title: "Updated",
			now: t2,
		});

		expect(result.ok).toBe(true);
		expect(readIssue(root, "backlog")).toContain("- MIK-002");
	});

	test("create and update reject malformed dependencies", () => {
		const root = tempProject();
		seed(root);

		const created = createIssue({
			projectRoot: root,
			config,
			title: "Bad dependency",
			dependencies: ["bad-slug"],
		});
		const updated = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			dependencies: ["bad-slug"],
		});

		expect(created.ok).toBe(false);
		if (created.ok) throw new Error("expected malformed dependency");
		expect(created.error.message).toContain(
			"id must look like MIK-001: bad-slug",
		);
		expect(updated.ok).toBe(false);
		if (updated.ok) throw new Error("expected malformed dependency");
		expect(updated.error.message).toContain(
			"id must look like MIK-001: bad-slug",
		);
	});

	test("create and update reject duplicate Labels", () => {
		const root = tempProject();
		seed(root);

		const created = createIssue({
			projectRoot: root,
			config,
			title: "Duplicate labels",
			labels: ["automation", "automation"],
		});
		const updated = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			labels: ["automation", "automation"],
		});

		expect(created.ok).toBe(false);
		if (created.ok) throw new Error("expected duplicate Label");
		expect(created.error.message).toBe("Duplicate Label: automation");
		expect(updated.ok).toBe(false);
		if (updated.ok) throw new Error("expected duplicate Label");
		expect(updated.error.message).toBe("Duplicate Label: automation");
	});

	test("updateIssue can preserve existing config-unknown Labels when requested", () => {
		const root = tempProject();
		seed(root);
		const issuePath = join(root, ".mikan", "backlog", "MIK-001.md");
		writeFileSync(
			issuePath,
			readIssue(root, "backlog").replace(
				"labels:\n  - automation",
				"labels:\n  - legacy-label",
			),
		);

		const result = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			labels: ["automation", "legacy-label"],
			preserveUnknownLabels: true,
			now: t2,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected update");
		expect(readIssue(root, "backlog")).toContain(
			"labels:\n  - automation\n  - legacy-label",
		);
	});

	test("update changes title, labels, body, and updated_at", () => {
		const root = tempProject();
		seed(root);

		const result = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			title: "Updated",
			labels: ["herdr"],
			body: "# Updated\n\nBody\n",
			now: t2,
		});

		expect(result.ok).toBe(true);
		const markdown = readIssue(root, "backlog");
		expect(markdown).toContain("title: Updated");
		expect(markdown).toContain("- herdr");
		expect(markdown).toContain("updated_at: 2026-05-30T01:02:03Z");
		expect(markdown).toContain("# Updated\n\nBody\n");
	});

	test("update preserves extra frontmatter keys", () => {
		const root = tempProject();
		writeFileSync(
			join(root, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Seed\npriority: manual\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Seed\n`,
		);

		const result = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			title: "Updated",
			now: t2,
		});

		expect(result.ok).toBe(true);
		expect(readIssue(root, "backlog")).toContain("priority: manual");
	});

	test("update, move, and append preserve GitHub Mirror frontmatter", () => {
		const root = tempProject();
		writeFileSync(
			join(root, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Seed\ngithub_issue:\n  repo: takemo101/mikan\n  number: 123\n  url: https://github.com/takemo101/mikan/issues/123\n  last_mirrored_at: 2026-06-03T22:00:00Z\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Seed\n`,
		);

		expect(
			updateIssue({
				projectRoot: root,
				config,
				id: "MIK-001",
				title: "Updated",
				now: t2,
			}).ok,
		).toBe(true);
		expect(
			moveIssue({
				projectRoot: root,
				config,
				id: "MIK-001",
				status: "ready",
				now: t2,
			}).ok,
		).toBe(true);
		expect(
			appendIssue({
				projectRoot: root,
				config,
				id: "MIK-001",
				section: "Notes",
				body: "Still mirrored",
				now: t2,
			}).ok,
		).toBe(true);

		const markdown = readIssue(root, "ready");
		expect(markdown).toContain("github_issue:");
		expect(markdown).toContain("repo: takemo101/mikan");
		expect(markdown).toContain("number: 123");
		expect(markdown).toContain(
			"url: https://github.com/takemo101/mikan/issues/123",
		);
		expect(markdown).toContain("last_mirrored_at: 2026-06-03T22:00:00Z");
	});

	test("move changes status and appends Status Log", () => {
		const root = tempProject();
		seed(root);

		const result = moveIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			status: "blocked",
			log: "Waiting on reviewer",
			now: t2,
		});

		expect(result.ok).toBe(true);
		expect(existsSync(join(root, ".mikan", "backlog", "MIK-001.md"))).toBe(
			false,
		);
		const markdown = readIssue(root, "blocked");
		expect(markdown).toContain("## Status Log");
		expect(markdown).toContain("Moved from backlog to blocked");
		expect(markdown).toContain("Waiting on reviewer");
		expect(markdown).toContain("updated_at: 2026-05-30T01:02:03Z");
	});

	test("append writes Reports source entries and creates missing sections", () => {
		const root = tempProject();
		seed(root);
		updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			body: "# Seed\n",
			now: t1,
		});

		const result = appendIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			section: "Reports",
			body: "Looks good",
			source: "docs-scout",
			now: t2,
		});

		expect(result.ok).toBe(true);
		const markdown = readIssue(root, "backlog");
		expect(markdown).toContain("## Reports");
		expect(markdown).toContain("2026-05-30T01:02:03Z (docs-scout)");
		expect(markdown).toContain("updated_at: 2026-05-30T01:02:03Z");
		expect(markdown).toContain("Looks good");
	});

	test("rejects held lock, unknown labels/status, duplicates, and malformed targets", () => {
		const root = tempProject();
		seed(root);
		writeFileSync(join(root, ".mikan", ".state", "write.lock"), "held");
		const locked = updateIssue({
			projectRoot: root,
			config,
			id: "MIK-001",
			title: "Nope",
		});
		expect(locked.ok).toBe(false);
		if (locked.ok) throw new Error("expected held lock");
		expect(locked.error.kind).toBe("lock_held");

		const clean = tempProject();
		seed(clean);
		expect(
			updateIssue({
				projectRoot: clean,
				config,
				id: "MIK-001",
				labels: ["missing"],
			}).ok,
		).toBe(false);
		expect(
			moveIssue({
				projectRoot: clean,
				config,
				id: "MIK-001",
				status: "missing",
			}).ok,
		).toBe(false);
		writeFileSync(
			join(clean, ".mikan", "ready", "MIK-001.md"),
			readIssue(clean, "backlog"),
		);
		expect(createIssue({ projectRoot: clean, config, title: "Next" }).ok).toBe(
			false,
		);

		const overwrite = tempProject();
		seed(overwrite);
		writeFileSync(
			join(overwrite, ".mikan", "ready", "MIK-001.md"),
			`---\nid: MIK-999\ntitle: Other\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Other\n`,
		);
		expect(
			moveIssue({
				projectRoot: overwrite,
				config,
				id: "MIK-001",
				status: "ready",
			}).ok,
		).toBe(false);
		expect(readIssue(overwrite, "ready")).toContain("MIK-999");

		const unknownLabelTarget = tempProject();
		writeFileSync(
			join(unknownLabelTarget, ".mikan", "backlog", "MIK-001.md"),
			`---\nid: MIK-001\ntitle: Bad Label\nlabels:\n  - missing\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\n# Bad Label\n`,
		);
		expect(
			moveIssue({
				projectRoot: unknownLabelTarget,
				config,
				id: "MIK-001",
				status: "ready",
			}).ok,
		).toBe(false);
		expect(
			appendIssue({
				projectRoot: unknownLabelTarget,
				config,
				id: "MIK-001",
				section: "Notes",
				body: "Nope",
			}).ok,
		).toBe(false);

		const malformed = tempProject();
		writeFileSync(
			join(malformed, ".mikan", "backlog", "MIK-001.md"),
			"---\nid: [\n---\n",
		);
		const malformedResult = updateIssue({
			projectRoot: malformed,
			config,
			id: "MIK-001",
			title: "Nope",
		});
		expect(malformedResult.ok).toBe(false);
		if (malformedResult.ok) throw new Error("expected malformed target");
		expect(malformedResult.error.kind).toBe("malformed_issue");
	});
});
