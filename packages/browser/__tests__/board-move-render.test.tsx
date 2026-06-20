import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { BoardViewModel } from "@mikan/core";
import type { ApiError } from "../src/index.ts";

if (!(globalThis as { document?: unknown }).document) {
	GlobalRegistrator.register();
}

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { Board } = await import("../src/components/board.tsx");

afterEach(() => cleanup());

function board(): BoardViewModel {
	return {
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
			{ id: "active", title: "Active", cards: [] },
		],
		warnings: [],
		labels: [],
	};
}

const MOVE_ERROR: ApiError = {
	code: "unknown_status",
	message: "Unknown Status: nope",
};

describe("Board move wiring", () => {
	test("renders drag-enabled Cards and drop-target Columns when onMoveIssue is set", () => {
		render(
			<Board
				board={board()}
				repository={undefined}
				onRepositoryChange={() => {}}
				onMoveIssue={() => {}}
			/>,
		);
		// Status Columns are the drop targets; the Card is the drag source. The
		// pragmatic-drag-and-drop effects attach without throwing in happy-dom.
		expect(screen.getAllByTestId("board-column").length).toBe(2);
		const card = screen.getByTestId("board-card");
		expect(card.getAttribute("data-issue-id")).toBe("MIK-200");
	});

	test("shows a board-level banner for a move error and can dismiss it", () => {
		let dismissed = false;
		render(
			<Board
				board={board()}
				repository={undefined}
				onRepositoryChange={() => {}}
				onMoveIssue={() => {}}
				moveError={MOVE_ERROR}
				onDismissMoveError={() => {
					dismissed = true;
				}}
			/>,
		);
		const banner = screen.getByTestId("board-move-error");
		expect(banner.getAttribute("role")).toBe("alert");
		expect(banner.textContent).toContain("unknown_status");
		expect(banner.textContent).toContain("Unknown Status: nope");
		// The board still renders its lanes alongside the error.
		expect(screen.getAllByTestId("board-column").length).toBe(2);

		fireEvent.click(screen.getByTestId("board-move-error-dismiss"));
		expect(dismissed).toBe(true);
	});

	test("omits the banner when there is no move error", () => {
		render(
			<Board
				board={board()}
				repository={undefined}
				onRepositoryChange={() => {}}
				onMoveIssue={() => {}}
			/>,
		);
		expect(screen.queryByTestId("board-move-error")).toBeNull();
	});
});
