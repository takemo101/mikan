import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
	draggable,
	dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { type RefObject, useEffect, useState } from "react";
import {
	isCardDragData,
	type MoveCommand,
	makeCardDragData,
	resolveMoveOnDrop,
} from "./board-dnd.ts";

// React wiring for Atlassian Pragmatic Drag and Drop on the board.
//
// `useCardDraggable` makes a Card element draggable and stamps the drag with its
// Issue id and source Status Column. `useColumnDropTarget` makes a Status Column
// element a drop target; on drop it reads the Card's drag data, resolves the move
// through the pure `resolveMoveOnDrop` (which no-ops same-Column drops), and fires
// `onMove`. Card reordering is intentionally not implemented — only Column-to-
// Column Status moves. Both hooks return a boolean so callers can reflect the
// drag/drop-over state visually.

export function useCardDraggable(
	ref: RefObject<HTMLElement | null>,
	args: { issueId: string; columnId: string },
): boolean {
	const [dragging, setDragging] = useState(false);
	const { issueId, columnId } = args;
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		return draggable({
			element,
			getInitialData: () => makeCardDragData(issueId, columnId),
			onDragStart: () => setDragging(true),
			onDrop: () => setDragging(false),
		});
	}, [ref, issueId, columnId]);
	return dragging;
}

export function useColumnDropTarget(
	ref: RefObject<HTMLElement | null>,
	args: { columnId: string; onMove: (command: MoveCommand) => void },
): boolean {
	const [isOver, setIsOver] = useState(false);
	const { columnId, onMove } = args;
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		return combine(
			dropTargetForElements({
				element,
				canDrop: ({ source }) => isCardDragData(source.data),
				onDragEnter: () => setIsOver(true),
				onDragLeave: () => setIsOver(false),
				onDrop: ({ source }) => {
					setIsOver(false);
					if (!isCardDragData(source.data)) return;
					const command = resolveMoveOnDrop({
						issueId: source.data.issueId,
						fromColumnId: source.data.columnId,
						toColumnId: columnId,
					});
					if (command) onMove(command);
				},
			}),
		);
	}, [ref, columnId, onMove]);
	return isOver;
}
