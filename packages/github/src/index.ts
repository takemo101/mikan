import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type BoardConfig,
	type BoardIssue,
	findIssueById,
	type IssueFrontmatter,
	parseIssueDocument,
	type Result,
	serializeIssue,
} from "@mikan/core";

export type GhApiRequest = {
	method: "GET" | "POST" | "PATCH";
	endpoint: string;
	body?: unknown;
};

export type GhApiRunner = (request: GhApiRequest) => Promise<unknown>;

export type GitHubMirrorResult = {
	issue_id: string;
	action: "created" | "updated";
	github_issue: {
		repo: string;
		number: number;
		url: string;
	};
	warnings: string[];
};

export type GitHubMirrorError = {
	kind: "missing_config" | "not_found" | "malformed_issue" | "github_error";
	message: string;
};

type GitHubConfig = {
	repo?: string;
	auto_push_mirrors?: boolean;
};

type GitHubMirrorConfig = BoardConfig & {
	github?: GitHubConfig;
};

export type GitHubMirrorOptions = {
	projectRoot: string;
	config: GitHubMirrorConfig;
	id: string;
	runner?: GhApiRunner;
	now?: () => Date;
};

type GitHubLabel = { name?: unknown };
type GitHubIssueResponse = {
	number?: unknown;
	html_url?: unknown;
	labels?: GitHubLabel[];
};

const MIKAN_LABEL_COLOR = "f59e0b";

export async function mirrorIssueToGitHub(
	options: GitHubMirrorOptions,
): Promise<Result<GitHubMirrorResult, GitHubMirrorError>> {
	return mirrorOrPush(options, { requireExistingMirror: false });
}

export async function pushGitHubMirror(
	options: GitHubMirrorOptions,
): Promise<Result<GitHubMirrorResult, GitHubMirrorError>> {
	return mirrorOrPush(options, { requireExistingMirror: true });
}

