import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type {
	BoardApiResponse,
	IssueDetailResponse,
	IssueMirrorTarget,
} from "../src/index.ts";

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

function issueResponse(options?: {
	mirrored?: boolean;
	mirrorTarget?: IssueMirrorTarget;
}): IssueDetailResponse {
	return {
		ok: true,
		issue: {
			id: "MIK-200",
			title: "Wire the board",
			status: "ready",
			path: "ready/MIK-200.md",
			labels: ["automation"],
			labelTitles: { automation: "Automation" },
			dependencyStatus: "ready",
			mirrorTarget: options?.mirrorTarget ?? {
				ok: true,
				repo: "takemo101/mikan",
			},
			...(options?.mirrored
				? {
						githubIssue: {
							repo: "takemo101/mikan",
							number: 5,
							url: "https://github.com/takemo101/mikan/issues/5",
							lastMirroredAt: "2026-05-30T00:00:00Z",
						},
					}
				: {}),
			createdAt: "2026-05-30T00:00:00Z",
			updatedAt: "2026-05-30T00:00:00Z",
			body: "## Summary\n\nOriginal body.\n",
		},
	};
}

type Call = { url: string; method: string };

function stubFetch(options?: {
	detail?: IssueDetailResponse;
	mirrorResponse?: IssueDetailResponse;
	mirrorReject?: boolean;
}): Call[] {
	const calls: Call[] = [];
	const detail = options?.detail ?? issueResponse();
	const mirrorResult =
		options?.mirrorResponse ?? issueResponse({ mirrored: true });
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : String(input);
		const method = init?.method ?? "GET";
		calls.push({ url, method });
		if (url.includes("/github-mirror")) {
			if (options?.mirrorReject) throw new Error("network down");
			return new Response(JSON.stringify(mirrorResult), {
				headers: { "content-type": "application/json" },
			});
		}
		if (url.includes("/api/issues/")) {
			return new Response(JSON.stringify(detail), {
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
	fireEvent.click(screen.getByTestId("github-mirror-button"));
	await screen.findByTestId("github-mirror-confirm");
}

function countGets(calls: Call[], fragment: string): number {
	return calls.filter(
		(call) =>
			call.method === "GET" &&
			call.url.includes(fragment) &&
			!call.url.includes("/github-mirror"),
	).length;
}

describe("issue GitHub Mirror action", () => {
	test("shows Create GitHub Mirror for an unmirrored Issue, before Archive", async () => {
		stubFetch({ detail: issueResponse({ mirrored: false }) });
		renderApp();
		await openCard();
		const bar = screen.getByTestId("issue-detail-action-bar");
		const button = within(bar).getByTestId("github-mirror-button");
		expect(button.textContent).toBe("Create GitHub Mirror");
		// The Mirror button precedes the Archive button in document order.
		const archive = within(bar).getByTestId("archive-button");
		expect(
			button.compareDocumentPosition(archive) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(screen.queryByTestId("github-mirror-confirm")).toBeNull();
	});

	test("shows Update GitHub Mirror for an already-mirrored Issue", async () => {
		stubFetch({ detail: issueResponse({ mirrored: true }) });
		renderApp();
		await openCard();
		expect(screen.getByTestId("github-mirror-button").textContent).toBe(
			"Update GitHub Mirror",
		);
	});

	test("confirmation shows the resolved target repo and a source-of-truth note", async () => {
		stubFetch();
		renderApp();
		await openConfirm();
		expect(screen.getByTestId("github-mirror-target").textContent).toBe(
			"takemo101/mikan",
		);
		const message = screen.getByTestId(
			"github-mirror-confirm-message",
		).textContent;
		expect(message).toContain("source of truth");
	});

	test("does not write before the user confirms", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();
		expect(calls.some((call) => call.url.includes("/github-mirror"))).toBe(
			false,
		);
	});

	test("cancel closes the confirm modal without posting", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();
		fireEvent.click(screen.getByTestId("github-mirror-cancel"));
		await waitFor(() => {
			expect(screen.queryByTestId("github-mirror-confirm")).toBeNull();
		});
		expect(calls.some((call) => call.url.includes("/github-mirror"))).toBe(
			false,
		);
		expect(screen.getByTestId("issue-detail")).toBeDefined();
	});

	test("confirming posts to the github-mirror endpoint", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();
		fireEvent.click(screen.getByTestId("github-mirror-confirm-button"));
		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/github-mirror"))).toBe(
				true,
			);
		});
		const post = calls.find((call) => call.url.includes("/github-mirror"));
		expect(post?.method).toBe("POST");
		expect(post?.url).toContain("/api/issues/MIK-200/github-mirror");
	});

	test("on success refetches Board/detail and closes the confirm modal", async () => {
		const calls = stubFetch();
		renderApp();
		await openConfirm();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("github-mirror-confirm-button"));

		await waitFor(() => {
			expect(screen.queryByTestId("github-mirror-confirm")).toBeNull();
		});
		// The Issue stays on the board, so the detail modal remains open.
		expect(screen.getByTestId("issue-detail")).toBeDefined();
		await waitFor(() => {
			expect(countGets(calls, "/api/board")).toBeGreaterThan(boardBefore);
		});
		expect(countGets(calls, "/api/issues/")).toBeGreaterThan(detailBefore);
		// The refetch assertion can ride the Board's poll cadence
		// (BOARD_POLL_INTERVAL_MS), so allow more than the default per-test timeout.
	}, 15000);

	test("shows the API error envelope in the modal without closing or refetching", async () => {
		const calls = stubFetch({
			mirrorResponse: {
				ok: false,
				error: {
					code: "github_error",
					message: "GitHub Mirror requires the gh CLI.",
				},
			},
		});
		renderApp();
		await openConfirm();

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("github-mirror-confirm-button"));

		const error = await screen.findByTestId("github-mirror-error");
		expect(error.getAttribute("role")).toBe("alert");
		expect(error.textContent).toContain("github_error");
		// A failed Mirror keeps both the confirmation and detail modals open.
		expect(screen.getByTestId("github-mirror-confirm")).toBeDefined();
		expect(screen.getByTestId("issue-detail")).toBeDefined();
		await waitFor(() => {
			expect(calls.some((call) => call.url.includes("/github-mirror"))).toBe(
				true,
			);
		});
		// No refetch: Board/detail and filter/selection state are preserved.
		expect(countGets(calls, "/api/board")).toBe(boardBefore);
		expect(countGets(calls, "/api/issues/")).toBe(detailBefore);
	});

	test("shows a transport error in the modal without closing", async () => {
		stubFetch({ mirrorReject: true });
		renderApp();
		await openConfirm();
		fireEvent.click(screen.getByTestId("github-mirror-confirm-button"));
		const error = await screen.findByTestId("github-mirror-error");
		expect(error.textContent).toContain("GitHub Mirror API");
		expect(screen.getByTestId("issue-detail")).toBeDefined();
	});

	test("disables confirm and explains when no Mirror target is configured", async () => {
		const calls = stubFetch({
			detail: issueResponse({
				mirrored: false,
				mirrorTarget: {
					ok: false,
					code: "missing_config",
					message: "Set github.repo in .mikan/config.yaml.",
				},
			}),
		});
		renderApp();
		await openConfirm();
		const confirm = screen.getByTestId(
			"github-mirror-confirm-button",
		) as HTMLButtonElement;
		expect(confirm.disabled).toBe(true);
		expect(
			screen.getByTestId("github-mirror-target-error").textContent,
		).toContain("missing_config");
		fireEvent.click(confirm);
		// A disabled confirm never posts.
		expect(calls.some((call) => call.url.includes("/github-mirror"))).toBe(
			false,
		);
	});
});
