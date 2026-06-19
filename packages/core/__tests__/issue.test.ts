import { describe, expect, test } from "bun:test";
import {
	parseIssueId,
	parseIssueMarkdown,
	parseLabelId,
	parseProjectKey,
	parseStatusId,
	parseUtcTimestamp,
} from "../src/index.ts";

const validIssue = `---
id: MIK-001
title: Prototype herdr dispatcher
labels:
  - automation
  - herdr
depends_on:
  - MIK-002
  - MIK-003
metadata:
  agent_hint: frontend
  browser_required: true
  retries: 2
  context_files:
    - packages/tui/src/index.ts
  runner:
    browser: chromium
status: should-be-ignored
priority: should-not-be-modeled
profile: should-not-be-modeled
created_at: 2026-05-30T00:00:00Z
updated_at: 2026-05-30T01:00:00Z
---

# Prototype herdr dispatcher

Body stays exactly as written.
`;

describe("domain primitives", () => {
	test("parses valid primitive values", () => {
		expect(parseIssueId("MIK-001").ok).toBe(true);
		expect(parseStatusId("ready").ok).toBe(true);
		expect(parseLabelId("agent-work").ok).toBe(true);
		expect(parseProjectKey("MIK").ok).toBe(true);
		expect(parseUtcTimestamp("2026-05-30T00:00:00Z").ok).toBe(true);
	});

	test("rejects malformed primitive values", () => {
		expect(parseIssueId("prototype-herdr-dispatcher").ok).toBe(false);
		expect(parseStatusId("Ready").ok).toBe(false);
		expect(parseLabelId("agent work").ok).toBe(false);
		expect(parseProjectKey("mikan").ok).toBe(false);
		expect(parseUtcTimestamp("2026-05-30T00:00:00+09:00").ok).toBe(false);
		expect(parseUtcTimestamp("2026-02-30T00:00:00Z").ok).toBe(false);
	});
});

