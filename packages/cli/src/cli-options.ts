import type { Result } from "@mikan/core";
import type { GitHubMirrorOptions, GitHubMirrorResult } from "@mikan/github";
import type { TuiColumnsOption } from "./tui-options.ts";

export type GitHubMirrorCliOperations = {
	mirrorIssueToGitHub: (
		options: GitHubMirrorOptions,
	) => Promise<Result<GitHubMirrorResult, { kind: string; message: string }>>;
	pushGitHubMirror?: (
		options: GitHubMirrorOptions,
	) => Promise<Result<GitHubMirrorResult, { kind: string; message: string }>>;
};

export type CliOptions = {
	cwd?: string;
	now?: () => Date;
	home?: string;
	githubMirror?: GitHubMirrorCliOperations;
};

export type InteractiveCommandOptions = {
	cwd?: string;
	home?: string;
	launchMcp?: () => Promise<void>;
	launchTui?: (options: { columns: TuiColumnsOption }) => Promise<void>;
	launchBrowser?: (options: {
		port: number | undefined;
		open: boolean;
	}) => Promise<void>;
	launchWatch?: () => void;
};
