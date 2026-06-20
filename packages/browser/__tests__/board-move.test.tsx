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
const { useState } = await import("react");
const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);
const { useBoardQuery, createBrowserQueryClient } = await import(
	"../src/client/board-query.ts"
);
const { useIssueDetailQuery } = await import(
	"../src/client/issue-detail-query.ts"
);
const { useBoardMove } = await import("../src/client/move-mutation.ts");

const originalFetch = globalThis.fetch;

// A board whose single Card sits in `ready` before the move and in `active`
// after a successful move, so a refetch is observable in the rendered state.
function boardResponse(moved: boolean): BoardApiResponse {
	const card = {
		id: "MIK-200",
		title: "Wire the board",
		labels: [] as string[],
		status: moved ? "active" : "ready",
		path: `${moved ? "active" : "ready"}/MIK-200.md`,
		dependencyStatus: "ready" as const,
	};
	return {
		ok: true,
		project: { key: "MIK", name: "mikan", root: "/tmp/mikan" },
		board: {
			columns: [
				{ id: "ready", title: "Ready", cards: moved ? [] : [card] },
				{ id: "active", title: "Active", cards: moved ? [card] : [] },
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
			status: "active",
			path: "active/MIK-200.md",
			labels: [],
			dependencyStatus: "ready",
			createdAt: "2026-05-30T00:00:00Z",
			updatedAt: "2026-05-30T00:00:00Z",
			body: "## Summary\n\nBody.\n",
		},
	};
}

type Call = { url: string; method: string; body?: string };

// Stateful fetch stub: a successful move POST flips the server's `moved` state
// so a subsequent board GET reflects the new Column. A failing stub returns the
// supplied error envelope (or throws to model a transport failure) and never
// flips state.
function stubFetch(options?: {
	moveResponse?: IssueDetailResponse;
	throwOnMove?: boolean;
	// When false the board GET keeps returning the pre-move layout even after a
	// successful move, so a test can prove the UI never moves the Card itself.
	flipServerOnMove?: boolean;
}): { calls: Call[] } {
	const calls: Call[] = [];
	let moved = false;
	const flip = options?.flipServerOnMove ?? true;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : String(input);
		const method = init?.method ?? "GET";
		calls.push({ url, method, body: init?.body as string | undefined });
		if (url.includes("/move")) {
			if (options?.throwOnMove) throw new Error("network down");
			const moveResult = options?.moveResponse ?? issueResponse();
			if (moveResult.ok && flip) moved = true;
			return new Response(JSON.stringify(moveResult), {
				headers: { "content-type": "application/json" },
			});
		}
		if (url.includes("/api/issues/")) {
			return new Response(JSON.stringify(issueResponse()), {
				headers: { "content-type": "application/json" },
			});
		}
		return new Response(JSON.stringify(boardResponse(moved)), {
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return { calls };
}

beforeEach(() => {
	setUrl(BASE_URL);
});

afterEach(() => {
	cleanup();
	globalThis.fetch = originalFetch;
	setUrl(BASE_URL);
});

// A minimal harness exercising the move mutation without simulating a native
// drag: a button fires the same `moveIssue` command the drop handler would. It
// renders the live board query so refetch (or its absence) is observable, plus
// the board-level move error the failure path sets.
function Harness() {
	const board = useBoardQuery();
	// Mount the selected Issue's detail query so a move invalidation has an active
	// observer to refetch — the same condition as an open detail modal.
	useIssueDetailQuery("MIK-200");
	const { moveIssue, moveError } = useBoardMove();
	const [moveCount, setMoveCount] = useState(0);
	const layout = board.data?.ok
		? board.data.board.columns
				.map((c) => `${c.id}:${c.cards.map((card) => card.id).join(",")}`)
				.join("|")
		: "none";
	return (
		<div>
			<button
				type="button"
				data-testid="do-move"
				onClick={() => {
					moveIssue({ id: "MIK-200", status: "active" });
					setMoveCount((n) => n + 1);
				}}
			>
				move
			</button>
			<p data-testid="board-layout">{layout}</p>
			<p data-testid="move-count">{moveCount}</p>
			{moveError ? (
				<p data-testid="move-error" role="alert">
					{`${moveError.code}: ${moveError.message}`}
				</p>
			) : null}
		</div>
	);
}

function renderHarness() {
	render(
		<QueryClientProvider client={createBrowserQueryClient()}>
			<Harness />
		</QueryClientProvider>,
	);
}

function countGets(calls: Call[], fragment: string): number {
	return calls.filter(
		(call) =>
			call.method === "GET" &&
			call.url.includes(fragment) &&
			!call.url.includes("/move"),
	).length;
}

describe("board move mutation", () => {
	test("posts the target Status to the move endpoint", async () => {
		const { calls } = stubFetch();
		renderHarness();
		await waitFor(() =>
			expect(screen.getByTestId("board-layout").textContent).toContain(
				"ready:MIK-200",
			),
		);

		fireEvent.click(screen.getByTestId("do-move"));
		await waitFor(() =>
			expect(calls.some((call) => call.url.includes("/move"))).toBe(true),
		);
		const post = calls.find((call) => call.url.includes("/move"));
		expect(post?.method).toBe("POST");
		expect(post?.url).toContain("/api/issues/MIK-200/move");
		expect(post?.body).toContain("active");
	});

	test("does not optimistically move the Card; the board only follows the server", async () => {
		// The server is pinned to the pre-move layout even though the move POST
		// succeeds, so the Card can only appear in `active` if the UI optimistically
		// moved it. It must not: the board reflects refetched server state alone.
		const { calls } = stubFetch({ flipServerOnMove: false });
		renderHarness();
		await waitFor(() =>
			expect(screen.getByTestId("board-layout").textContent).toBe(
				"ready:MIK-200|active:",
			),
		);

		fireEvent.click(screen.getByTestId("do-move"));
		// Wait for the move POST and its triggered board refetch to complete.
		await waitFor(() =>
			expect(calls.some((call) => call.url.includes("/move"))).toBe(true),
		);
		await waitFor(() =>
			expect(screen.getByTestId("move-count").textContent).toBe("1"),
		);
		// The Card stays in `ready`: no optimistic move was applied.
		expect(screen.getByTestId("board-layout").textContent).toBe(
			"ready:MIK-200|active:",
		);
	});

	test("invalidates and refetches Board and detail after a successful move", async () => {
		const { calls } = stubFetch();
		renderHarness();
		await waitFor(() =>
			expect(screen.getByTestId("board-layout").textContent).toContain(
				"ready:MIK-200",
			),
		);

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("do-move"));

		await waitFor(() =>
			expect(countGets(calls, "/api/board")).toBeGreaterThan(boardBefore),
		);
		await waitFor(() =>
			expect(countGets(calls, "/api/issues/")).toBeGreaterThan(detailBefore),
		);
		expect(screen.queryByTestId("move-error")).toBeNull();
	});

	test("shows a board-level error and does not refetch on a failed move", async () => {
		const { calls } = stubFetch({
			moveResponse: {
				ok: false,
				error: { code: "unknown_status", message: "Unknown Status: nope" },
			},
		});
		renderHarness();
		await waitFor(() =>
			expect(screen.getByTestId("board-layout").textContent).toContain(
				"ready:MIK-200",
			),
		);

		const boardBefore = countGets(calls, "/api/board");
		const detailBefore = countGets(calls, "/api/issues/");
		fireEvent.click(screen.getByTestId("do-move"));

		const error = await screen.findByTestId("move-error");
		expect(error.textContent).toContain("unknown_status");
		// A failed move never invalidates, so Board/detail keep their last state.
		expect(countGets(calls, "/api/board")).toBe(boardBefore);
		expect(countGets(calls, "/api/issues/")).toBe(detailBefore);
		expect(screen.getByTestId("board-layout").textContent).toBe(
			"ready:MIK-200|active:",
		);
	});

	test("surfaces a transport failure as a board-level error", async () => {
		stubFetch({ throwOnMove: true });
		renderHarness();
		await waitFor(() =>
			expect(screen.getByTestId("board-layout").textContent).toContain(
				"ready:MIK-200",
			),
		);

		fireEvent.click(screen.getByTestId("do-move"));
		const error = await screen.findByTestId("move-error");
		expect(error.textContent).toContain("network_error");
	});

	test("preserves repository and issue URL state across a failed move", async () => {
		setUrl(`${BASE_URL}?repository=backend&issue=MIK-200`);
		stubFetch({
			moveResponse: {
				ok: false,
				error: { code: "unknown_status", message: "Unknown Status: nope" },
			},
		});
		renderHarness();
		await waitFor(() =>
			expect(screen.getByTestId("board-layout").textContent).toContain(
				"ready:MIK-200",
			),
		);

		fireEvent.click(screen.getByTestId("do-move"));
		await screen.findByTestId("move-error");
		// The move hook owns only the banner; selected Issue and Repository filter
		// live in URL state and are untouched by the failure.
		const params = new URLSearchParams(window.location.search);
		expect(params.get("repository")).toBe("backend");
		expect(params.get("issue")).toBe("MIK-200");
	});
});