export const defaultGhApiRunner: GhApiRunner = async (request) => {
	const args = ["api", request.endpoint, "--method", request.method];
	let inputPath: string | undefined;
	try {
		if (request.body !== undefined) {
			const dir = mkdtempSync(join(tmpdir(), "mikan-gh-api-"));
			inputPath = join(dir, "body.json");
			writeFileSync(inputPath, JSON.stringify(request.body));
			args.push("--input", inputPath);
		}
		const result = Bun.spawnSync(["gh", ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stderr = new TextDecoder().decode(result.stderr).trim();
		if (result.exitCode !== 0) {
			throw new Error(stderr || `gh api exited ${result.exitCode}`);
		}
		const stdout = new TextDecoder().decode(result.stdout).trim();
		return stdout ? JSON.parse(stdout) : {};
	} finally {
		if (inputPath) rmSync(inputPath, { force: true });
	}
};

async function mirrorOrPush(
	options: GitHubMirrorOptions,
	mode: { requireExistingMirror: boolean },
): Promise<Result<GitHubMirrorResult, GitHubMirrorError>> {
	const repo = options.config.github?.repo;
	if (!repo) {
		return fail(
			"missing_config",
			"Set github.repo in .mikan/config.yaml before using GitHub Mirror.",
		);
	}
	const found = findIssueById({
		projectRoot: options.projectRoot,
		config: options.config,
		id: options.id,
	});
	if (!found.ok) return fail(found.error.kind, found.error.message);
	if (mode.requireExistingMirror && !found.value.issue.githubIssue) {
		return fail("missing_config", `Issue has no GitHub Mirror: ${options.id}`);
	}
	const runner = options.runner ?? defaultGhApiRunner;
	try {
		return await writeMirror({
			projectRoot: options.projectRoot,
			config: options.config,
			issue: found.value,
			repo,
			runner,
			now: options.now,
		});
	} catch (error) {
		return fail("github_error", formatGhFailure(error));
	}
}

async function writeMirror(options: {
	projectRoot: string;
	config: GitHubMirrorConfig;
	issue: BoardIssue;
	repo: string;
	runner: GhApiRunner;
	now?: () => Date;
}): Promise<Result<GitHubMirrorResult, GitHubMirrorError>> {
	const warnings: string[] = [];
	const issue = options.issue.issue;
	const repo = issue.githubIssue?.repo ?? options.repo;
	const managedLabelNames = new Set(
		options.config.labels.map((label) => label.id),
	);
	const labels = await ensureGitHubLabels({
		repo,
		config: options.config,
		issueLabels: issue.labels.map(String),
		runner: options.runner,
		warnings,
	});
	const title = `[${String(issue.id)}] ${issue.title}`;
	const body = buildGitHubIssueBody(options.issue);
	let response: GitHubIssueResponse;
	let action: "created" | "updated";
	if (issue.githubIssue) {
		const existing = (await options.runner({
			method: "GET",
			endpoint: `repos/${repo}/issues/${issue.githubIssue.number}`,
		})) as GitHubIssueResponse;
		const externalLabels = (existing.labels ?? [])
			.map((label) => String(label.name ?? ""))
			.filter((label) => label && !managedLabelNames.has(label));
		response = (await options.runner({
			method: "PATCH",
			endpoint: `repos/${repo}/issues/${issue.githubIssue.number}`,
			body: { title, body, labels: [...externalLabels, ...labels] },
		})) as GitHubIssueResponse;
		action = "updated";
	} else {
		response = (await options.runner({
			method: "POST",
			endpoint: `repos/${repo}/issues`,
			body: { title, body, labels },
		})) as GitHubIssueResponse;
		action = "created";
	}
	const number = numberFromResponse(response, issue.githubIssue?.number);
	const url = urlFromResponse(response, repo, number, issue.githubIssue?.url);
	writeGitHubIssueFrontmatter(options.issue.path, {
		repo,
		number,
		url,
		last_mirrored_at: utcNow(options.now),
	});
	return {
		ok: true,
		value: {
			issue_id: String(issue.id),
			action,
			github_issue: { repo, number, url },
			warnings,
		},
	};
}

async function ensureGitHubLabels(options: {
	repo: string;
	config: GitHubMirrorConfig;
	issueLabels: string[];
	runner: GhApiRunner;
	warnings: string[];
}): Promise<string[]> {
	const existingLabels = (await options.runner({
		method: "GET",
		endpoint: `repos/${options.repo}/labels`,
	})) as GitHubLabel[];
	const existingNames = new Set(
		existingLabels.map((label) => String(label.name ?? "")).filter(Boolean),
	);
	const labelTitles = new Map(
		options.config.labels.map((label) => [label.id, label.title]),
	);
	const configuredIssueLabels = options.issueLabels.filter((label) =>
		labelTitles.has(label),
	);
	const usableLabels: string[] = [];
	for (const label of configuredIssueLabels) {
		if (!existingNames.has(label)) {
			try {
				await options.runner({
					method: "POST",
					endpoint: `repos/${options.repo}/labels`,
					body: {
						name: label,
						color: MIKAN_LABEL_COLOR,
						description: `Mirrored from mikan label "${labelTitles.get(label) ?? label}" (${label})`,
					},
				});
				existingNames.add(label);
			} catch (error) {
				options.warnings.push(
					`Could not create GitHub label ${label}: ${errorMessage(error)}`,
				);
				continue;
			}
		}
		usableLabels.push(label);
	}
	return usableLabels;
}

function buildGitHubIssueBody(issue: BoardIssue): string {
	return [
		"<!-- mikan:mirror -->",
		`mikan Issue: ${String(issue.issue.id)}`,
		`Status: ${String(issue.status)}`,
		`Labels: ${issue.issue.labels.map(String).join(", ") || "-"}`,
		"",
		"---",
		"",
		issue.issue.body.trimEnd(),
		"",
		"---",
		"",
		"Mirrored from mikan. The mikan Markdown Issue is the source of truth.",
	]
		.join("\n")
		.trimEnd();
}

function writeGitHubIssueFrontmatter(
	path: string,
	githubIssue: {
		repo: string;
		number: number;
		url: string;
		last_mirrored_at: string;
	},
): void {
	const document = parseIssueDocument(readFileSync(path, "utf8"));
	if (!document.ok) throw new Error(document.error.message);
	const frontmatter: IssueFrontmatter = {
		...document.value.frontmatter,
		github_issue: githubIssue,
	};
	writeFileSync(
		path,
		serializeIssue({ frontmatter, body: document.value.issue.body }),
	);
}

function numberFromResponse(
	response: GitHubIssueResponse,
	fallback?: number,
): number {
	const number = response.number;
	if (typeof number === "number" && Number.isInteger(number) && number > 0) {
		return number;
	}
	if (fallback) return fallback;
	throw new Error("GitHub response did not include issue number");
}

function urlFromResponse(
	response: GitHubIssueResponse,
	repo: string,
	number: number,
	fallback?: string,
): string {
	if (typeof response.html_url === "string" && response.html_url.length > 0) {
		return response.html_url;
	}
	return fallback ?? `https://github.com/${repo}/issues/${number}`;
}

function utcNow(now?: () => Date): string {
	return (now ?? (() => new Date()))()
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z");
}

function formatGhFailure(error: unknown): string {
	return `GitHub Mirror requires the gh CLI. Install gh and run \`gh auth login\`. ${errorMessage(error)}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function fail(
	kind: GitHubMirrorError["kind"] | string,
	message: string,
): Result<GitHubMirrorResult, GitHubMirrorError> {
	return {
		ok: false,
		error: {
			kind: isGitHubMirrorErrorKind(kind) ? kind : "github_error",
			message,
		},
	};
}

function isGitHubMirrorErrorKind(
	kind: string,
): kind is GitHubMirrorError["kind"] {
	return [
		"missing_config",
		"not_found",
		"malformed_issue",
		"github_error",
	].includes(kind);
}