describe("Issue Markdown parsing", () => {
	test("parses required frontmatter, optional labels, and preserves body", () => {
		const result = parseIssueMarkdown(validIssue);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected valid Issue");
		expect(String(result.value.id)).toBe("MIK-001");
		expect(result.value.title).toBe("Prototype herdr dispatcher");
		expect(result.value.labels.map(String)).toEqual(["automation", "herdr"]);
		expect(result.value.dependencies.map(String)).toEqual([
			"MIK-002",
			"MIK-003",
		]);
		expect(result.value.metadata).toEqual({
			agent_hint: "frontend",
			browser_required: true,
			retries: 2,
			context_files: ["packages/tui/src/index.ts"],
			runner: { browser: "chromium" },
		});
		expect(String(result.value.createdAt)).toBe("2026-05-30T00:00:00Z");
		expect(String(result.value.updatedAt)).toBe("2026-05-30T01:00:00Z");
		expect(result.value.body).toBe(
			"\n# Prototype herdr dispatcher\n\nBody stays exactly as written.\n",
		);
		expect("status" in result.value).toBe(false);
		expect("priority" in result.value).toBe(false);
		expect("profile" in result.value).toBe(false);
	});

	test("defaults missing labels and dependencies to empty arrays", () => {
		const result = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected valid Issue");
		expect(result.value.labels.map(String)).toEqual([]);
		expect(result.value.dependencies.map(String)).toEqual([]);
		expect(result.value.metadata).toEqual({});
	});

	test("rejects malformed Issue Metadata frontmatter", () => {
		const nonObject = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\nmetadata: []\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);
		const nonJsonNumber = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\nmetadata:\n  value: .nan\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);
		const tooDeep = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\nmetadata:\n  a:\n    b:\n      c:\n        d:\n          e:\n            f:\n              g:\n                h:\n                  i: too-deep\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);
		const tooLarge = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\nmetadata:\n  value: ${"x".repeat(17 * 1024)}\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(nonObject.ok).toBe(false);
		if (nonObject.ok) throw new Error("expected invalid metadata");
		expect(nonObject.error.message).toContain("metadata must be an object");
		expect(nonJsonNumber.ok).toBe(false);
		if (nonJsonNumber.ok) throw new Error("expected invalid metadata");
		expect(nonJsonNumber.error.message).toContain(
			"metadata.value must be JSON-compatible",
		);
		expect(tooDeep.ok).toBe(false);
		if (tooDeep.ok) throw new Error("expected invalid metadata");
		expect(tooDeep.error.message).toContain("metadata must not exceed depth 8");
		expect(tooLarge.ok).toBe(false);
		if (tooLarge.ok) throw new Error("expected invalid metadata");
		expect(tooLarge.error.message).toContain(
			"metadata must not exceed 16384 bytes",
		);
	});

	test("parses optional GitHub Mirror frontmatter", () => {
		const result = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ngithub_issue:\n  repo: takemo101/mikan\n  number: 123\n  url: https://github.com/takemo101/mikan/issues/123\n  last_mirrored_at: 2026-06-03T22:00:00Z\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected valid Issue");
		expect(result.value.githubIssue).toMatchObject({
			repo: "takemo101/mikan",
			number: 123,
			url: "https://github.com/takemo101/mikan/issues/123",
		});
		expect(String(result.value.githubIssue?.lastMirroredAt)).toBe(
			"2026-06-03T22:00:00Z",
		);
	});

	test("rejects malformed GitHub Mirror frontmatter", () => {
		const result = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ngithub_issue:\n  repo: not-a-repo\n  number: 0\n  url: not a url\n  last_mirrored_at: yesterday\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.message).toContain("github_issue.repo");
		expect(result.error.message).toContain("github_issue.number");
		expect(result.error.message).toContain("github_issue.url");
		expect(result.error.message).toContain("github_issue.last_mirrored_at");
	});

	test("rejects non-object GitHub Mirror frontmatter", () => {
		const result = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ngithub_issue: https://github.com/takemo101/mikan/issues/123\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.message).toContain("github_issue must be an object");
	});

	test("parses optional workspace Repository frontmatter", () => {
		const result = parseIssueMarkdown(
			`---\nid: WKS-001\ntitle: Fix login contract\nrepository: backend\naffects:\n  - frontend\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected valid Issue");
		expect(result.value.repository).toBe("backend");
		expect(result.value.affects).toEqual(["frontend"]);
	});

	test("defaults affects to empty array and omits repository when absent", () => {
		const result = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected valid Issue");
		expect(result.value.affects).toEqual([]);
		expect("repository" in result.value).toBe(false);
	});

	test("rejects missing required fields", () => {
		const result = parseIssueMarkdown(
			`---\ntitle: Missing ID\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.kind).toBe("invalid_frontmatter");
		expect(result.error.message).toContain("id");
	});

	test("rejects malformed Issue IDs and timestamps", () => {
		const result = parseIssueMarkdown(
			`---\nid: bad-slug\ntitle: Title\ncreated_at: yesterday\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.message).toContain("id");
		expect(result.error.message).toContain("created_at");
	});

	test("rejects non-array labels", () => {
		const result = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\nlabels: automation\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.message).toContain("labels");
	});

	test("rejects non-array and malformed dependencies", () => {
		const nonArray = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ndepends_on: MIK-002\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);
		const malformed = parseIssueMarkdown(
			`---\nid: MIK-001\ntitle: Title\ndepends_on:\n  - bad-slug\ncreated_at: 2026-05-30T00:00:00Z\nupdated_at: 2026-05-30T00:00:00Z\n---\n\nBody`,
		);

		expect(nonArray.ok).toBe(false);
		if (nonArray.ok) throw new Error("expected invalid Issue");
		expect(nonArray.error.message).toContain("depends_on");
		expect(malformed.ok).toBe(false);
		if (malformed.ok) throw new Error("expected invalid Issue");
		expect(malformed.error.message).toContain("id must look like MIK-001");
	});

	test("rejects malformed frontmatter", () => {
		const result = parseIssueMarkdown(`---\nid: [\n---\n\nBody`);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.kind).toBe("invalid_frontmatter");
	});

	test("rejects missing frontmatter fence", () => {
		const result = parseIssueMarkdown("# No frontmatter\n");

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected invalid Issue");
		expect(result.error.kind).toBe("missing_frontmatter");
	});
});
