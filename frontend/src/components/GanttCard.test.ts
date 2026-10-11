import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import GanttCard from "./GanttCard.vue";
import { useBoardsStore } from "../stores/boards";

describe("GanttCard", () => {
  it("shows selected details in aligned chips beside the timeline bar", () => {
    setActivePinia(createPinia());
    const wrapper = mount(GanttCard, {
      props: {
        card: { id: "card-1", boardId: "board-1", statusId: "status-1", title: "Release", body: "{}", priority: "HIGH", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "", startDate: "2026-09-01", dueDate: "2026-09-05" },
        days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
        showPriority: true, showStatus: true, showPath: true, statusName: "In progress", pathName: "Website",
      },
    });
    expect(wrapper.findAll(".timeline-card-chip").map((chip) => chip.text())).toEqual(["HIGH", "In progress", "Website"]);
    expect(wrapper.get(".timeline-card-details").attributes("aria-hidden")).toBe("true");
    wrapper.unmount();
  });

  it("keeps the card title pinned to the left edge of its available bar space", () => {
    setActivePinia(createPinia());
    const wrapper = mount(GanttCard, {
      props: {
        card: {
          id: "card-1", boardId: "board-1", statusId: "status-1", title: "A long card title",
          body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [],
          createdAt: "", updatedAt: "", startDate: "2026-09-01", dueDate: "2026-09-05",
        },
        color: "#123456",
        textColor: "#102030",
        days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
      },
    });

    const title = wrapper.get(".timeline-bar-title").element;
    expect(getComputedStyle(title).position).toBe("sticky");
    expect(getComputedStyle(title).left).toBe("0px");
    expect(getComputedStyle(title).paddingLeft).toBe("4px");
    expect(wrapper.get(".timeline-card").attributes("style")).toContain("--timeline-card-text-color: #102030");
    wrapper.unmount();
  });

  it("moves and resizes a dated card with the keyboard", async () => {
    setActivePinia(createPinia());
    const store = useBoardsStore();
    const update = vi.spyOn(store, "updateCard").mockResolvedValue({} as any);
    const card = {
      id: "card-1", boardId: "board-1", statusId: "status-1", title: "Release",
      body: "{}", priority: "HIGH", position: 0, archived: false, pathIds: [], labelIds: [],
      createdAt: "", updatedAt: "", startDate: "2026-09-01", dueDate: "2026-09-03",
    };
    const wrapper = mount(GanttCard, {
      props: { card, days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"] },
    });

    await wrapper.get(".timeline-bar").trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    expect(update).toHaveBeenNthCalledWith(1, card, expect.objectContaining({ startDate: "2026-09-02", dueDate: "2026-09-04" }));

    await wrapper.get(".timeline-resize:last-child").trigger("keydown", { key: "ArrowLeft" });
    await flushPromises();
    expect(update).toHaveBeenNthCalledWith(2, card, expect.objectContaining({ startDate: "2026-09-01", dueDate: "2026-09-02" }));
    expect(wrapper.get('[role="status"]').text()).toBe("Dates saved.");
    wrapper.unmount();
  });

  it("sets a one-day or inclusive range on an unscheduled card with the keyboard", async () => {
    setActivePinia(createPinia());
    const store = useBoardsStore();
    const update = vi.spyOn(store, "updateCard").mockResolvedValue({} as any);
    const card = {
      id: "card-1", boardId: "board-1", statusId: "status-1", title: "Release",
      body: "{}", priority: "HIGH", position: 0, archived: false, pathIds: [], labelIds: [],
      createdAt: "", updatedAt: "",
    };
    const wrapper = mount(GanttCard, {
      props: { card: card as any, days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"] },
    });
    const target = wrapper.get(".timeline-unscheduled");
    await target.trigger("keydown", { key: "ArrowRight" });
    await target.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    await target.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(update).toHaveBeenCalledWith(card, expect.objectContaining({ startDate: "2026-09-02", dueDate: "2026-09-03" }));
    expect(wrapper.get('[role="status"]').text()).toBe("Date range saved.");
    wrapper.unmount();
  });
});
