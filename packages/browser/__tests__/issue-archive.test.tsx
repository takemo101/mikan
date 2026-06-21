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
						},
					],
				},
			],
			warnings: [],
			labels: [{ id: "automation", title: "Automation" }],
			labelTitles: { automation: "Automation" },
		},
	};
}

function issueResponse(status = "ready"): IssueDetailResponse {
	return {
		ok: true,
		issue: {
			id: "MIK-200",
			title: "Wire the board",
			status,
			path: `${status}/MIK-200.md`,
			labels: ["automation"],
			labelTitles: { automation: "Automation" },
			dependencyStatus: "ready",
			mirrorTarget: { ok: true, repo: "takemo101/mikan" },
			createdAt: "2026-05-30T00:00:00Z",
			updatedAt: "2026-05-30T00:00:00Z",
			body: "## Summary\n\nOriginal body.\n",
		},
	};
}

type Call = { url: string; method: string };

// Route the stubbed fetch by URL + method and record every call so a test can
// assert the archive POST fired and that Board/detail refetched afterward.
function stubFetch(options?: {
	archiveResponse?: IssueDetailResponse;
	archiveReject?: boolean;
}): Call[] {
	const calls: Call[] = [];
	const archiveResult = options?.archiveResponse ?? issueResponse("archived");
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : String(input);
		const method = init?.method ?? "GET";
		calls.push({ url, method });
		if (url.includes("/archive")) {
			if (options?.archiveReject) throw new Error("network down");
			return new Response(JSON.stringify(archiveResult), {
				headers: { "content-type": "application/json" },
			});
		}
		if (url.includes("/api/issues/")) {
			return new Response(JSON.stringify(issueResponse()), {
				headers: { "content-type": "application/json" },
			});
		}
		return new Response(JSON.stringify(boardResponse()), {
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return calls;
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
	await screen.findByTestId("issue-detail-action-bar");
}

async function openConfirm() {
	await openCard();
	fireEvent.click(screen.getByTestId("archive-button"));
	await screen.findByTestId("archive-confirm");
}

function countGets(calls: Call[], fragment: string): number {
	return calls.filter(
		(call) =>
			call.method === "GET" &&
			call.url.includes(fragment) &&
			!call.url.includes("/archive"),
	).length;
}

describe("issue Archive action", () => {
	test("shows a right-aligned Archive action in the detail action bar", async () => {
		stubFetch();
		renderApp();
		await openCard();
		const bar = screen.getByTestId("issue-detail-action-bar");
		const archive = within(bar).getByTestId("archive-button");
		expect(archive).toBeDefined();
		// The confirmation modal is not open until the action is clicked.
		expect(screen.queryByTestId("archive-confirm")).toBeNull();
	});

	test("clicking Archive opens a confirmation modal explaining the consequences", async () => {
		stubFetch();
		renderApp();
		await openConfirm();
		const message = screen.getByTestId("archive-confirm-message").textContent;
		expect(message).toContain("archived");
		expect(message).toContain("Markdown");
		expect(message).toContain("board");
	});

	test("does not write before the user confirms", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();
		expect(calls.some((call) => call.url.includes("/archive"))).toBe(false);
	});

	test("cancel closes the modal without posting", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();
		fireEvent.click(screen.getByTestId("archive-cancel"));
		await waitFor(() => {
			expect(screen.queryByTestId("archive-confirm")).toBeNull();
		});
		expect(calls.some((call) => call.url.includes("/archive"))).toBe(false);
		// The detail modal stays open after a cancel.
		expect(screen.getByTestId("issue-detail")).toBeDefined();
	});

	test("confirming posts to the archive endpoint", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();
		fireEvent.click(screen.getByTestId("archive-confirm-button"));
		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/archive"))).toBe(true);
		});
		const post = calls.find((call) => call.url.includes("/archive"));
		expect(post?.method).toBe("POST");
		expect(post?.url).toContain("/api/issues/MIK-200/archive");
	});

	test("on success refetches Board/detail and closes the detail modal", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("archive-confirm-button"));

		// The detail modal closes because the archived Issue leaves the visible board.
		await waitFor(() => {
			expect(screen.queryByTestId("issue-detail")).toBeNull();
		});
		await waitFor(() => {
			expect(countGets(calls, "/api/board")).toBeGreaterThan(boardBefore);
		});
		expect(countGets(calls, "/api/issues/")).toBeGreaterThan(detailBefore);
	});

	test("shows the API error envelope in the modal without closing or refetching", async () => {
		const calls = stubFetch({
			archiveResponse: {
				ok: false,
				error: { code: "issue_not_found", message: "Issue not found: MIK-200" },
			},
		});
		renderApp();
		await openConfirm();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("archive-confirm-button"));

		const error = await screen.findByTestId("archive-error");
		expect(error.getAttribute("role")).toBe("alert");
		expect(error.textContent).toContain("issue_not_found");
		// A failed archive keeps the confirmation and detail modals open.
		expect(screen.getByTestId("archive-confirm")).toBeDefined();
		expect(screen.getByTestId("issue-detail")).toBeDefined();
		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/archive"))).toBe(true);
		});
		// No refetch: filter/selection state is preserved.
		expect(countGets(calls, "/api/board")).toBe(boardBefore);
		expect(countGets(calls, "/api/issues/")).toBe(detailBefore);
	});

	test("shows a transport error in the modal without closing", async () => {
		stubFetch({ archiveReject: true });
		renderApp();
		await openConfirm();
		fireEvent.click(screen.getByTestId("archive-confirm-button"));
		const error = await screen.findByTestId("archive-error");
		expect(error.textContent).toContain("archive API");
		expect(screen.getByTestId("issue-detail")).toBeDefined();
	});
});
