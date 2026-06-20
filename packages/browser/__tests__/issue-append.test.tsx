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
const { cleanup, fireEvent, render, screen, waitFor } = await import(
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
							labels: [],
							status: "ready",
							path: "ready/MIK-200.md",
							dependencyStatus: "ready",
						},
					],
				},
			],
			warnings: [],
			labels: [],
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
			labels: [],
			dependencyStatus: "ready",
			createdAt: "2026-05-30T00:00:00Z",
			updatedAt: "2026-05-30T00:00:00Z",
			body: "## Summary\n\nOriginal body.\n",
		},
	};
}

type Call = { url: string; method: string; body?: string };

// Route the stubbed fetch by URL + method and record every call so a test can
// assert that the append POST fired and that Board/detail refetched afterward.
function stubFetch(options?: { appendResponse?: IssueDetailResponse }): Call[] {
	const calls: Call[] = [];
	const append = options?.appendResponse ?? issueResponse();
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : String(input);
		const method = init?.method ?? "GET";
		calls.push({ url, method, body: init?.body as string | undefined });
		if (url.includes("/append")) {
			return new Response(JSON.stringify(append), {
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
	await screen.findByTestId("issue-append");
}

function countGets(calls: Call[], fragment: string): number {
	return calls.filter(
		(call) =>
			call.method === "GET" &&
			call.url.includes(fragment) &&
			!call.url.includes("/append"),
	).length;
}

describe("issue append forms", () => {
	test("renders Reports and Notes tabs with an append form", async () => {
		stubFetch();
		renderApp();
		await openCard();
		expect(screen.getByTestId("append-tab-reports")).toBeDefined();
		expect(screen.getByTestId("append-tab-notes")).toBeDefined();
		expect(screen.getByTestId("append-input")).toBeDefined();
		expect(screen.getByTestId("append-submit")).toBeDefined();
	});

	test("shows a form-near error for empty input and posts nothing", async () => {
		const calls = stubFetch();
		renderApp();
		await openCard();
		fireEvent.submit(screen.getByTestId("append-form"));

		const error = await screen.findByTestId("append-error");
		expect(error.getAttribute("role")).toBe("alert");
		expect(error.textContent?.toLowerCase()).toContain("empty");
		expect(calls.some((call) => call.url.includes("/append"))).toBe(false);
	});

	test("posts the selected section and clears input on success", async () => {
		const calls = stubFetch();
		renderApp();
		await openCard();

		fireEvent.click(screen.getByTestId("append-tab-notes"));
		const input = screen.getByTestId("append-input") as HTMLTextAreaElement;
		fireEvent.change(input, { target: { value: "A fresh note" } });
		fireEvent.submit(screen.getByTestId("append-form"));

		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/append"))).toBe(true);
		});
		const post = calls.find((call) => call.url.includes("/append"));
		expect(post?.method).toBe("POST");
		expect(post?.url).toContain("/api/issues/MIK-200/append");
		expect(post?.body).toContain("Notes");
		expect(post?.body).toContain("A fresh note");
		// Input clears after a successful write.
		await waitFor(() => {
			expect(
				(screen.getByTestId("append-input") as HTMLTextAreaElement).value,
			).toBe("");
		});
	});

	test("invalidates and refetches Board and detail after a successful append", async () => {
		const calls = stubFetch();
		renderApp();
		await openCard();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		const input = screen.getByTestId("append-input") as HTMLTextAreaElement;
		fireEvent.change(input, { target: { value: "Trigger refetch" } });
		fireEvent.submit(screen.getByTestId("append-form"));

		await waitFor(() => {
			expect(countGets(calls, "/api/board")).toBeGreaterThan(boardBefore);
		});
		await waitFor(() => {
			expect(countGets(calls, "/api/issues/")).toBeGreaterThan(detailBefore);
		});
	});

	test("does not optimistically render appended text before the refetch", async () => {
		// The append response and subsequent detail refetch both return the
		// original body, proving the UI never injects the typed text itself.
		stubFetch();
		renderApp();
		await openCard();

		const input = screen.getByTestId("append-input") as HTMLTextAreaElement;
		fireEvent.change(input, { target: { value: "Optimistic ghost" } });
		fireEvent.submit(screen.getByTestId("append-form"));

		await waitFor(() => {
			expect(input.value).toBe("");
		});
		const markdown = screen.getByTestId("issue-markdown");
		expect(markdown.textContent).not.toContain("Optimistic ghost");
	});

	test("shows the API error envelope form-near without invalidating", async () => {
		const calls = stubFetch({
			appendResponse: {
				ok: false,
				error: { code: "issue_not_found", message: "Issue not found: MIK-200" },
			},
		});
		renderApp();
		await openCard();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		const input = screen.getByTestId("append-input") as HTMLTextAreaElement;
		fireEvent.change(input, { target: { value: "will fail" } });
		fireEvent.submit(screen.getByTestId("append-form"));

		const error = await screen.findByTestId("append-error");
		expect(error.textContent).toContain("issue_not_found");
		// A failed append leaves the typed text in place and does not refetch.
		expect(input.value).toBe("will fail");
		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/append"))).toBe(true);
		});
		expect(countGets(calls, "/api/board")).toBe(boardBefore);
		expect(countGets(calls, "/api/issues/")).toBe(detailBefore);
	});

	test("preserves repository and issue query params across append", async () => {
		setUrl(`${BASE_URL}?repository=backend&issue=MIK-200`);
		stubFetch();
		renderApp();
		await screen.findByTestId("issue-append");

		const input = screen.getByTestId("append-input") as HTMLTextAreaElement;
		fireEvent.change(input, { target: { value: "Keep my filters" } });
		fireEvent.submit(screen.getByTestId("append-form"));

		await waitFor(() => {
			expect(input.value).toBe("");
		});
		const params = new URLSearchParams(window.location.search);
		expect(params.get("repository")).toBe("backend");
		expect(params.get("issue")).toBe("MIK-200");
	});
});
