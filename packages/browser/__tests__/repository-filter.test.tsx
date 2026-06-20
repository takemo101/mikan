import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { BoardApiResponse } from "../src/index.ts";

if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const BASE_URL = "http://localhost:3000/";

// happy-dom's default document URL is `about:blank`, against which relative
// History API updates cannot resolve. Give the window a real loopback origin so
// `?repository=` query-state assertions exercise the production code path.
function setUrl(url: string): void {
	(
		window as unknown as { happyDOM?: { setURL?: (url: string) => void } }
	).happyDOM?.setURL?.(url);
}

const { QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, fireEvent, render, screen, within } = await import(
	"@testing-library/react"
);
const { App } = await import("../src/client/App.tsx");
const { createBrowserQueryClient } = await import(
	"../src/client/board-query.ts"
);

const originalFetch = globalThis.fetch;

function workspaceResponse(): BoardApiResponse {
	return {
		ok: true,
		project: { key: "MIK", name: "mikan", root: "/tmp/mikan" },
		board: {
			columns: [
				{
					id: "ready",
					title: "Ready",
					cards: [
						{
							id: "MIK-300",
							title: "Backend card",
							labels: [],
							status: "ready",
							path: "ready/MIK-300.md",
							repository: "backend",
							// Affects backend's sibling; must NOT widen a frontend filter.
							affects: ["frontend"],
						},
						{
							id: "MIK-301",
							title: "Frontend card",
							labels: [],
							status: "ready",
							path: "ready/MIK-301.md",
							repository: "frontend",
						},
					],
				},
				{ id: "active", title: "Active", cards: [] },
			],
			warnings: [],
			labels: [],
			repositories: [
				{ id: "backend", title: "Backend" },
				{ id: "frontend", title: "Frontend" },
				{ id: "workspace", title: "Workspace" },
			],
			repositoryTitles: {
				backend: "Backend",
				frontend: "Frontend",
				workspace: "Workspace",
			},
		},
	};
}

function stubFetch(body: BoardApiResponse): void {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
}

beforeEach(() => {
	setUrl(BASE_URL);
});

afterEach(() => {
	cleanup();
	globalThis.fetch = originalFetch;
	setUrl(BASE_URL);
});

function renderApp() {
	render(
		<QueryClientProvider client={createBrowserQueryClient()}>
			<App />
		</QueryClientProvider>,
	);
}

describe("repository filter", () => {
	test("lists All repositories plus configured Repositories in config order", async () => {
		stubFetch(workspaceResponse());
		renderApp();
		const select = (await screen.findByTestId(
			"repository-filter",
		)) as HTMLSelectElement;
		expect(
			Array.from(select.options).map((option) => option.textContent),
		).toEqual(["All repositories", "Backend", "Frontend", "Workspace"]);
	});

	test("does not render the filter outside workspace mode", async () => {
		const response = workspaceResponse();
		if (response.ok) {
			response.board.repositories = undefined;
			response.board.repositoryTitles = undefined;
		}
		stubFetch(response);
		renderApp();
		await screen.findByRole("heading", { name: "Ready" });
		expect(screen.queryByTestId("repository-filter")).toBeNull();
	});

	test("filters by primary repository only; affects does not widen results", async () => {
		stubFetch(workspaceResponse());
		renderApp();
		const select = (await screen.findByTestId(
			"repository-filter",
		)) as HTMLSelectElement;

		fireEvent.change(select, { target: { value: "frontend" } });

		expect(screen.getByText("Frontend card")).toBeDefined();
		// MIK-300 is repository=backend, affects=[frontend]; affects must not
		// surface it under the frontend filter.
		expect(screen.queryByText("Backend card")).toBeNull();
	});

	test("reflects the active filter in the repository URL query parameter", async () => {
		stubFetch(workspaceResponse());
		renderApp();
		const select = (await screen.findByTestId(
			"repository-filter",
		)) as HTMLSelectElement;

		fireEvent.change(select, { target: { value: "backend" } });
		expect(new URLSearchParams(window.location.search).get("repository")).toBe(
			"backend",
		);

		fireEvent.change(select, { target: { value: "" } });
		expect(
			new URLSearchParams(window.location.search).get("repository"),
		).toBeNull();
	});

	test("restores the filter from the URL query on load", async () => {
		setUrl(`${BASE_URL}?repository=frontend`);
		stubFetch(workspaceResponse());
		renderApp();
		const select = (await screen.findByTestId(
			"repository-filter",
		)) as HTMLSelectElement;
		expect(select.value).toBe("frontend");
		expect(screen.getByText("Frontend card")).toBeDefined();
		expect(screen.queryByText("Backend card")).toBeNull();
	});

	test("preserves empty Columns and shows a no-match state when filtering yields nothing", async () => {
		setUrl(`${BASE_URL}?repository=workspace`);
		stubFetch(workspaceResponse());
		renderApp();
		await screen.findByRole("heading", { name: "Ready" });
		// All Columns still render, each with its empty state.
		const columns = screen.getAllByTestId("board-column");
		expect(columns).toHaveLength(2);
		for (const column of columns) {
			expect(within(column).getByTestId("column-empty")).toBeDefined();
		}
		expect(screen.getByTestId("board-no-match")).toBeDefined();
	});
});
