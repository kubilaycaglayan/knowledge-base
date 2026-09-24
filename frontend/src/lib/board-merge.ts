import type { BoardCard, BoardCardSort } from "../stores/boards";
import { BOARD_PRIORITIES } from "./board-priority";

/** The Boards page selection (and `?board=` value) that shows every tab board together. */
export const ALL_BOARDS = "all";

/** Columns merge by name, trimmed and case-insensitive, as the server does. */
export const columnKey = (name: string) => name.trim().toLowerCase();

/** A merged column's page cursor lives beside the per-status cursors under this key. */
export const columnCursor = (key: string) => `column:${key}`;

const SORT_CYCLE: BoardCardSort[] = ["MANUAL", "PRIORITY", "PRIORITY_LAST"];

/** The column sort button cycles Unsorted → Priority first → Priority last. */
export const nextSort = (sort: BoardCardSort | undefined) => SORT_CYCLE[(SORT_CYCLE.indexOf(sort || "MANUAL") + 1) % SORT_CYCLE.length];

const rank = Object.fromEntries(BOARD_PRIORITIES.map((priority, index) => [priority.value, index])) as Record<BoardCard["priority"], number>;

/**
 * Orders a column's cards. Unsorted columns go by manual position; cards of a merged column mix,
 * so equal positions fall back to the board's tab order (`statusRank`). Priority sorts put Urgent
 * or Low first and keep that order for ties.
 */
export function compareCards(sort: BoardCardSort | undefined, statusRank: (statusId: string) => number = () => 0) {
  const mixed = (a: BoardCard, b: BoardCard) => a.position - b.position || statusRank(a.statusId) - statusRank(b.statusId) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (sort === "PRIORITY") return (a: BoardCard, b: BoardCard) => rank[a.priority] - rank[b.priority] || mixed(a, b);
  if (sort === "PRIORITY_LAST") return (a: BoardCard, b: BoardCard) => rank[b.priority] - rank[a.priority] || mixed(a, b);
  return mixed;
}

/**
 * Where a card dropped just before `beforeId` in a mixed column lands in its own status: the
 * number of that status's other cards shown above the drop point. No target means the end.
 */
export function dropPosition(columnCards: BoardCard[], beforeId: string | null, card: BoardCard, statusId: string) {
  const others = columnCards.filter((item) => item.id !== card.id);
  const found = beforeId ? others.findIndex((item) => item.id === beforeId) : -1;
  const cut = found < 0 ? others.length : found;
  return others.slice(0, cut).filter((item) => item.statusId === statusId).length;
}
