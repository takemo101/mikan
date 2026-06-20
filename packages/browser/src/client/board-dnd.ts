// Pure, browser-agnostic drag-and-drop logic for the board.
//
// The pragmatic-drag-and-drop wiring (refs, native drag events) lives in
// `use-board-dnd.ts`; this module holds only the data shape carried by a drag
// and the decision of what a drop means. Keeping that decision pure makes the
// move-on-drop behavior testable in happy-dom without simulating a native drag:
// given a dragged Card's source Status and the Status Column it was dropped on,
// `resolveMoveOnDrop` returns the move to perform, or `null` for a no-op.

// Discriminator stamped onto every Card drag payload so a Status Column drop
// target only reacts to Cards from this board and ignores unrelated drags.
export const CARD_DRAG_KEY = "mikan-card";

export type CardDragData = {
	[CARD_DRAG_KEY]: true;
	issueId: string;
	// The Status Column the Card was dragged from, used to skip same-Column drops.
	columnId: string;
};

// A resolved move: send Issue `id` to target Status `status` (a Column id).
export type MoveCommand = {
	id: string;
	status: string;
};

export function makeCardDragData(
	issueId: string,
	columnId: string,
): CardDragData {
	return { [CARD_DRAG_KEY]: true, issueId, columnId };
}

export function isCardDragData(value: unknown): value is CardDragData {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<string, unknown>)[CARD_DRAG_KEY] === true &&
		typeof (value as CardDragData).issueId === "string" &&
		typeof (value as CardDragData).columnId === "string"
	);
}

// Decide what dropping a Card on a Status Column means. Dropping onto the same
// Column (or onto an empty/invalid target) is a no-op so the board never issues
// a redundant move write; a cross-Column drop yields the move to that Status.
export function resolveMoveOnDrop(args: {
	issueId: string;
	fromColumnId: string;
	toColumnId: string;
}): MoveCommand | null {
	if (args.issueId.length === 0 || args.toColumnId.length === 0) return null;
	if (args.fromColumnId === args.toColumnId) return null;
	return { id: args.issueId, status: args.toColumnId };
}
