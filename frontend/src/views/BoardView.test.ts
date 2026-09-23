import { flushPromises, mount } from "@vue/test-utils";
import BoardView from "./BoardView.vue";
import vuetify from "../plugins/vuetify";
import { useBoardsStore } from "../stores/boards";
import { usePathsStore } from "../stores/paths";
import { useLabelsStore } from "../stores/labels";
import { useRouter, useRoute } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, vi } from "vitest";

vi.mock("vue-router", () => ({
  useRouter: vi.fn(),
  useRoute: vi.fn(),
}));

vi.mock("../lib/api");

describe("BoardView", () => {
  let mockRouter: any;
  let mockRoute: any;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    mockRouter = {
      replace: vi.fn(() => Promise.resolve()),
      push: vi.fn(() => Promise.resolve()),
    };

    mockRoute = {
      query: {},
    };

    vi.mocked(useRouter).mockReturnValue(mockRouter);
    vi.mocked(useRoute).mockReturnValue(mockRoute);

    // Initialize stores with mock implementations
    const boardsStore = useBoardsStore();
    const pathsStore = usePathsStore();
    const labelsStore = useLabelsStore();

    // Mock store actions to prevent API calls
    const noop = () => Promise.resolve();
    (boardsStore.loadBoards as any) = vi.fn(noop);
    (boardsStore.loadBoard as any) = vi.fn(noop);
    (boardsStore.loadGantt as any) = vi.fn(noop);
    (boardsStore.loadMore as any) = vi.fn(noop);
    (boardsStore.loadArchivedCards as any) = vi.fn(noop);
    (boardsStore.createBoard as any) = vi.fn(() => Promise.resolve(null));
    (boardsStore.updateBoard as any) = vi.fn(() => Promise.resolve(null));
    (boardsStore.archiveBoard as any) = vi.fn(() => Promise.resolve(null));
    (boardsStore.createCard as any) = vi.fn(() => Promise.resolve(null));
    (boardsStore.updateCard as any) = vi.fn(noop);
    (boardsStore.archiveCard as any) = vi.fn(noop);
    (boardsStore.moveCard as any) = vi.fn(noop);
    (boardsStore.createStatus as any) = vi.fn(noop);
    (boardsStore.updateStatus as any) = vi.fn(noop);
    (boardsStore.archiveStatus as any) = vi.fn(noop);
    (boardsStore.reorderStatuses as any) = vi.fn(() => Promise.resolve([]));

    (pathsStore.load as any) = vi.fn(() => Promise.resolve([]));
    (labelsStore.loadScope as any) = vi.fn(() => Promise.resolve([]));
  });

  // vue-router is mocked away above, so RouterLink has to be stubbed as a real
  // anchor for the archive navigation assertions to inspect an href.
  const routerLinkStub = {
    props: ["to"],
    template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
  };

  function mountBoard() {
    return mount(BoardView, {
      global: {
        plugins: [vuetify],
        mocks: { $route: mockRoute, $router: mockRouter },
        stubs: { RouterLink: routerLinkStub },
      },
    });
  }

  function seedBoard(statusNames: string[] = []) {
    const store = useBoardsStore();
    store.selectedId = "test-id";
    store.boards = [{ id: "test-id", name: "Test Board", archived: false, createdAt: "", updatedAt: "" }];
    store.statuses = statusNames.map((name, position) => ({ id: `status-${position + 1}`, name, archived: false, position }));
    store.cards = [];
    mockRoute.query = { board: "test-id" };
    return store;
  }

  it("renders the board page with proper structure", async () => {
    const wrapper = mountBoard();

    expect(wrapper.find(".board-page").exists()).toBe(true);
    expect(wrapper.find("h1#board-heading").text()).toContain("Boards");
    await wrapper.unmount();
  });

  it("opens a new-board dialog from the add-board button instead of an inline form", async () => {
    const wrapper = mountBoard();

    expect(wrapper.find('input[name="boardName"]').exists()).toBe(false);
    await wrapper.find('button[aria-label="Add board"]').trigger("click");
    const dialog = wrapper.find('[role="dialog"][aria-labelledby="new-board-title"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.find('input[name="boardName"]').exists()).toBe(true);
    expect(dialog.findAll("button").map((button) => button.text())).toEqual(["Cancel", "Create"]);
    await dialog.findAll("button")[0].trigger("click");
    expect(wrapper.find('[aria-labelledby="new-board-title"]').exists()).toBe(false);
    await wrapper.unmount();
  });

  it("validates an empty board name inside the dialog without creating a board", async () => {
    const wrapper = mountBoard();
    const store = useBoardsStore();
    const create = vi.spyOn(store, "createBoard");

    await wrapper.find('button[aria-label="Add board"]').trigger("click");
    await wrapper.find(".new-board-dialog").trigger("submit");
    expect(wrapper.find("#new-board-error").text()).toBe("Enter a board name.");
    expect(create).not.toHaveBeenCalled();
    await wrapper.unmount();
  });

  it("creates the board from the dialog and closes it", async () => {
    const wrapper = mountBoard();
    const store = useBoardsStore();
    const create = vi.spyOn(store, "createBoard").mockResolvedValue(undefined as never);

    await wrapper.find('button[aria-label="Add board"]').trigger("click");
    await wrapper.find("#new-board-name").setValue("  Launch  ");
    await wrapper.find(".new-board-dialog").trigger("submit");
    await flushPromises();
    expect(create).toHaveBeenCalledWith("Launch");
    expect(wrapper.find(".new-board-dialog").exists()).toBe(false);
    await wrapper.unmount();
  });

  it("keeps the add-board button beside the view switch without a visible page title", async () => {
    const wrapper = mountBoard();

    expect(wrapper.find(".board-header").exists()).toBe(false);
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    expect(wrapper.find("h1#board-heading").classes()).toContain("sr-only");
    const actions = wrapper.find(".board-toolbar .board-view-actions");
    expect(actions.find('button[aria-label="Add board"]').exists()).toBe(true);
    expect(actions.element.lastElementChild?.classList.contains("view-switch")).toBe(true);
    await wrapper.unmount();
  });

  it("shows plus button for adding boards (icon button)", async () => {
    const wrapper = mountBoard();

    const addButton = wrapper.find('button[aria-label="Add board"]');
    expect(addButton.exists()).toBe(true);
    expect(addButton.text()).toContain("＋");
    await wrapper.unmount();
  });

  it("displays error message with close button", async () => {
    const wrapper = mountBoard();

    const store = useBoardsStore();
    store.error = "Test error message";
    await wrapper.vm.$nextTick();

    const errorMsg = wrapper.find(".board-error");
    expect(errorMsg.exists()).toBe(true);
    expect(errorMsg.text()).toContain("Test error message");

    const dismissButton = errorMsg.find('button[aria-label="Dismiss board error"]');
    expect(dismissButton.exists()).toBe(true);
    expect(dismissButton.text()).toBe("×");

    await dismissButton.trigger("click");
    expect(store.error).toBe("");
    await wrapper.unmount();
  });

  it("displays error message that disappears after action", async () => {
    const wrapper = mountBoard();

    const store = useBoardsStore();
    store.error = "Unable to load boards.";
    await flushPromises();
    expect(wrapper.find(".board-error").text()).toContain("Unable to load boards.");

    await wrapper.find('button[aria-label="Dismiss board error"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".board-error").exists()).toBe(false);
    await wrapper.unmount();
  });

  it("clears a standing error when the next action succeeds", async () => {
    const store = seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    store.error = "Could not create card.";
    await flushPromises();
    expect(wrapper.find(".board-error").exists()).toBe(true);

    await wrapper.find('button[aria-label="Add card to Backlog"]').trigger("click");
    await flushPromises();

    expect(store.createCard).toHaveBeenCalled();
    expect(wrapper.find(".board-error").exists()).toBe(false);
    await wrapper.unmount();
  });

  it("toggles between Kanban and Gantt views", async () => {
    mockRoute.query = { view: "kanban" };
    const wrapper = mountBoard();

    const viewButtons = wrapper.findAll(".view-switch button");
    expect(viewButtons.length).toBe(2);
    expect(viewButtons[0].text()).toBe("Kanban");
    expect(viewButtons[1].text()).toBe("Gantt");
    await wrapper.unmount();
  });

  it("does not display JSON objects in card output", async () => {
    const wrapper = mountBoard();

    // Check that no rendered text contains raw JSON patterns like {}
    const html = wrapper.html();
    // The only place {} should appear is in a code comment or data structure,
    // not in rendered text visible to users
    const visibleText = wrapper.text();
    expect(visibleText).not.toMatch(/^\s*\{\}\s*$/m);
    expect(visibleText).not.toMatch(/body.*\{\}/);
    await wrapper.unmount();
  });

  it("shows board selection as tabs", async () => {
    mockRoute.query = {};
    const store = useBoardsStore();
    store.boards = [
      { id: "board-1", name: "Board 1", archived: false, createdAt: "", updatedAt: "" },
      { id: "board-2", name: "Board 2", archived: false, createdAt: "", updatedAt: "" },
    ];
    store.selectedId = "board-1";

    const wrapper = mountBoard();

    const boardTabs = wrapper.findAll(".board-tab");
    expect(boardTabs.length).toBe(2);
    expect(boardTabs[0].text()).toBe("Board 1");
    expect(boardTabs[1].text()).toBe("Board 2");
    expect(boardTabs[0].classes()).toContain("selected");
    await wrapper.unmount();
  });

  it("only switches boards from a tab click, never renames inline", async () => {
    const store = seedBoard();
    store.boards.push({ id: "other-id", name: "Other", archived: false, createdAt: "", updatedAt: "" });
    const wrapper = mountBoard();
    await flushPromises();

    await wrapper.find(".board-tab.selected").trigger("click");
    expect(wrapper.find("input[aria-label='Board name']").exists()).toBe(false);
    expect(store.loadBoard).not.toHaveBeenCalledTimes(2);
    const other = wrapper.findAll(".board-tab").find((tab) => tab.text() === "Other")!;
    await other.trigger("click");
    expect(store.selectedId).toBe("other-id");
    await wrapper.unmount();
  });
  it("clicking an unselected board tab switches boards instead of renaming", async () => {
    const store = seedBoard();
    store.boards = [
      ...store.boards,
      { id: "other-id", name: "Other Board", archived: false, createdAt: "", updatedAt: "" },
    ];
    const wrapper = mountBoard();
    await flushPromises();

    const tabs = wrapper.findAll(".board-tab");
    const other = tabs.find((tab) => tab.text() === "Other Board")!;
    await other.trigger("click");
    await flushPromises();

    expect(store.selectedId).toBe("other-id");
    expect(wrapper.find(".board-tab-edit").exists()).toBe(false);
    expect(store.updateBoard).not.toHaveBeenCalled();
    await wrapper.unmount();
  });

  it("opens another board's settings from its gear without switching to it", async () => {
    const store = seedBoard(["Backlog"]);
    store.boards.push({ id: "other-id", name: "Other", archived: false, createdAt: "", updatedAt: "" });
    const otherStatuses = [{ id: "o-1", name: "Ideas", archived: false, position: 0 }, { id: "o-2", name: "Shipped", archived: false, position: 1 }];
    (store as any).fetchStatuses = vi.fn(() => Promise.resolve(otherStatuses.map((status) => ({ ...status }))));
    (store.createStatus as any) = vi.fn(() => Promise.resolve({ id: "o-3", name: "Later", archived: false, position: 2 }));
    const wrapper = mountBoard();
    await flushPromises();

    await wrapper.find('button[aria-label="Board settings for Other"]').trigger("click");
    await flushPromises();
    expect(store.selectedId).toBe("test-id");
    expect(store.fetchStatuses).toHaveBeenCalledWith("other-id");
    const dialog = wrapper.find('[aria-labelledby="board-settings-title"]');
    expect(dialog.find<HTMLInputElement>("#board-settings-name").element.value).toBe("Other");
    expect(dialog.findAll(".settings-statuses li input").map((input) => (input.element as HTMLInputElement).value)).toEqual(["Ideas", "Shipped"]);

    await dialog.find("#board-settings-name").setValue("Renamed other");
    await dialog.find("#board-settings-name").trigger("blur");
    await dialog.find('input[aria-label="New status name"]').setValue("Later");
    await dialog.find(".settings-add-status").trigger("submit");
    await flushPromises();
    expect(store.updateBoard).toHaveBeenCalledWith("other-id", "Renamed other");
    expect(store.createStatus).toHaveBeenCalledWith("Later", "other-id");
    expect(dialog.findAll(".settings-statuses li")).toHaveLength(3);
    // The open board's own columns are untouched.
    expect(wrapper.findAll(".kanban-column h2").map((heading) => heading.text())).toEqual(["Backlog"]);
    await wrapper.unmount();
  });
  it("offers no separate rename buttons anywhere on the board", async () => {
    seedBoard(["Backlog", "Done"]);
    const wrapper = mountBoard();
    await flushPromises();

    const renameControls = wrapper
      .findAll("button")
      .filter((button) => /rename/i.test(button.text()) || /rename/i.test(button.attributes("aria-label") || ""));
    expect(renameControls).toHaveLength(0);
    await wrapper.unmount();
  });

  it("displays keyboard accessible controls", async () => {
    const wrapper = mountBoard();

    // Check for aria labels and roles
    expect(wrapper.find(".board-page[aria-labelledby='board-heading']").exists()).toBe(true);
    const dialog = wrapper.find("[role='alertdialog']");
    // Dialog may not be visible initially, but the structure should support it
    expect(wrapper.find(".kanban[aria-label='Kanban board']").exists()).toBe(false); // Not visible until board selected
    await wrapper.unmount();
  });

  it("initializes with proper default values", async () => {
    mockRoute.query = {};
    const wrapper = mountBoard();

    const vm = wrapper.vm as any;
    expect(vm.newBoard).toBe("");
    expect(vm.newStatus).toBe("");
    expect(vm.error).toBe("");
    await wrapper.unmount();
  });

  it("keeps the archived-items link in a footer at the end of the page", async () => {
    seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    const footer = wrapper.find("footer.board-footer");
    expect(footer.exists()).toBe(true);
    // The footer is the last element of the page, after the kanban board.
    const children = [...wrapper.find(".board-page").element.children];
    expect(children[children.length - 1]).toBe(footer.element);

    const archiveLink = footer.find("a");
    expect(archiveLink.text()).toBe("Archived items");
    expect(archiveLink.attributes("href")).toBe("/board/archive");
    // Archiving the board itself lives in the board settings dialog.
    expect(footer.find("button").exists()).toBe(false);
    await wrapper.unmount();
  });
  it("does not render archived listings inline on the board page", async () => {
    seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    expect(wrapper.find(".archived-list").exists()).toBe(false);
    const toggles = wrapper
      .findAll("button")
      .filter((button) => /show archived|archived boards|archived statuses/i.test(button.text()));
    expect(toggles).toHaveLength(0);
    await wrapper.unmount();
  });

  it("adds a blank card to the clicked column from its header and opens it", async () => {
    const store = seedBoard(["Backlog", "Doing"]);
    const created = { id: "card-new", statusId: "status-2", title: "", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "" };
    (store.createCard as any) = vi.fn(async () => { store.cards.push(created); return created; });
    const wrapper = mountBoard();
    await flushPromises();

    expect(wrapper.find('input[name="cardTitle"]').exists()).toBe(false);
    const doing = wrapper.findAll(".kanban-column")[1];
    await doing.find("header .column-tools").find('button[aria-label="Add card to Doing"]').trigger("click");
    await flushPromises();

    expect(store.createCard).toHaveBeenCalledWith({ title: "", body: "{}", priority: "MEDIUM", statusId: "status-2" });
    expect(wrapper.find(".card-editor").exists()).toBe(true);
    await wrapper.unmount();
  });

  it("uses icon buttons with accessible names for the create actions", async () => {
    seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    for (const label of ["Add board", "Add card to Backlog"]) {
      const button = wrapper.find(`button[aria-label="${label}"]`);
      expect(button.exists(), `${label} button is missing`).toBe(true);
      expect(button.text()).toBe("＋");
    }
    await wrapper.unmount();
  });
  it("keeps Kanban column headers free of status management controls", async () => {
    seedBoard(["Backlog", "Doing"]);
    const wrapper = mountBoard();
    await flushPromises();

    const header = wrapper.findAll(".kanban-column")[0].find("header");
    expect(header.find("h2").text()).toBe("Backlog");
    expect(header.findAll("button").map((button) => button.attributes("aria-label"))).toEqual(["Add card to Backlog"]);
    expect(wrapper.find('input[aria-label="New status name"]').exists()).toBe(false);
    await wrapper.unmount();
  });
  describe("card editor", () => {
    const baseCard = { id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM" as const, position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" };
    async function openCard() {
      const store = seedBoard(["Backlog", "Doing"]);
      store.cards = [{ ...baseCard }];
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find(".board-card").trigger("click");
      return { store, wrapper };
    }
    afterEach(() => vi.useRealTimers());

    it("has no save or cancel buttons and debounces edits into one save", async () => {
      vi.useFakeTimers();
      const { store, wrapper } = await openCard();
      (store.updateCard as any) = vi.fn(async (card: any, input: any) => ({ ...card, ...input, updatedAt: "t2" }));
      expect(wrapper.find(".card-editor").findAll("button").map((button) => button.text())).not.toContain("Save card");
      const title = wrapper.find('textarea[name="title"]');
      await title.setValue("Dra");
      await title.setValue("Drafted");
      expect(store.updateCard).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(700);
      expect(store.updateCard).toHaveBeenCalledTimes(1);
      expect((store.updateCard as any).mock.calls[0][1]).toMatchObject({ title: "Drafted" });
      expect(wrapper.find(".save-state").text()).toBe("Saved");

      // The next save carries the updatedAt returned by the previous one.
      await title.setValue("Drafted again");
      await vi.advanceTimersByTimeAsync(700);
      expect((store.updateCard as any).mock.calls[1][0].updatedAt).toBe("t2");
      await wrapper.unmount();
    });

    it("flushes pending edits when closed and moves the card from the status select", async () => {
      const { store, wrapper } = await openCard();
      (store.updateCard as any) = vi.fn(async (card: any, input: any) => ({ ...card, ...input }));
      await wrapper.find('textarea[name="title"]').setValue("Closed quickly");
      await wrapper.find('select[name="status"]').setValue("status-2");
      await flushPromises();
      expect(store.moveCard).toHaveBeenCalledWith(expect.objectContaining({ id: "card-1" }), "status-2", 0);
      await wrapper.find('button[aria-label="Close card"]').trigger("click");
      await flushPromises();
      expect(store.updateCard).toHaveBeenCalledTimes(1);
      expect(wrapper.find(".card-editor").exists()).toBe(false);
      await wrapper.unmount();
    });
  });

  describe("board settings dialog", () => {
    async function openSettings() {
      const store = seedBoard(["Backlog", "Doing", "Done"]);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find('button[aria-label="Board settings for Test Board"]').trigger("click");
      await flushPromises();
      return { store, wrapper, dialog: () => wrapper.find('[role="dialog"][aria-labelledby="board-settings-title"]') };
    }

    it("opens from the gear beside the board tab and closes with Done", async () => {
      const { wrapper, dialog } = await openSettings();
      expect(dialog().exists()).toBe(true);
      expect(dialog().find<HTMLInputElement>("#board-settings-name").element.value).toBe("Test Board");
      expect(dialog().findAll(".settings-statuses li")).toHaveLength(3);
      await dialog().findAll("footer button").at(-1)!.trigger("click");
      expect(dialog().exists()).toBe(false);
      await wrapper.unmount();
    });

    it("renames the board on blur and ignores an unchanged or blank name", async () => {
      const { store, wrapper, dialog } = await openSettings();
      const name = dialog().find("#board-settings-name");
      await name.trigger("blur");
      await name.setValue("   ");
      await name.trigger("blur");
      expect(store.updateBoard).not.toHaveBeenCalled();
      await name.setValue("Roadmap");
      await name.trigger("blur");
      await flushPromises();
      expect(store.updateBoard).toHaveBeenCalledWith("test-id", "Roadmap");
      await wrapper.unmount();
    });

    it("renames, reorders, and adds statuses", async () => {
      const { store, wrapper, dialog } = await openSettings();
      const doing = dialog().find('input[aria-label="Status name Doing"]');
      await doing.setValue("In review");
      await doing.trigger("blur");
      await flushPromises();
      expect(store.updateStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "status-2" }), "In review", "test-id");

      // The drag handle doubles as the keyboard reorder control.
      await dialog().find('button[aria-label="Reorder Backlog"]').trigger("keydown", { key: "ArrowUp" });
      expect(store.reorderStatuses).not.toHaveBeenCalled();
      await dialog().find('button[aria-label="Reorder Doing"]').trigger("keydown", { key: "ArrowUp" });
      await flushPromises();
      expect(store.reorderStatuses).toHaveBeenCalledWith(["status-2", "status-1", "status-3"], "test-id", expect.any(Array));

      await dialog().find('input[aria-label="New status name"]').setValue("Blocked");
      await dialog().find(".settings-add-status").trigger("submit");
      await flushPromises();
      expect(store.createStatus).toHaveBeenCalledWith("Blocked", "test-id");
      await wrapper.unmount();
    });

    it("puts the new-status input above the status list and offers drag handles, not arrows", async () => {
      const { wrapper, dialog } = await openSettings();
      const form = dialog().find(".settings-add-status").element;
      const list = dialog().find(".settings-statuses").element;
      expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(dialog().findAll(".drag-handle")).toHaveLength(3);
      expect(dialog().find('button[aria-label^="Move "]').exists()).toBe(false);
      await wrapper.unmount();
    });

    it("confirms before archiving a status or the board", async () => {
      const { wrapper, dialog } = await openSettings();
      await dialog().find('button[aria-label="Archive Doing status"]').trigger("click");
      expect(wrapper.find('[role="alertdialog"][aria-labelledby="archive-status-title"]').exists()).toBe(true);
      await wrapper.find('[aria-labelledby="archive-status-title"]').findAll("button")[0].trigger("click");

      const archiveBoard = dialog().findAll("footer button").find((button) => button.text() === "Archive board");
      await archiveBoard!.trigger("click");
      expect(wrapper.find('[role="alertdialog"][aria-labelledby="archive-board-title"]').exists()).toBe(true);
      await wrapper.unmount();
    });
  });
  it("keeps the column heading as the accessible name for its section", async () => {
    seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    const column = wrapper.find(".kanban-column");
    expect(column.attributes("aria-labelledby")).toBe("status-status-1");
    expect(wrapper.find("h2#status-status-1").text()).toBe("Backlog");
    await wrapper.unmount();
  });

  it("clears error messages programmatically", async () => {
    const wrapper = mountBoard();

    const vm = wrapper.vm as any;
    const store = useBoardsStore();

    vm.error = "Test error";
    store.error = "Store error";
    await wrapper.vm.$nextTick();

    vm.dismissError();
    expect(vm.error).toBe("");
    expect(store.error).toBe("");
    await wrapper.unmount();
  });
});
