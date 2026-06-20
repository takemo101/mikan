import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BROWSER_HOST,
	type BrowserServerHandle,
	createBrowserApp,
	resolveWithinAssets,
	startBrowserServer,
} from "../src/index.ts";

function tempAssets(): string {
	const dir = mkdtempSync(join(tmpdir(), "mikan-browser-assets-"));
	mkdirSync(join(dir, "assets"), { recursive: true });
	writeFileSync(
		join(dir, "index.html"),
		'<!doctype html><html><body><div id="root"></div><script type="module" src="./assets/app.js"></script></body></html>',
	);
	writeFileSync(join(dir, "assets", "app.js"), "console.log('mikan');\n");
	return dir;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()?.();
});

function withServer(port?: number): BrowserServerHandle {
	const assetsDir = tempAssets();
	const server = startBrowserServer({ assetsDir, port });
	cleanups.push(() => server.stop());
	cleanups.push(() => rmSync(assetsDir, { recursive: true, force: true }));
	return server;
}

describe("browser server", () => {
	test("binds to the loopback host", () => {
		const server = withServer();
		expect(server.host).toBe(BROWSER_HOST);
		expect(server.url.startsWith(`http://${BROWSER_HOST}:`)).toBe(true);
	});

	test("auto-selects an available port when none is requested", () => {
		const server = withServer();
		expect(server.port).toBeGreaterThan(0);
	});

	test("uses the requested port when provided", () => {
		// Auto-select a free port first, stop it, then request it explicitly.
		const probe = startBrowserServer({ assetsDir: tempAssets() });
		const requested = probe.port;
		probe.stop();

		const server = withServer(requested);
		expect(server.port).toBe(requested);
	});

	test("serves the app shell at the root", async () => {
		const server = withServer();
		const response = await server.fetch(new Request(`${server.url}`));
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(await response.text()).toContain('id="root"');
	});

	test("serves built static assets", async () => {
		const server = withServer();
		const response = await server.fetch(
			new Request(`${server.url}assets/app.js`),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("mikan");
	});

	test("returns the app shell for unknown client routes (SPA fallback)", async () => {
		const server = withServer();
		const response = await server.fetch(
			new Request(`${server.url}board?repository=backend`),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('id="root"');
	});

	test("404s missing assets without falling back to the shell", async () => {
		const server = withServer();
		const response = await server.fetch(
			new Request(`${server.url}assets/missing.js`),
		);
		expect(response.status).toBe(404);
	});

	test("refuses path traversal outside the assets directory", () => {
		// URL parsing normalizes `..` before routing, so guard the resolver
		// directly to lock in the defense-in-depth behavior.
		const root = join(tmpdir(), "mikan-assets-root");
		expect(resolveWithinAssets(root, "/assets/app.js")).toBe(
			join(root, "assets", "app.js"),
		);
		expect(
			resolveWithinAssets(root, "/assets/../../etc/passwd"),
		).toBeUndefined();
		expect(resolveWithinAssets(root, "/../secret")).toBeUndefined();
	});

	test("serves a fallback shell when assets are not built", async () => {
		const app = createBrowserApp({
			assetsDir: join(tmpdir(), "mikan-no-such"),
		});
		const response = await app.fetch(new Request("http://127.0.0.1/"));
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("mikan browser");
	});
});
