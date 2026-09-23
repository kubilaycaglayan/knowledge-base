import { flushPromises, mount } from "@vue/test-utils";
import BoardView from "./BoardView.vue";
import { useBoardsStore } from "../stores/boards";
import { usePathsStore } from "../stores/paths";
import { useLabelsStore } from "../stores/labels";
import { useRouter, useRoute } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { vi } from "vitest";

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

    await wrapper.find('input[name="cardTitle"]').setValue("Next card");
    await wrapper.find("form.create-card").trigger("submit");
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

  it("turns the selected board tab into an input when its name is clicked", async () => {
    const store = seedBoard();
    const wrapper = mountBoard();
    await flushPromises();

    expect(wrapper.find(".board-tab-edit").exists()).toBe(false);
    await wrapper.find(".board-tab.selected").trigger("click");

    const field = wrapper.find<HTMLInputElement>("input.board-tab-edit");
    expect(field.exists()).toBe(true);
    expect(field.element.value).toBe("Test Board");
    expect(field.attributes("aria-label")).toBe("Board name");
    // The tab is replaced by the field, so no duplicate name is shown.
    expect(wrapper.find(".board-tab.selected").exists()).toBe(false);

    await field.setValue("Renamed board");
    await field.trigger("keydown.enter");
    await flushPromises();

    expect(store.updateBoard).toHaveBeenCalledWith("test-id", "Renamed board");
    expect(wrapper.find(".board-tab-edit").exists()).toBe(false);
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

  it("escape abandons an inline board rename without saving", async () => {
    const store = seedBoard();
    const wrapper = mountBoard();
    await flushPromises();

    await wrapper.find(".board-tab.selected").trigger("click");
    const field = wrapper.find("input.board-tab-edit");
    await field.setValue("Discarded name");
    await field.trigger("keydown.esc");
    await flushPromises();

    expect(store.updateBoard).not.toHaveBeenCalled();
    expect(wrapper.find(".board-tab.selected").text()).toBe("Test Board");
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
    expect(vm.newCardTitle).toBe("");
    expect(vm.newStatus).toBe("");
    expect(vm.error).toBe("");
    await wrapper.unmount();
  });

  it("puts the archive controls in a footer at the end of the page", async () => {
    seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    const footer = wrapper.find("footer.board-footer");
    expect(footer.exists()).toBe(true);
    // The footer is the last element of the page, after the kanban board.
    const children = [...wrapper.find(".board-page").element.children];
    expect(children[children.length - 1]).toBe(footer.element);

    const archiveLink = footer.find('a[aria-label="Archived items"]');
    expect(archiveLink.exists()).toBe(true);
    expect(archiveLink.attributes("href")).toBe("/board/archive");
    expect(footer.find('button[aria-label="Archive board"]').exists()).toBe(true);
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

  it("creates a card with a start and due date picked from the kanban toolbar", async () => {
    const store = seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    // The date fields stay out of the way until the calendar toggle is used.
    expect(wrapper.find(".card-date-range").exists()).toBe(false);
    const toggle = wrapper.find('button[aria-label="Card date range"]');
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await toggle.trigger("click");

    const range = wrapper.find(".card-date-range");
    expect(range.exists()).toBe(true);
    await range.find('input[aria-label="Card start date"]').setValue("2026-03-01");
    await range.find('input[aria-label="Card due date"]').setValue("2026-03-09");
    await wrapper.find('input[name="cardTitle"]').setValue("Dated card");
    await wrapper.find("form.create-card").trigger("submit");
    await flushPromises();

    expect(store.createCard).toHaveBeenCalledWith({
      title: "Dated card",
      body: "{}",
      priority: "MEDIUM",
      startDate: "2026-03-01",
      dueDate: "2026-03-09",
    });
    // The range collapses again so the next card starts undated.
    expect(wrapper.find(".card-date-range").exists()).toBe(false);
    await wrapper.unmount();
  });

  it("omits empty dates rather than sending blank strings", async () => {
    const store = seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    await wrapper.find('input[name="cardTitle"]').setValue("Undated card");
    await wrapper.find("form.create-card").trigger("submit");
    await flushPromises();

    expect(store.createCard).toHaveBeenCalledWith({
      title: "Undated card",
      body: "{}",
      priority: "MEDIUM",
      startDate: undefined,
      dueDate: undefined,
    });
    await wrapper.unmount();
  });

  it("uses icon buttons with accessible names for the create actions", async () => {
    seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    for (const [label, icon] of [["Add board", "＋"], ["Add card", "＋"], ["Add status", "＋"]] as const) {
      const button = wrapper.find(`button[aria-label="${label}"]`);
      expect(button.exists(), `${label} button is missing`).toBe(true);
      expect(button.text()).toBe(icon);
    }
    await wrapper.unmount();
  });

  it("shows confirmation dialog for destructive actions", async () => {
    mockRoute.query = { board: "test-id" };
    const store = useBoardsStore();
    store.selectedId = "test-id";
    store.boards = [{ id: "test-id", name: "Test", archived: false, createdAt: "", updatedAt: "" }];

    const wrapper = mountBoard();

    const vm = wrapper.vm as any;
    expect(vm.archiveConfirmOpen).toBe(false);

    // Request archive
    vm.requestArchiveCurrent();
    await wrapper.vm.$nextTick();
    expect(vm.archiveConfirmOpen).toBe(true);

    // Dialog should be visible
    const dialog = wrapper.find("[role='alertdialog']");
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain("Archive board");
    await wrapper.unmount();
  });

  it("supports column name editing (editable status names)", async () => {
    mockRoute.query = { board: "test-id" };
    const store = useBoardsStore();
    store.selectedId = "test-id";
    store.boards = [{ id: "test-id", name: "Test", archived: false, createdAt: "", updatedAt: "" }];
    store.statuses = [
      {
        id: "status-1",
        name: "Backlog",
        archived: false,
        position: 0,
      },
    ];
    store.cards = [];

    const wrapper = mountBoard();

    await flushPromises();
    const nameButton = wrapper.find(".status-name");
    expect(nameButton.exists()).toBe(true);
    expect(nameButton.text()).toBe("Backlog");

    await nameButton.trigger("click");
    const field = wrapper.find<HTMLInputElement>(".status-edit input");
    expect(field.exists()).toBe(true);
    expect(field.element.value).toBe("Backlog");
    expect(field.attributes("aria-label")).toBe("Rename Backlog");

    await field.setValue("Ready");
    await field.trigger("keydown.enter");
    await flushPromises();

    expect(store.updateStatus).toHaveBeenCalledWith(store.statuses[0], "Ready");
    await wrapper.unmount();
  });

  it("escape abandons an inline status rename without saving", async () => {
    const store = seedBoard(["Backlog"]);
    const wrapper = mountBoard();
    await flushPromises();

    await wrapper.find(".status-name").trigger("click");
    const field = wrapper.find(".status-edit input");
    await field.setValue("Discarded");
    await field.trigger("keydown.esc");
    await flushPromises();

    expect(store.updateStatus).not.toHaveBeenCalled();
    expect(wrapper.find(".status-name").text()).toBe("Backlog");
    await wrapper.unmount();
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
