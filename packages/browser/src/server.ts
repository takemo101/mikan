import { resolve, sep } from "node:path";
import { Hono } from "hono";
import { loadBoardApiResponse } from "./board-api.ts";
import { loadIssueDetailResponse } from "./issue-api.ts";

// Foreground local Browser server for `mikan browser`. It serves the static app
// shell, binds to loopback, and exposes the read-only `GET /api/board` (MIK-151)
// and `GET /api/issues/:id` (MIK-153) endpoints over the shared read model.
// Write APIs land in later Browser Issues.

export const BROWSER_HOST = "127.0.0.1";

export type CreateBrowserAppOptions = {
	// Directory holding the Vite-built app shell (index.html + assets/*).
	assetsDir: string;
	// Active project root used by `GET /api/board` to reload config/board state
	// from disk on each request. Defaults to the current working directory.
	projectRoot?: string;
};

export type BrowserApp = {
	fetch: (request: Request) => Response | Promise<Response>;
};

export type StartBrowserServerOptions = CreateBrowserAppOptions & {
	// Omit or pass 0 to auto-select an available loopback port.
	port?: number;
};

export type BrowserServerHandle = {
	url: string;
	host: string;
	port: number;
	fetch: (request: Request) => Response | Promise<Response>;
	stop: () => void;
};

// Minimal inline shell used only as a safety net when built assets are missing
// (for example a source checkout that has not run the Vite build). The published
// CLI always ships real built assets under dist/browser/.
function fallbackShellHtml(): string {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>mikan browser</title>
	</head>
	<body>
		<div id="root">mikan browser</div>
	</body>
</html>
`;
}

// Resolve a request path under assetsDir while refusing path traversal that
// would escape the assets root.
export function resolveWithinAssets(
	assetsDir: string,
	requestPath: string,
): string | undefined {
	const root = resolve(assetsDir);
	const target = resolve(root, `.${requestPath}`);
	if (target !== root && !target.startsWith(root + sep)) return undefined;
	return target;
}

export function createBrowserApp(options: CreateBrowserAppOptions): BrowserApp {
	const app = new Hono();
	const root = resolve(options.assetsDir);
	const projectRoot = options.projectRoot ?? process.cwd();

	// Register API routes before the SPA catch-all so they are never shadowed by
	// the client-routing fallback. Board reads reload from disk on every request.
	app.get("/api/board", (c) => c.json(loadBoardApiResponse(projectRoot)));
	app.get("/api/issues/:id", (c) =>
		c.json(loadIssueDetailResponse(projectRoot, c.req.param("id"))),
	);

	app.get("/assets/*", async (c) => {
		const filePath = resolveWithinAssets(root, c.req.path);
		if (!filePath) return c.notFound();
		const file = Bun.file(filePath);
		if (!(await file.exists())) return c.notFound();
		return new Response(await file.arrayBuffer(), {
			headers: { "content-type": file.type || "application/octet-stream" },
		});
	});

	// Single-page app fallback: every non-asset GET returns the app shell so
	// client-side routing (TanStack Router) owns the in-app routes.
	app.get("*", async (c) => {
		const file = Bun.file(resolve(root, "index.html"));
		if (await file.exists()) return c.html(await file.text());
		return c.html(fallbackShellHtml());
	});

	return { fetch: app.fetch };
}

export function startBrowserServer(
	options: StartBrowserServerOptions,
): BrowserServerHandle {
	const app = createBrowserApp({
		assetsDir: options.assetsDir,
		projectRoot: options.projectRoot,
	});
	const server = Bun.serve({
		hostname: BROWSER_HOST,
		port: options.port ?? 0,
		fetch: app.fetch,
	});
	const host = server.hostname ?? BROWSER_HOST;
	// server.port is only undefined for unix-socket servers; this is always TCP.
	const port = server.port ?? 0;
	const url = `http://${host}:${port}/`;
	return {
		url,
		host,
		port,
		fetch: app.fetch,
		stop: () => server.stop(true),
	};
}
