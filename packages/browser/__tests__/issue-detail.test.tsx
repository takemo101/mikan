import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { BoardApiResponse, IssueDetailResponse } from "../src/index.ts";

if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const BASE_URL = "http://localhost:3000/";

function setUrl(url: string): void {
	(
		window as unknown as { happyDOM?: { setURL?: (url: string) => void } }
	).happyDOM?.setURL?.(url);
}

const { QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, fireEvent, render, screen, waitFor, within } = await import(
	"@testing-library/react"
);
const { App } = await import("../src/client/App.tsx");
const { createBrowserQueryClient } = await import(
	"../src/client/board-query.ts"
);

const originalFetch = globalThis.fetch;

const ISSUE_BODY = [
	"## Summary",
	"",
	"A **bold** detail.",
	"",
	"| Col A | Col B |",
	"| ----- | ----- |",
	"| 1     | 2     |",
	"",
	"~~struck~~ text.",
	"",
	'Inline <b data-testid="raw-html">raw</b> markup.',
	"",
].join("\n");

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
						},
					],
				},
				{ id: "active", title: "Active", cards: [] },
			],
			warnings: [],
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

function issueResponse(): IssueDetailResponse {
	return {
		ok: true,
		issue: {
			id: "MIK-200",
			title: "Wire the board",
			status: "ready",
			path: "ready/MIK-200.md",
			labels: ["automation"],
			labelTitles: { automation: "Automation" },
			repository: "backend",
			repositoryTitle: "Backend",
			dependencyStatus: "ready",
			createdAt: "2026-05-30T00:00:00Z",
			updatedAt: "2026-05-30T00:00:00Z",
			body: ISSUE_BODY,
		},
	};
}

// Route the stubbed fetch by URL so the board poll and the detail fetch each get
// their own payload. `issue` lets a test force a specific detail response.
function stubFetch(options?: {
	board?: BoardApiResponse;
	issue?: IssueDetailResponse;
	issueStatus?: number;
}): void {
	const board = options?.board ?? boardResponse();
	const issue = options?.issue ?? issueResponse();
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : String(input);
		if (url.includes("/api/issues/")) {
			return new Response(JSON.stringify(issue), {
				status: options?.issueStatus ?? 200,
				headers: { "content-type": "application/json" },
			});
		}
		return new Response(JSON.stringify(board), {
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
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

async function openCard() {
	const card = await screen.findByTestId("card-open");
	fireEvent.click(card);
}

describe("issue detail modal", () => {
	test("opens an accessible modal when a Card is clicked", async () => {
		stubFetch();
		renderApp();
		await openCard();

		const dialog = await screen.findByRole("dialog");
		expect(dialog).toBeDefined();
		expect(await screen.findByTestId("issue-detail-content")).toBeDefined();
		// The selected Issue's title appears in the modal.
		expect(
			within(dialog).getAllByText("Wire the board").length,
		).toBeGreaterThan(0);
	});

	test("reflects the selected Issue in the `issue` URL query parameter", async () => {
		stubFetch();
		renderApp();
		await openCard();
		await screen.findByRole("dialog");
		expect(new URLSearchParams(window.location.search).get("issue")).toBe(
			"MIK-200",
		);
	});

	test("restores the modal from the `issue` query on load", async () => {
		setUrl(`${BASE_URL}?issue=MIK-200`);
		stubFetch();
		renderApp();
		expect(await screen.findByRole("dialog")).toBeDefined();
		expect(await screen.findByTestId("issue-detail-content")).toBeDefined();
	});

	test("closes without clearing the active Repository filter", async () => {
		setUrl(`${BASE_URL}?repository=backend`);
		stubFetch();
		renderApp();
		await openCard();
		await screen.findByRole("dialog");
		expect(new URLSearchParams(window.location.search).get("issue")).toBe(
			"MIK-200",
		);

		fireEvent.click(screen.getByTestId("issue-detail-close"));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		// The Repository filter query survives the close.
		expect(new URLSearchParams(window.location.search).get("repository")).toBe(
			"backend",
		);
		expect(new URLSearchParams(window.location.search).get("issue")).toBeNull();
	});

	test("renders Markdown with GFM basics and escapes raw HTML", async () => {
		stubFetch();
		renderApp();
		await openCard();

		const markdown = await screen.findByTestId("issue-markdown");
		// GFM: tables and strikethrough render as real elements.
		expect(within(markdown).getByText("Col A")).toBeDefined();
		expect(markdown.querySelector("table")).not.toBeNull();
		expect(markdown.querySelector("del")).not.toBeNull();
		// Standard Markdown emphasis renders.
		expect(markdown.querySelector("strong")?.textContent).toBe("bold");
		// Raw HTML is disabled: the inline <b> is not rendered as an element, and
		// its test id never reaches the DOM.
		expect(markdown.querySelector("b")).toBeNull();
		expect(screen.queryByTestId("raw-html")).toBeNull();
	});

	test("shows a structured error when the Issue cannot be found", async () => {
		stubFetch({
			issue: {
				ok: false,
				error: { code: "issue_not_found", message: "Issue not found: MIK-200" },
			},
		});
		renderApp();
		await openCard();

		const status = await screen.findByTestId("issue-detail-status");
		expect(status.getAttribute("role")).toBe("alert");
		expect(status.textContent).toContain("issue_not_found");
		expect(status.textContent).toContain("Issue not found: MIK-200");
	});
});
