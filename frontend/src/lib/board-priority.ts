import type { BoardCard } from "../stores/boards";

export type BoardPriority = BoardCard["priority"];

/** Board card priorities from most to least pressing. */
export const BOARD_PRIORITIES: ReadonlyArray<{ value: BoardPriority; label: string }> = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const rank = Object.fromEntries(BOARD_PRIORITIES.map((priority, index) => [priority.value, index])) as Record<BoardPriority, number>;

/** Orders cards the way a priority-sorted column does: priority first, then manual position. */
export const byPriorityThenPosition = (a: BoardCard, b: BoardCard) => rank[a.priority] - rank[b.priority] || a.position - b.position;
