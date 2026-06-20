import { packagedBrowserAssetsDir } from "./assets.ts";
import { openBrowser } from "./open-browser.ts";
import { type BrowserServerHandle, startBrowserServer } from "./server.ts";

export type {
	AppendableSection,
	AppendInput,
	AppendResponse,
} from "./append-api.ts";
export {
	APPENDABLE_SECTIONS,
	appendIssueResponse,
	BROWSER_APPEND_SOURCE,
} from "./append-api.ts";
export { packagedBrowserAssetsDir } from "./assets.ts";
export type {
	BoardApiError,
	BoardApiProject,
	BoardApiResponse,
} from "./board-api.ts";
export { loadBoardApiResponse } from "./board-api.ts";
export type { ApiError } from "./config-error.ts";
export type {
	IssueDetailResponse,
	IssueDetailView,
} from "./issue-api.ts";
export { loadIssueDetailResponse } from "./issue-api.ts";
export { openBrowser } from "./open-browser.ts";
export type { OriginGuardResult } from "./origin-guard.ts";
export { checkWriteOrigin } from "./origin-guard.ts";
export type {
	BrowserApp,
	BrowserServerHandle,
	CreateBrowserAppOptions,
	StartBrowserServerOptions,
} from "./server.ts";
// Public facade for the Browser adapter. Only server-side, CLI-facing exports
// live here; the React client (src/client/*) is built separately by Vite and is
// never imported from this module so it stays out of the CLI bundle.
export {
	BROWSER_HOST,
	createBrowserApp,
	resolveWithinAssets,
	startBrowserServer,
} from "./server.ts";

export type LaunchBrowserOptions = {
	// Active project root, discovered by the CLI. The Board API reloads config and
	// Board state from this directory on each `GET /api/board` request.
	cwd: string;
	// Requested port; when omitted an available loopback port is auto-selected.
	port?: number;
	// Open the local URL in the user's browser unless disabled (`--no-open`).
	open: boolean;
	// Overridable for tests/packaging; defaults to the published dist assets.
	assetsDir?: string;
	openBrowser?: (url: string) => void | Promise<void>;
	print?: (message: string) => void;
};

// Start the foreground Browser server, print the local URL, optionally open the
// browser, and resolve when the process receives Ctrl-C (SIGINT/SIGTERM).
export async function launchBrowser(
	options: LaunchBrowserOptions,
): Promise<void> {
	const server = startBrowserServer({
		assetsDir: options.assetsDir ?? packagedBrowserAssetsDir(),
		projectRoot: options.cwd,
		port: options.port,
	});
	const print = options.print ?? ((message) => process.stdout.write(message));
	print(`mikan browser running at ${server.url} (Ctrl-C to stop)\n`);
	if (options.open) {
		await (options.openBrowser ?? openBrowser)(server.url);
	}
	await waitForShutdown(server);
}

function waitForShutdown(server: BrowserServerHandle): Promise<void> {
	return new Promise((resolveShutdown) => {
		const stop = () => {
			server.stop();
			resolveShutdown();
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
}
