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

// Config Labels in config order: Automation then Herdr.
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
			labels: [
				{ id: "automation", title: "Automation" },
				{ id: "herdr", title: "Herdr" },
			],
			labelTitles: { automation: "Automation", herdr: "Herdr" },
		},
	};
}

function issueResponse(labels: string[] = ["automation"]): IssueDetailResponse {
	return {
		ok: true,
		issue: {
			id: "MIK-200",
			title: "Wire the board",
			status: "ready",
			path: "ready/MIK-200.md",
			labels,
			labelTitles: Object.fromEntries(labels.map((label) => [label, label])),
			dependencyStatus: "ready",
			mirrorTarget: { ok: true, repo: "takemo101/mikan" },
			createdAt: "2026-05-30T00:00:00Z",
			updatedAt: "2026-05-30T00:00:00Z",
			body: "## Summary\n\nOriginal body.\n",
		},
	};
}

type Call = { url: string; method: string; body?: string };

// Route the stubbed fetch by URL + method and record every call so a test can
// assert that the labels POST fired and that Board/detail refetched afterward.
function stubFetch(options?: {
	issue?: IssueDetailResponse;
	labelsResponse?: IssueDetailResponse;
}): Call[] {
	const calls: Call[] = [];
	const issue = options?.issue ?? issueResponse();
	const labelsResult = options?.labelsResponse ?? issue;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : String(input);
		const method = init?.method ?? "GET";
		calls.push({ url, method, body: init?.body as string | undefined });
		if (url.includes("/labels")) {
			return new Response(JSON.stringify(labelsResult), {
				headers: { "content-type": "application/json" },
			});
		}
		if (url.includes("/api/issues/")) {
			return new Response(JSON.stringify(issue), {
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

async function openPopover() {
	await openCard();
	fireEvent.click(screen.getByTestId("edit-labels-button"));
	await screen.findByTestId("label-popover");
}

function countGets(calls: Call[], fragment: string): number {
	return calls.filter(
		(call) =>
			call.method === "GET" &&
			call.url.includes(fragment) &&
			!call.url.includes("/labels"),
	).length;
}

describe("issue Label editor", () => {
	test("shows an action bar with an Edit labels action below the header", async () => {
		stubFetch();
		renderApp();
		await openCard();
		expect(screen.getByTestId("issue-detail-action-bar")).toBeDefined();
		expect(screen.getByTestId("edit-labels-button")).toBeDefined();
		// The popover is not open until the action is clicked.
		expect(screen.queryByTestId("label-popover")).toBeNull();
	});

	test("opens a nested popover, not a second modal", async () => {
		stubFetch();
		renderApp();
		await openPopover();
		// Exactly one dialog (the detail modal) exists: the popover is not a modal.
		expect(screen.getAllByRole("dialog").length).toBe(1);
		expect(screen.getByTestId("label-popover")).toBeDefined();
	});

	test("lists config Labels in config order with current selections checked", async () => {
		stubFetch();
		renderApp();
		await openPopover();
		const popover = screen.getByTestId("label-popover");
		const checkboxes = within(popover).getAllByRole(
			"checkbox",
		) as HTMLInputElement[];
		// Config order is automation, herdr.
		expect(checkboxes.map((box) => box.getAttribute("data-testid"))).toEqual([
			"label-checkbox-automation",
			"label-checkbox-herdr",
		]);
		// The Issue currently has automation, so only that box is checked.
		expect(
			(screen.getByTestId("label-checkbox-automation") as HTMLInputElement)
				.checked,
		).toBe(true);
		expect(
			(screen.getByTestId("label-checkbox-herdr") as HTMLInputElement).checked,
		).toBe(false);
	});

	test("shows config-unknown existing Labels as read-only preserved Labels", async () => {
		stubFetch({ issue: issueResponse(["automation", "legacy-flag"]) });
		renderApp();
		await openPopover();
		const preserved = screen.getAllByTestId("preserved-label");
		expect(preserved.map((node) => node.textContent)).toEqual(["legacy-flag"]);
		// The unknown Label is not offered as a checkbox.
		expect(screen.queryByTestId("label-checkbox-legacy-flag")).toBeNull();
	});

	test("cancel closes the popover without posting", async () => {
		const calls = stubFetch();
		renderApp();
		await openPopover();
		fireEvent.click(screen.getByTestId("label-checkbox-herdr"));
		fireEvent.click(screen.getByTestId("label-cancel"));

		await waitFor(() => {
			expect(screen.queryByTestId("label-popover")).toBeNull();
		});
		expect(calls.some((call) => call.url.includes("/labels"))).toBe(false);
	});

	test("save posts the selected known Labels and closes the popover", async () => {
		const calls = stubFetch({
			labelsResponse: issueResponse(["automation", "herdr"]),
		});
		renderApp();
		await openPopover();
		fireEvent.click(screen.getByTestId("label-checkbox-herdr"));
		fireEvent.click(screen.getByTestId("label-save"));

		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/labels"))).toBe(true);
		});
		const post = calls.find((call) => call.url.includes("/labels"));
		expect(post?.method).toBe("POST");
		expect(post?.url).toContain("/api/issues/MIK-200/labels");
		const body = JSON.parse(post?.body ?? "{}") as { labels: string[] };
		expect([...body.labels].sort()).toEqual(["automation", "herdr"]);
		// The popover closes on success.
		await waitFor(() => {
			expect(screen.queryByTestId("label-popover")).toBeNull();
		});
	});

	test("invalidates and refetches Board and detail after a successful save", async () => {
		const calls = stubFetch({
			labelsResponse: issueResponse(["automation", "herdr"]),
		});
		renderApp();
		await openPopover();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("label-checkbox-herdr"));
		fireEvent.click(screen.getByTestId("label-save"));

		await waitFor(() => {
			expect(countGets(calls, "/api/board")).toBeGreaterThan(boardBefore);
		});
		await waitFor(() => {
			expect(countGets(calls, "/api/issues/")).toBeGreaterThan(detailBefore);
		});
	});

	test("shows the API error envelope in the popover without invalidating", async () => {
		const calls = stubFetch({
			labelsResponse: {
				ok: false,
				error: { code: "issue_not_found", message: "Issue not found: MIK-200" },
			},
		});
		renderApp();
		await openPopover();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("label-checkbox-herdr"));
		fireEvent.click(screen.getByTestId("label-save"));

		const error = await screen.findByTestId("label-error");
		expect(error.getAttribute("role")).toBe("alert");
		expect(error.textContent).toContain("issue_not_found");
		// A failed save keeps the popover open and does not refetch.
		expect(screen.getByTestId("label-popover")).toBeDefined();
		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/labels"))).toBe(true);
		});
		expect(countGets(calls, "/api/board")).toBe(boardBefore);
		expect(countGets(calls, "/api/issues/")).toBe(detailBefore);
	});

	test("does not optimistically render the new Labels before the refetch", async () => {
		// The labels response and the detail refetch both keep the original Labels,
		// proving the modal never injects the toggled selection itself. CI can run
		// this Browser suite under enough contention that the TanStack invalidation
		// path occasionally takes more than the default test budget, so this mirrors
		// the longer timeout used by the other Browser action refetch tests.
		stubFetch();
		renderApp();
		await openPopover();
		fireEvent.click(screen.getByTestId("label-checkbox-herdr"));
		fireEvent.click(screen.getByTestId("label-save"));

		await waitFor(() => {
			expect(screen.queryByTestId("label-popover")).toBeNull();
		});
		// Only the persisted Label (automation) is shown in the detail body; the
		// toggled-but-refetched-as-original herdr selection is not injected.
		const content = screen.getByTestId("issue-detail-content");
		expect(content.textContent).not.toContain("Herdr");
	}, 20_000);
});
