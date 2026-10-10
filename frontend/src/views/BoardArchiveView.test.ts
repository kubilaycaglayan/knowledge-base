import { flushPromises, mount } from "@vue/test-utils";
import BoardArchiveView from "./BoardArchiveView.vue";
import { useBoardsStore } from "../stores/boards";
import { useRouter, useRoute } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { vi } from "vitest";

vi.mock("vue-router", () => ({
  useRouter: vi.fn(),
  useRoute: vi.fn(),
}));

vi.mock("../lib/api");

const board = (id: string, name: string) => ({ id, name, archived: true, createdAt: "", updatedAt: "" });

describe("BoardArchiveView", () => {
  let mockRouter: any;
  let mockRoute: any;

  const routerLinkStub = {
    props: ["to"],
    template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockRouter = { replace: vi.fn(() => Promise.resolve()), push: vi.fn(() => Promise.resolve()) };
    mockRoute = { query: { board: "board-1" } };
    vi.mocked(useRouter).mockReturnValue(mockRouter);
    vi.mocked(useRoute).mockReturnValue(mockRoute);

    const store = useBoardsStore();
    const noop = () => Promise.resolve();
    (store.loadBoards as any) = vi.fn(noop);
    (store.loadBoard as any) = vi.fn(noop);
    (store.loadArchivedCards as any) = vi.fn(noop);
    (store.archiveBoard as any) = vi.fn(() => Promise.resolve(null));
    (store.archiveStatus as any) = vi.fn(noop);
    (store.archiveCard as any) = vi.fn(noop);
    store.selectedId = "board-1";
    store.boards = [{ ...board("board-1", "Active board"), archived: false }];
  });

  function mountArchive() {
    return mount(BoardArchiveView, {
      global: { mocks: { $route: mockRoute, $router: mockRouter }, stubs: { RouterLink: routerLinkStub } },
    });
  }

  it("scrolls to and marks the archived card a search result links to", async () => {
    mockRoute.query = { board: "board-1", card: "card-2" };
    const store = useBoardsStore();
    (store.loadArchivedCards as any) = vi.fn(async () => {
      store.archivedCards = [
        { id: "card-1", title: "First", archived: true } as any,
        { id: "card-2", title: "Linked", archived: true } as any,
      ];
    });
    const scrolled = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = scrolled;
    const wrapper = mount(BoardArchiveView, {
      attachTo: document.body,
      global: { mocks: { $route: mockRoute, $router: mockRouter }, stubs: { RouterLink: routerLinkStub } },
    });
    try {
      await flushPromises();
      const row = wrapper.get("#archive-card-card-2");
      expect(row.classes()).toContain("archive-row-highlight");
      expect(wrapper.get("#archive-card-card-1").classes()).not.toContain("archive-row-highlight");
      expect(document.activeElement).toBe(row.element);
      expect(scrolled).toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      delete (HTMLElement.prototype as any).scrollIntoView;
    }
  });

  it("marks an archived board named by the link, whether as archivedBoard or board", async () => {
    for (const query of [{ archivedBoard: "gone" }, { board: "gone" }]) {
      mockRoute.query = query;
      const store = useBoardsStore();
      (store.loadBoards as any) = vi.fn(async (archived?: boolean) => {
        if (archived) store.archivedBoards = [board("gone", "Retired board"), board("other", "Other")] as any;
      });
      const wrapper = mountArchive();
      await flushPromises();
      expect(wrapper.get("#archive-board-gone").classes()).toContain("archive-row-highlight");
      expect(wrapper.get("#archive-board-other").classes()).not.toContain("archive-row-highlight");
      // An archived board is not swapped for the selected active one.
      expect(mockRouter.replace).not.toHaveBeenCalled();
      wrapper.unmount();
    }
  });

  it("ignores a linked card that is no longer archived", async () => {
    mockRoute.query = { board: "board-1", card: "restored" };
    const wrapper = mountArchive();
    await flushPromises();
    expect(wrapper.find(".archive-row-highlight").exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders the three archive sections with their own headings", async () => {
    const wrapper = mountArchive();
    await flushPromises();

    expect(wrapper.find("h1#archive-heading").text()).toBe("Archive");
    expect(wrapper.find("#archived-boards-heading").text()).toContain("Archived boards");
    expect(wrapper.find("#archived-statuses-heading").text()).toContain("Archived statuses");
    expect(wrapper.find("#archived-cards-heading").text()).toContain("Archived cards");
    await wrapper.unmount();
  });

  it("states each section is empty rather than rendering nothing", async () => {
    const wrapper = mountArchive();
    await flushPromises();

    const empties = wrapper.findAll(".column-empty").map((node) => node.text());
    expect(empties).toEqual(["No archived boards.", "No archived statuses.", "No archived cards."]);
    await wrapper.unmount();
  });

  it("links back to the board it was opened from", async () => {
    mockRoute.query = { board: "board-2" };
    const store = useBoardsStore();
    store.boards = [
      { ...board("board-1", "Active board"), archived: false },
      { ...board("board-2", "Second board"), archived: false },
    ];
    store.selectedId = "board-1";
    const wrapper = mountArchive();
    await flushPromises();

    const back = wrapper.find('a[aria-label="Back to board"]');
    expect(back.exists()).toBe(true);
    expect(back.attributes("href")).toBe("/board");
    expect(store.selectedId).toBe("board-2");
    await wrapper.unmount();
  });

  it("restores an archived board through an icon button", async () => {
    const store = useBoardsStore();
    store.archivedBoards = [board("board-2", "Old board")];
    const wrapper = mountArchive();
    await flushPromises();

    const restore = wrapper.find('button[aria-label="Restore Old board board"]');
    expect(restore.exists()).toBe(true);
    expect(restore.text()).toBe("↩");

    await restore.trigger("click");
    await flushPromises();
    expect(store.archiveBoard).toHaveBeenCalledWith("board-2", true);
    await wrapper.unmount();
  });

  it("explains that a merged path board returns with its path instead of offering restore", async () => {
    const store = useBoardsStore();
    store.archivedBoards = [{ ...board("board-3", "Merged path"), pathId: "path-9" }];
    const wrapper = mountArchive();
    await flushPromises();

    expect(wrapper.find('button[aria-label="Restore Merged path board"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Returns when its path is restored");
    await wrapper.unmount();
  });

  it("restores an archived status through an icon button", async () => {
    const store = useBoardsStore();
    store.statuses = [
      { id: "status-1", name: "Done", archived: true, position: 0 },
      { id: "status-2", name: "Backlog", archived: false, position: 1 },
    ];
    const wrapper = mountArchive();
    await flushPromises();

    // Only the archived status is listed.
    expect(wrapper.findAll(".archive-row").map((row) => row.text())).toEqual(["Done↩"]);

    await wrapper.find('button[aria-label="Restore Done status"]').trigger("click");
    await flushPromises();
    expect(store.archiveStatus).toHaveBeenCalledWith(store.statuses[0], true);
    await wrapper.unmount();
  });

  it("restores an archived card and names untitled cards accessibly", async () => {
    const store = useBoardsStore();
    const archivedCard = {
      id: "card-1",
      statusId: "status-1",
      title: "",
      body: "{}",
      priority: "MEDIUM" as const,
      position: 0,
      archived: true,
      pathIds: [],
      labelIds: [],
      createdAt: "",
      updatedAt: "",
    };
    store.archivedCards = [archivedCard];
    const wrapper = mountArchive();
    await flushPromises();

    expect(wrapper.find(".archive-row strong").text()).toBe("");
    expect(wrapper.text()).not.toContain("Untitled card");
    await wrapper.find('button[aria-label="Restore untitled card"]').trigger("click");
    await flushPromises();
    expect(store.archiveCard).toHaveBeenCalledWith(archivedCard, true);
    await wrapper.unmount();
  });

  it("surfaces a dismissible error when a restore fails", async () => {
    const store = useBoardsStore();
    store.archivedBoards = [board("board-2", "Old board")];
    (store.archiveBoard as any) = vi.fn(() => Promise.reject(new Error("nope")));
    const wrapper = mountArchive();
    await flushPromises();

    await wrapper.find('button[aria-label="Restore Old board board"]').trigger("click");
    await flushPromises();

    const error = wrapper.find(".board-error");
    expect(error.text()).toContain("Could not restore board.");
    await error.find('button[aria-label="Dismiss archive error"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".board-error").exists()).toBe(false);
    await wrapper.unmount();
  });
});
