import { describe, expect, it } from "vitest";
import { ALL_BOARDS, columnKey, compareCards, dropPosition, nextSort } from "./board-merge";
import type { BoardCard } from "../stores/boards";

const card = (id: string, statusId: string, position: number, priority: BoardCard["priority"] = "MEDIUM"): BoardCard => ({ id, statusId, title: id, body: "{}", priority, position, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" });

describe("board-merge", () => {
  it("uses 'all' as the All boards selection", () => {
    expect(ALL_BOARDS).toBe("all");
  });

  it("merges column names trimmed and case-insensitively", () => {
    expect(columnKey("  In Progress ")).toBe(columnKey("in progress"));
    expect(columnKey("Done")).not.toBe(columnKey("Doing"));
  });

  // AB-13
  it("cycles the column sort Unsorted → Priority first → Priority last", () => {
    expect(nextSort("MANUAL")).toBe("PRIORITY");
    expect(nextSort("PRIORITY")).toBe("PRIORITY_LAST");
    expect(nextSort("PRIORITY_LAST")).toBe("MANUAL");
    expect(nextSort(undefined)).toBe("PRIORITY");
  });

  // AB-03, AB-13
  it("orders mixed columns by position with board order breaking ties, or by priority either way", () => {
    const rank = (statusId: string) => ["work", "home"].indexOf(statusId);
    const cards = [card("w0", "work", 0, "LOW"), card("w1", "work", 1, "URGENT"), card("h0", "home", 0, "HIGH"), card("h1", "home", 1, "LOW"), card("w2", "work", 2, "MEDIUM")];
    expect([...cards].sort(compareCards("MANUAL", rank)).map((c) => c.id)).toEqual(["w0", "h0", "w1", "h1", "w2"]);
    expect([...cards].sort(compareCards("PRIORITY", rank)).map((c) => c.id)).toEqual(["w1", "h0", "w2", "w0", "h1"]);
    expect([...cards].sort(compareCards("PRIORITY_LAST", rank)).map((c) => c.id)).toEqual(["w0", "h1", "w2", "h0", "w1"]);
    expect([card("b", "s", 1), card("a", "s", 0)].sort(compareCards(undefined)).map((c) => c.id)).toEqual(["a", "b"]);
  });

  // AB-15
  describe("dropPosition", () => {
    const column = [card("w0", "work", 0), card("h0", "home", 0), card("w1", "work", 1), card("h1", "home", 1), card("w2", "work", 2)];

    it("counts the card's own-column cards above the drop point", () => {
      expect(dropPosition(column, "h1", column[4], "work")).toBe(2);
      expect(dropPosition(column, "h0", column[4], "work")).toBe(1);
      expect(dropPosition(column, "w0", column[4], "work")).toBe(0);
    });

    it("ignores the dragged card itself and drops at the end without a target", () => {
      expect(dropPosition(column, "w2", column[0], "work")).toBe(1);
      expect(dropPosition(column, null, column[0], "work")).toBe(2);
      expect(dropPosition(column, "missing", column[0], "work")).toBe(2);
    });

    it("places a card from another column among its own board's cards", () => {
      const incoming = card("x", "work-elsewhere", 5);
      expect(dropPosition(column, "h1", incoming, "work")).toBe(2);
    });
  });
});
