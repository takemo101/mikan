import { resolve, sep } from "node:path";
import { Hono } from "hono";
import { type AppendInput, appendIssueResponse } from "./append-api.ts";
import { archiveIssueResponse } from "./archive-api.ts";
import { loadBoardApiResponse } from "./board-api.ts";
import { loadIssueDetailResponse } from "./issue-api.ts";
import { type LabelsInput, updateLabelsResponse } from "./labels-api.ts";
import { type MoveInput, moveIssueResponse } from "./move-api.ts";
import { checkWriteOrigin } from "./origin-guard.ts";

// Foreground local Browser server for `mikan browser`. It serves the static app
// shell, binds to loopback, and exposes read APIs over the shared read model plus
// guarded write endpoints for Browser Issue actions.

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

	// First Browser write endpoint. It runs the Host/Origin guard before any
	// mutation, reads the JSON append payload, and delegates to the append API,
	// which reloads project state from disk for the write. Core append confines
	// the write to the located Issue file under the active project root.
	app.post("/api/issues/:id/append", async (c) => {
		const guard = checkWriteOrigin(c.req.raw);
		if (!guard.ok) return c.json({ ok: false, error: guard.error }, 403);
		let input: AppendInput;
		try {
			input = (await c.req.json()) as AppendInput;
		} catch {
			return c.json(
				{
					ok: false,
					error: {
						code: "invalid_request",
						message: "Request body must be valid JSON.",
					},
				},
				400,
			);
		}
		return c.json(appendIssueResponse(projectRoot, c.req.param("id"), input));
	});

	// Status move write endpoint backing board drag-and-drop. Same guard-first,
	// reload-from-disk shape as append: the Host/Origin guard runs before any
	// mutation, the JSON body carries the target Status, and core `moveIssue`
	// confines the write to the located Issue file under the active project root
	// while writing the `Moved via mikan browser` Status Log entry.
	app.post("/api/issues/:id/move", async (c) => {
		const guard = checkWriteOrigin(c.req.raw);
		if (!guard.ok) return c.json({ ok: false, error: guard.error }, 403);
		let input: MoveInput;
		try {
			input = (await c.req.json()) as MoveInput;
		} catch {
			return c.json(
				{
					ok: false,
					error: {
						code: "invalid_request",
						message: "Request body must be valid JSON.",
					},
				},
				400,
			);
		}
		return c.json(moveIssueResponse(projectRoot, c.req.param("id"), input));
	});

	// Label update write endpoint backing the detail-modal Label editor. Same
	// guard-first, reload-from-disk shape as append/move: the Host/Origin guard
	// runs before any mutation, the JSON body carries the selected known Label
	// ids, and core `updateIssue` confines the write to the located Issue file
	// under the active project root while preserving config-unknown Labels and
	// touching frontmatter Labels only (no Status Log/Reports/Notes/Mirror).
	app.post("/api/issues/:id/labels", async (c) => {
		const guard = checkWriteOrigin(c.req.raw);
		if (!guard.ok) return c.json({ ok: false, error: guard.error }, 403);
		let input: LabelsInput;
		try {
			input = (await c.req.json()) as LabelsInput;
		} catch {
			return c.json(
				{
					ok: false,
					error: {
						code: "invalid_request",
						message: "Request body must be valid JSON.",
					},
				},
				400,
			);
		}
		return c.json(updateLabelsResponse(projectRoot, c.req.param("id"), input));
	});

	// Archive write endpoint backing the detail-modal Archive action. Same
	// guard-first, reload-from-disk shape as the other write endpoints, but it
	// carries no request body: archiving is a fixed move to the `archived` Status.
	// The Host/Origin guard runs before any mutation, and core `moveIssue`
	// confines the write to the located Issue file under the active project root
	// while writing the `Archived via mikan browser` Status Log entry.
	app.post("/api/issues/:id/archive", (c) => {
		const guard = checkWriteOrigin(c.req.raw);
		if (!guard.ok) return c.json({ ok: false, error: guard.error }, 403);
		return c.json(archiveIssueResponse(projectRoot, c.req.param("id")));
	});

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
