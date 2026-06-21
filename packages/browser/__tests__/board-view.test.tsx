import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { BoardApiResponse } from "../src/index.ts";

if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const { QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, render, screen, within } = await import(
	"@testing-library/react"
);
const { App } = await import("../src/client/App.tsx");
const { createBrowserQueryClient } = await import(
	"../src/client/board-query.ts"
);

const originalFetch = globalThis.fetch;

function boardResponse(): BoardApiResponse {
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
							id: "MIK-200",
							title: "Wire the board",
							labels: ["automation"],
							status: "ready",
							path: "ready/MIK-200.md",
							dependencyStatus: "ready",
							repository: "backend",
							affects: ["frontend"],
						},
					],
				},
				{
					id: "blocked",
					title: "Blocked",
					cards: [
						{
							id: "MIK-201",
							title: "Awaiting dependency",
							labels: [],
							status: "blocked",
							path: "blocked/MIK-201.md",
							dependencyStatus: "blocked",
							unmetDependencies: ["MIK-199"],
							repository: "frontend",
						},
					],
				},
				{ id: "active", title: "Active", cards: [] },
			],
			warnings: ["unmet_dependency: MIK-201 depends on MIK-199"],
			warningDetails: [
				{
					text: "unmet_dependency: MIK-201 depends on MIK-199",
					kind: "unmet_dependency",
					message: "MIK-201 depends on MIK-199",
					issueId: "MIK-201",
				},
			],
			labels: [{ id: "automation", title: "Automation" }],
			labelTitles: { automation: "Automation" },
			repositories: [
				{ id: "backend", title: "Backend" },
				{ id: "frontend", title: "Frontend" },
			],
			repositoryTitles: { backend: "Backend", frontend: "Frontend" },
		},
	};
}

function stubFetch(body: BoardApiResponse): void {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			headers: { "content-type": "application/json" },
		})) as unknown as typeof fetch;
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

describe("browser board view", () => {
	test("renders every configured Status Column", async () => {
		stubFetch(boardResponse());
		renderApp();
		await screen.findByRole("heading", { name: "Ready" });
		const columns = screen.getAllByTestId("board-column");
		expect(columns.map((c) => c.getAttribute("data-column-id"))).toEqual([
			"ready",
			"blocked",
			"active",
		]);
	});

	test("stretches Status Columns to the viewport bottom while Card lists scroll independently", async () => {
		stubFetch(boardResponse());
		renderApp();
		await screen.findByRole("heading", { name: "Ready" });
		const row = screen.getByTestId("board-columns");
		expect(row.className).toContain("flex-1");
		expect(row.className).toContain("items-stretch");
		const column = screen.getAllByTestId("board-column")[0];
		expect(column).toBeDefined();
		expect(column?.className).toContain("h-full");
		const cardList = within(column as HTMLElement).getAllByRole("list")[0];
		expect(cardList).toBeDefined();
		expect(cardList?.className).toContain("overflow-y-auto");
	});

	test("renders Card metadata: ID, title, label, repository prefix, affects, and dependency marker", async () => {
		stubFetch(boardResponse());
		renderApp();
		await screen.findByText("Wire the board");
		const card = screen
			.getAllByTestId("board-card")
			.find((node) => node.getAttribute("data-issue-id") === "MIK-200");
		expect(card).toBeDefined();
		const scoped = within(card as HTMLElement);
		expect(scoped.getByText("Wire the board")).toBeDefined();
		expect(scoped.getByText("MIK-200")).toBeDefined();
		expect(scoped.getByText("Automation")).toBeDefined();
		expect(scoped.getByTestId("card-repository").textContent).toContain(
			"backend",
		);
		expect(scoped.getByTestId("card-affects").textContent).toContain(
			"Frontend",
		);
		expect(
			scoped
				.getByTestId("card-dependency")
				.getAttribute("data-dependency-status"),
		).toBe("ready");
	});

	test("marks blocked dependency readiness distinctly", async () => {
		stubFetch(boardResponse());
		renderApp();
		await screen.findByText("Awaiting dependency");
		const blockedCard = screen
			.getAllByTestId("board-card")
			.find((card) => card.getAttribute("data-issue-id") === "MIK-201");
		expect(blockedCard).toBeDefined();
		expect(
			within(blockedCard as HTMLElement)
				.getByTestId("card-dependency")
				.getAttribute("data-dependency-status"),
		).toBe("blocked");
	});

	test("shows an empty state for Columns with no Cards", async () => {
		stubFetch(boardResponse());
		renderApp();
		await screen.findByRole("heading", { name: "Active" });
		const activeColumn = screen
			.getAllByTestId("board-column")
			.find((column) => column.getAttribute("data-column-id") === "active");
		expect(
			within(activeColumn as HTMLElement).getByTestId("column-empty"),
		).toBeDefined();
	});

	test("surfaces warning summary and details from the read model", async () => {
		stubFetch(boardResponse());
		renderApp();
		const summary = await screen.findByTestId("warning-summary");
		expect(summary.textContent).toContain("1 warning");
		const detail = screen.getByTestId("warning-detail");
		expect(detail.textContent).toContain("MIK-201 depends on MIK-199");
	});

	test("renders no warning surface when there are no warnings", async () => {
		const clean = boardResponse();
		if (clean.ok) {
			clean.board.warnings = [];
			clean.board.warningDetails = undefined;
		}
		stubFetch(clean);
		renderApp();
		await screen.findByRole("heading", { name: "Ready" });
		expect(screen.queryByTestId("board-warnings")).toBeNull();
	});
});
