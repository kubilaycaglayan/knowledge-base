import type { BoardCard } from "../stores/boards";
import { BOARD_PRIORITIES, byPriorityThenPosition } from "./board-priority";

const card = (id: string, priority: BoardCard["priority"], position: number) =>
  ({ id, priority, position }) as BoardCard;

// TH-19 (docs/test-hardening-plan.md)
describe("board priority ordering", () => {
  it("lists priorities from most to least pressing", () => {
    expect(BOARD_PRIORITIES.map((priority) => priority.value)).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);
  });

  it("orders by priority, then by manual position", () => {
    const cards = [
      card("low", "LOW", 0),
      card("medium-2", "MEDIUM", 2),
      card("urgent", "URGENT", 5),
      card("medium-1", "MEDIUM", 1),
      card("high", "HIGH", 9),
    ];
    expect([...cards].sort(byPriorityThenPosition).map((value) => value.id)).toEqual([
      "urgent",
      "high",
      "medium-1",
      "medium-2",
      "low",
    ]);
  });
});
