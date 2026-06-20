import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { BoardApiResponse } from "../src/index.ts";

if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const { QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, render, screen } = await import("@testing-library/react");
const { App } = await import("../src/client/App.tsx");
const { BOARD_POLL_INTERVAL_MS, createBrowserQueryClient } = await import(
	"../src/client/board-query.ts"
);

const originalFetch = globalThis.fetch;
let requestedUrls: string[] = [];

function stubFetch(body: BoardApiResponse): void {
	requestedUrls = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrls.push(typeof input === "string" ? input : String(input));
		return new Response(JSON.stringify(body), {
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = originalFetch;
	window.history.replaceState(null, "", "/");
});

function renderApp() {
	render(
		<QueryClientProvider client={createBrowserQueryClient()}>
			<App />
		</QueryClientProvider>,
	);
}

describe("browser board polling", () => {
	test("configures a periodic poll interval", () => {
		expect(BOARD_POLL_INTERVAL_MS).toBeGreaterThan(0);
	});

	test("polls /api/board and renders the board columns", async () => {
		stubFetch({
			ok: true,
			project: { key: "MIK", name: "mikan", root: "/tmp/mikan" },
			board: {
				columns: [
					{ id: "backlog", title: "Backlog", cards: [] },
					{ id: "ready", title: "Ready", cards: [] },
				],
				warnings: ["malformed_issue: bad"],
				labels: [],
			},
		});
		renderApp();

		expect(
			await screen.findByRole("heading", { name: "Backlog" }),
		).toBeDefined();
		expect(screen.getByRole("heading", { name: "Ready" })).toBeDefined();
		expect(screen.getByTestId("board-project").textContent).toContain("mikan");
		expect(requestedUrls.some((url) => url.includes("/api/board"))).toBe(true);
	});

	test("renders a structured error envelope from the API", async () => {
		stubFetch({
			ok: false,
			error: { code: "config_not_found", message: "No .mikan config found" },
		});
		renderApp();

		const status = await screen.findByRole("alert");
		expect(status.textContent).toContain("config_not_found");
		expect(status.textContent).toContain("No .mikan config found");
	});
});
