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
