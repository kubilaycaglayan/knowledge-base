import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";
import GanttCard from "./GanttCard.vue";

describe("GanttCard", () => {
  it("keeps the card title pinned to the left edge of its available bar space", () => {
    setActivePinia(createPinia());
    const wrapper = mount(GanttCard, {
      props: {
        card: {
          id: "card-1", boardId: "board-1", statusId: "status-1", title: "A long card title",
          body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [],
          createdAt: "", updatedAt: "", startDate: "2026-09-01", dueDate: "2026-09-05",
        },
        days: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
      },
    });

    const title = wrapper.get(".timeline-bar-title").element;
    expect(getComputedStyle(title).position).toBe("sticky");
    expect(getComputedStyle(title).left).toBe("0px");
    expect(getComputedStyle(title).paddingLeft).toBe("4px");
    wrapper.unmount();
  });
});
