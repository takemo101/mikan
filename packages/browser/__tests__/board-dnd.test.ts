import { describe, expect, test } from "bun:test";
import {
	CARD_DRAG_KEY,
	isCardDragData,
	makeCardDragData,
	resolveMoveOnDrop,
} from "../src/client/board-dnd.ts";

// Pure, browser-agnostic drag/drop logic. Exercising it directly avoids
// simulating a native drag while still proving the core move-on-drop decision:
// a cross-Column drop yields a move, a same-Column drop is a no-op, and only
// Card payloads are recognised by a drop target.

describe("resolveMoveOnDrop", () => {
	test("returns a move command for a cross-Column drop", () => {
		const command = resolveMoveOnDrop({
			issueId: "MIK-001",
			fromColumnId: "ready",
			toColumnId: "active",
		});
		expect(command).toEqual({ id: "MIK-001", status: "active" });
	});

	test("is a no-op when dropped back on the same Column", () => {
		const command = resolveMoveOnDrop({
			issueId: "MIK-001",
			fromColumnId: "ready",
			toColumnId: "ready",
		});
		expect(command).toBeNull();
	});

	test("is a no-op when the target Column is empty/unknown", () => {
		expect(
			resolveMoveOnDrop({
				issueId: "MIK-001",
				fromColumnId: "ready",
				toColumnId: "",
			}),
		).toBeNull();
	});

	test("is a no-op without an Issue id", () => {
		expect(
			resolveMoveOnDrop({
				issueId: "",
				fromColumnId: "ready",
				toColumnId: "active",
			}),
		).toBeNull();
	});
});

describe("card drag data", () => {
	test("stamps a recognisable payload with issue and source Column", () => {
		const data = makeCardDragData("MIK-001", "ready");
		expect(data[CARD_DRAG_KEY]).toBe(true);
		expect(data.issueId).toBe("MIK-001");
		expect(data.columnId).toBe("ready");
		expect(isCardDragData(data)).toBe(true);
	});

	test("ignores foreign or malformed drag payloads", () => {
		expect(isCardDragData(null)).toBe(false);
		expect(isCardDragData({})).toBe(false);
		expect(isCardDragData({ issueId: "MIK-001", columnId: "ready" })).toBe(
			false,
		);
		expect(
			isCardDragData({ [CARD_DRAG_KEY]: true, issueId: 1, columnId: "ready" }),
		).toBe(false);
	});
});
