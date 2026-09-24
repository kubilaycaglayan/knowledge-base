import { flushPromises, mount } from "@vue/test-utils";
import BoardView from "./BoardView.vue";
import vuetify from "../plugins/vuetify";
import { useBoardsStore } from "../stores/boards";
import { useTimerStore } from "../stores/timer";
import { useNoticesStore } from "../stores/notices";
import { usePreferencesStore } from "../stores/preferences";
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
    template: '<a :href="typeof to === \'string\' ? to : to.path" :data-query="typeof to === \'string\' ? \'{}\' : JSON.stringify(to.query || {})"><slot /></a>',
  };

  function mountBoard(options: { attachTo?: Element } = {}) {
    return mount(BoardView, {
      ...options,
      global: {
        plugins: [vuetify],
        mocks: { $route: mockRoute, $router: mockRouter },
        stubs: { RouterLink: routerLinkStub },
      },
    });
  }

  // Board settings open from the single "Manage boards" gear, via the board's name in the Boards dialog.
  async function openSettingsFor(wrapper: ReturnType<typeof mountBoard>, name: string) {
    await wrapper.find('button[aria-label="Manage boards"]').trigger("click");
    const manager = wrapper.find('[role="dialog"][aria-labelledby="boards-manager-title"]');
    await manager.findAll(".boards-manager-name").find((button) => button.text() === name)!.trigger("click");
    await flushPromises();
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

  // Add board lives only in the Boards dialog behind the Manage boards gear.
  async function openAddBoard(wrapper: ReturnType<typeof mountBoard>) {
    await wrapper.find('button[aria-label="Manage boards"]').trigger("click");
    await wrapper.find('[aria-labelledby="boards-manager-title"] button[aria-label="Add board"]').trigger("click");
  }

  it("opens a new-board dialog from the Boards dialog and returns there on cancel", async () => {
    const wrapper = mountBoard();

    expect(wrapper.find('input[name="boardName"]').exists()).toBe(false);
    await openAddBoard(wrapper);
    expect(wrapper.find('[aria-labelledby="boards-manager-title"]').exists()).toBe(false);
    const dialog = wrapper.find('[role="dialog"][aria-labelledby="new-board-title"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.find('input[name="boardName"]').exists()).toBe(true);
    expect(dialog.findAll("button").map((button) => button.text())).toEqual(["Cancel", "Create"]);
    await dialog.findAll("button")[0].trigger("click");
    expect(wrapper.find('[aria-labelledby="new-board-title"]').exists()).toBe(false);
    expect(wrapper.find('[aria-labelledby="boards-manager-title"]').exists()).toBe(true);
    await wrapper.unmount();
  });

  it("validates an empty board name inside the dialog without creating a board", async () => {
    const wrapper = mountBoard();
    const store = useBoardsStore();
    const create = vi.spyOn(store, "createBoard");

    await openAddBoard(wrapper);
    await wrapper.find(".new-board-dialog").trigger("submit");
    expect(wrapper.find("#new-board-error").text()).toBe("Enter a board name.");
    expect(create).not.toHaveBeenCalled();
    await wrapper.unmount();
  });

  it("creates the board from the dialog and closes it", async () => {
    const wrapper = mountBoard();
    const store = useBoardsStore();
    const create = vi.spyOn(store, "createBoard").mockResolvedValue(undefined as never);

    await openAddBoard(wrapper);
    await wrapper.find("#new-board-name").setValue("  Launch  ");
    await wrapper.find(".new-board-dialog").trigger("submit");
    await flushPromises();
    expect(create).toHaveBeenCalledWith("Launch");
    expect(wrapper.find(".new-board-dialog").exists()).toBe(false);
    expect(wrapper.find('[aria-labelledby="boards-manager-title"]').exists()).toBe(false);
    await wrapper.unmount();
  });

  it("keeps only the Manage boards gear beside the view switch without a visible page title", async () => {
    const wrapper = mountBoard();

    expect(wrapper.find(".board-header").exists()).toBe(false);
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    expect(wrapper.find("h1#board-heading").classes()).toContain("sr-only");
    const actions = wrapper.find(".board-toolbar .board-view-actions");
    expect(actions.find('button[aria-label="Add board"]').exists()).toBe(false);
    expect(actions.find('button[aria-label="Manage boards"]').exists()).toBe(true);
    expect(actions.element.lastElementChild?.classList.contains("view-switch")).toBe(true);
    await wrapper.unmount();
  });

  it("shows an Add board icon button in the Boards dialog header", async () => {
    const wrapper = mountBoard();

    await wrapper.find('button[aria-label="Manage boards"]').trigger("click");
    const addButton = wrapper.find('[aria-labelledby="boards-manager-title"] .board-settings-header button[aria-label="Add board"]');
    expect(addButton.exists()).toBe(true);
    expect(addButton.attributes("title")).toBe("Add board");
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

  it("opens the board named in the URL after a reload, not the first tab", async () => {
    const store = useBoardsStore();
    mockRoute.query = { board: "board-2" };
    (store.loadBoards as any) = vi.fn(async () => {
      store.boards = [
        { id: "board-1", name: "First", archived: false, createdAt: "", updatedAt: "" },
        { id: "board-2", name: "Second", archived: false, createdAt: "", updatedAt: "" },
      ];
      if (!store.selectedId || !store.boards.some((board) => board.id === store.selectedId)) store.selectedId = store.boards[0].id;
    });
    const loaded: string[] = [];
    (store.loadBoard as any) = vi.fn(async () => { loaded.push(store.selectedId); });
    const wrapper = mountBoard();
    await flushPromises();

    expect(store.selectedId).toBe("board-2");
    expect(loaded).toEqual(["board-2"]);
    expect(mockRouter.replace).not.toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ board: "board-1" }) }));
    await wrapper.unmount();
  });

  it("opens another board's settings from the boards dialog without switching to it", async () => {
    const store = seedBoard(["Backlog"]);
    store.boards.push({ id: "other-id", name: "Other", archived: false, createdAt: "", updatedAt: "" });
    const otherStatuses = [{ id: "o-1", name: "Ideas", archived: false, position: 0 }, { id: "o-2", name: "Shipped", archived: false, position: 1 }];
    (store as any).fetchStatuses = vi.fn(() => Promise.resolve(otherStatuses.map((status) => ({ ...status }))));
    (store.createStatus as any) = vi.fn(() => Promise.resolve({ id: "o-3", name: "Later", archived: false, position: 2 }));
    const wrapper = mountBoard();
    await flushPromises();

    await openSettingsFor(wrapper, "Other");
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

    for (const label of ["Add card to Backlog"]) {
      const button = wrapper.find(`button[aria-label="${label}"]`);
      expect(button.exists(), `${label} button is missing`).toBe(true);
      expect(button.text()).toBe("＋");
    }
    await wrapper.unmount();
  });
  it("shows card dates compactly, without the current year or a repeated single day", async () => {
    const year = new Date().getFullYear();
    const store = seedBoard(["Backlog"]);
    const card = (id: string, startDate: string, dueDate: string, position: number) => ({ id, statusId: "status-1", title: id, body: "{}", priority: "MEDIUM", startDate, dueDate, position, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" });
    store.cards = [card("range", `${year}-09-09`, `${year}-09-10`, 0), card("day", `${year}-09-09`, `${year}-09-09`, 1), card("later", `${year + 1}-01-02`, `${year + 1}-01-02`, 2)] as any;
    const wrapper = mountBoard();
    await flushPromises();
    expect(wrapper.findAll(".board-card .card-dates").map((dates) => dates.text())).toEqual(["9 Sep – 10 Sep", "9 Sep", `2 Jan ${year + 1}`]);
    await wrapper.unmount();
  });

  it("saves a single confirmed day as both start and due date", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    const vm = wrapper.vm as any;
    vm.setDraftDates([new Date(2026, 8, 9)]);
    expect([vm.draft.startDate, vm.draft.dueDate]).toEqual(["2026-09-09", "2026-09-09"]);
    vm.setDraftDates([new Date(2026, 8, 9), null]);
    expect([vm.draft.startDate, vm.draft.dueDate]).toEqual(["2026-09-09", "2026-09-09"]);
    vm.setDraftDates([new Date(2026, 8, 9), new Date(2026, 8, 10)]);
    expect([vm.draft.startDate, vm.draft.dueDate]).toEqual(["2026-09-09", "2026-09-10"]);
    vm.setDraftDates(null);
    expect([vm.draft.startDate, vm.draft.dueDate]).toEqual(["", ""]);
    await wrapper.unmount();
  });

  it("puts dates, priority, status, labels, and an icon-only archive button in the editor footer", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    // Only the All boards view has a meta row (for the board picker); the rest sit in the footer.
    expect(wrapper.find(".card-meta").exists()).toBe(false);
    const meta = wrapper.find(".card-editor-header");
    expect(meta.find('select[name="priority"]').exists()).toBe(false);
    expect(meta.find('select[name="status"]').exists()).toBe(false);
    expect(meta.find(".meta-dates").exists()).toBe(false);

    const footer = wrapper.find(".card-editor-footer");
    const controls = [...footer.element.children].map((element) => element.classList.contains("meta-dates") ? "dates" : element.classList.contains("card-labels-picker-wrap") ? "labels" : element.classList.contains("save-state") ? "save" : element.getAttribute("name") || element.getAttribute("aria-label"));
    expect(controls).toEqual(["dates", "priority", "status", "labels", "Archive card"]);
    const archive = footer.find('button[aria-label="Archive card"]');
    expect(archive.text()).toBe("");
    expect(archive.attributes("title")).toBe("Archive card");
    expect(footer.element.lastElementChild).toBe(archive.element);
    await wrapper.unmount();
  });

  describe("card labels", () => {
    const boardLabels = [
      { id: "label-design", name: "Design", color: "#7c3aed", scopes: ["BOARD"] },
      { id: "label-docs", name: "Docs", color: "#0e7490", scopes: ["BOARD"] },
      { id: "label-note", name: "Reading", color: "#999999", scopes: ["NOTE"] },
    ];
    function seedLabelled(labelIds: string[]) {
      const store = seedBoard(["Backlog"]);
      useLabelsStore().labels = boardLabels as any;
      store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds, createdAt: "", updatedAt: "t1" }] as any;
      return store;
    }

    it("picks card labels from a searchable chip selector in the editor footer", async () => {
      seedLabelled([]);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find(".board-card").trigger("click");
      expect(wrapper.find(".card-meta .card-labels").exists()).toBe(false);
      const picker = wrapper.findComponent({ name: "VAutocomplete" });
      expect(picker.exists()).toBe(true);
      expect(picker.classes()).toContain("card-labels-picker");
      expect(picker.props("multiple")).toBe(true);
      expect((picker.props("items") as Array<{ name: string }>).map((label) => label.name)).toEqual(["Design", "Docs"]);
      picker.vm.$emit("update:modelValue", ["label-docs"]);
      await flushPromises();
      expect((wrapper.vm as any).draft.labelIds).toEqual(["label-docs"]);
      await wrapper.unmount();
    });

    it("shows each selected label's name on its chip and removes it from the chip", async () => {
      seedLabelled(["label-docs", "label-design"]);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find(".board-card").trigger("click");
      await flushPromises();
      const chips = wrapper.findAll(".card-editor .card-labels-chip");
      expect(chips.map((chip) => chip.text())).toEqual(["Docs", "Design"]);
      await chips[0].find(".v-chip__close").trigger("click");
      expect((wrapper.vm as any).draft.labelIds).toEqual(["label-design"]);
      await wrapper.unmount();
    });

    it("shows one row of label chips between the priority and the title", async () => {
      seedLabelled(["label-docs", "label-design", "label-missing"]);
      const wrapper = mountBoard();
      await flushPromises();
      const card = wrapper.find(".board-card");
      const parts = [...card.element.children].map((element) => element.className || element.tagName.toLowerCase());
      expect(parts.indexOf("board-card-labels")).toBe(parts.indexOf("board-card-top") + 1);
      expect(parts.indexOf("h3")).toBe(parts.indexOf("board-card-labels") + 1);
      expect(card.findAll(".board-card-labels .board-card-label").map((chip) => chip.text())).toEqual(["Docs", "Design"]);
      await wrapper.unmount();
    });

    it("leaves unlabelled cards without a label row", async () => {
      seedLabelled([]);
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.find(".board-card-labels").exists()).toBe(false);
      await wrapper.unmount();
    });
  });

  it("puts the title, the path picker, and the close button on the editor's first row", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    const editor = wrapper.find(".card-editor");
    const header = editor.find(".card-editor-header");
    expect(editor.element.firstElementChild).toBe(header.element);
    const parts = [...header.element.children].map((element) => element.classList.contains("card-path-picker") ? "path" : element.getAttribute("name") || element.getAttribute("aria-label"));
    expect(parts).toEqual(["title", "path", "Close card"]);
    expect(editor.find('.card-meta button[aria-label="Close card"]').exists()).toBe(false);
    expect(editor.find('select[name="cardPaths"]').exists()).toBe(false);
    await wrapper.unmount();
  });

  it("sets and clears the card path from the header picker", async () => {
    const store = seedBoard(["Backlog"]);
    usePathsStore().setAll([{ id: "path-1", name: "Writing", color: "#123456", status: "ACTIVE" }, { id: "path-old", name: "Old", color: "#999999", status: "ARCHIVED" }] as any);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    const picker = wrapper.findComponent({ name: "VSelect" });
    expect(picker.exists()).toBe(true);
    expect(picker.classes()).toContain("card-path-picker");
    expect(picker.props("multiple")).toBe(false);
    expect((picker.props("items") as Array<{ name: string }>).map((path) => path.name)).toEqual(["No path", "Writing"]);
    expect(picker.props("modelValue")).toBe("");
    picker.vm.$emit("update:modelValue", "path-1");
    await flushPromises();
    expect((wrapper.vm as any).draft.pathIds).toEqual(["path-1"]);
    picker.vm.$emit("update:modelValue", "");
    await flushPromises();
    expect((wrapper.vm as any).draft.pathIds).toEqual([]);
    picker.vm.$emit("update:modelValue", null);
    await flushPromises();
    expect((wrapper.vm as any).draft.pathIds).toEqual([]);
    await wrapper.unmount();
  });

  // RT-01
  it("puts the formatting toolbar under the card body", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    const body = wrapper.find(".card-editor .card-body-editor");
    const toolbar = body.find('[role="toolbar"][aria-label="Formatting"]');
    expect(toolbar.exists()).toBe(true);
    expect(body.element.lastElementChild).toBe(toolbar.element.closest(".rich-text-toolbar"));
    await wrapper.unmount();
  });

  describe("card play button", () => {
    const card = (id: string, title: string, pathIds: string[], position: number) => ({ id, statusId: "status-1", title, body: "{}", priority: "MEDIUM", position, archived: false, pathIds, labelIds: [], createdAt: "", updatedAt: "t1" });
    // Card play buttons only show in the In Progress column (CT-06).
    function seedCustom() {
      const store = seedBoard(["In Progress"]);
      store.cards = [card("with-path", "Write docs", ["path-1"], 0), card("no-path", "Loose", [], 1)] as any;
      return store;
    }
    const playFor = (wrapper: ReturnType<typeof mountBoard>, title: string) => wrapper.find(`.board-card button[aria-label="Start a session for ${title}"]`);

    // CT-02, CT-05
    it("shows a card play button only for path cards while no timer runs", async () => {
      seedCustom();
      const timer = useTimerStore();
      const wrapper = mountBoard();
      await flushPromises();
      expect(playFor(wrapper, "Write docs").exists()).toBe(true);
      expect(playFor(wrapper, "Loose").exists()).toBe(false);
      expect(wrapper.find(".board-card").element.querySelector(".board-card-play")).not.toBeNull();

      timer.setCurrent({ id: "timer-1", startedAt: new Date().toISOString(), running: true });
      await flushPromises();
      expect(wrapper.findAll(".board-card-play:not(.play-hidden)")).toHaveLength(0);
      timer.setCurrent(null);
      await flushPromises();
      expect(playFor(wrapper, "Write docs").exists()).toBe(true);
      await wrapper.unmount();
    });

    it("shows a play button on every In Progress card of a path board", async () => {
      const boards = useBoardsStore();
      usePathsStore().setAll([{ id: "path-1", name: "Writing", color: "#123456", status: "ACTIVE" }] as any);
      boards.selectedId = "path-board";
      boards.boards = [{ id: "path-board", name: "Writing", archived: false, createdAt: "", updatedAt: "", pathId: "path-1" }] as any;
      boards.statuses = [{ id: "status-1", name: "in-progress", archived: false, position: 0 }];
      boards.cards = [card("a", "", [], 0)] as any;
      mockRoute.query = { board: "path-board" };
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.find('.board-card button[aria-label="Start a session for untitled card"]').exists()).toBe(true);
      await wrapper.unmount();
    });

    // CT-06
    it("shows card play buttons only in the In Progress column", async () => {
      const store = seedBoard(["Pending", "In Progress", "Done"]);
      usePathsStore().setAll([{ id: "path-1", name: "Writing", color: "#123456", status: "ACTIVE" }] as any);
      store.cards = [{ ...card("pending", "Waiting card", ["path-1"], 0), statusId: "status-1" }, { ...card("doing", "Doing card", ["path-1"], 0), statusId: "status-2" }, { ...card("done", "Done card", ["path-1"], 0), statusId: "status-3" }] as any;
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.findAll(".board-card-play").map((button) => button.attributes("aria-label"))).toEqual(["Start a session for Doing card"]);
      store.cards = store.cards.map((item) => item.id === "pending" ? { ...item, statusId: "status-2", position: 1 } : item.id === "doing" ? { ...item, statusId: "status-3", position: 1 } : item);
      await flushPromises();
      expect(wrapper.findAll(".board-card-play").map((button) => button.attributes("aria-label"))).toEqual(["Start a session for Waiting card"]);
      // The editor keeps its own play button whatever the column.
      await wrapper.findAll(".board-card").find((item) => item.text().includes("Done card"))!.trigger("click");
      expect(wrapper.find('.card-editor-header button[aria-label="Start a session for Done card"]').exists()).toBe(true);
      await wrapper.unmount();
    });

    // CT-07
    it("keeps an invisible play slot on In Progress cards while a timer runs", async () => {
      seedCustom();
      const timer = useTimerStore();
      const wrapper = mountBoard({ attachTo: document.body });
      await flushPromises();
      timer.setCurrent({ id: "timer-1", startedAt: new Date().toISOString(), running: true });
      await flushPromises();
      const slot = wrapper.find(".board-card .board-card-play");
      expect(slot.exists()).toBe(true);
      expect(slot.classes()).toContain("play-hidden");
      expect(getComputedStyle(slot.element).visibility).toBe("hidden");
      timer.setCurrent(null);
      await flushPromises();
      expect(wrapper.find(".board-card .board-card-play").classes()).not.toContain("play-hidden");
      await wrapper.unmount();
    });

    // CT-08
    it("moves the card to In Progress when its session starts from the editor", async () => {
      const store = seedBoard(["Backlog", "In Progress"]);
      store.cards = [card("with-path", "Write docs", ["path-1"], 0), { ...card("doing", "Doing", [], 0), statusId: "status-2" }] as any;
      const start = vi.spyOn(useTimerStore(), "startSession").mockResolvedValue(null as never);
      const move = vi.spyOn(store, "moveCard").mockResolvedValue(null as never);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.findAll(".board-card")[0].trigger("click");
      await wrapper.find('.card-editor-header button[aria-label="Start a session for Write docs"]').trigger("click");
      await flushPromises();
      expect(start).toHaveBeenCalledWith({ pathId: "path-1", description: "Write docs" });
      expect(move).toHaveBeenCalledWith(expect.objectContaining({ id: "with-path" }), "status-2", 1);
      expect(start.mock.invocationCallOrder[0]).toBeLessThan(move.mock.invocationCallOrder[0]);
      expect(wrapper.find(".card-editor").exists()).toBe(true);
      await wrapper.unmount();
    });

    it("leaves the card in place when the editor's session cannot start or there is no In Progress column", async () => {
      const store = seedBoard(["Backlog", "In Progress"]);
      store.cards = [card("with-path", "Write docs", ["path-1"], 0)] as any;
      const timer = useTimerStore();
      const start = vi.spyOn(timer, "startSession").mockRejectedValueOnce(Object.assign(new Error("A timer is already running"), { status: 409 }));
      const move = vi.spyOn(store, "moveCard").mockResolvedValue(null as never);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find(".board-card").trigger("click");
      await wrapper.find('.card-editor-header button[aria-label="Start a session for Write docs"]').trigger("click");
      await flushPromises();
      expect(start).toHaveBeenCalledTimes(1);
      expect(move).not.toHaveBeenCalled();
      await wrapper.unmount();

      const other = seedBoard(["Backlog", "Done"]);
      other.cards = [card("with-path", "Write docs", ["path-1"], 0)] as any;
      start.mockResolvedValue(null as never);
      const otherMove = vi.spyOn(other, "moveCard").mockResolvedValue(null as never);
      const noColumn = mountBoard();
      await flushPromises();
      await noColumn.find(".board-card").trigger("click");
      await noColumn.find('.card-editor-header button[aria-label="Start a session for Write docs"]').trigger("click");
      await flushPromises();
      expect(start).toHaveBeenCalledTimes(2);
      expect(otherMove).not.toHaveBeenCalled();
      await noColumn.unmount();
    });

    // CT-04
    it("starts a session from a card without opening it", async () => {
      seedCustom();
      const timer = useTimerStore();
      const start = vi.spyOn(timer, "startSession").mockResolvedValue(null as never);
      const wrapper = mountBoard();
      await flushPromises();
      await playFor(wrapper, "Write docs").trigger("click");
      await playFor(wrapper, "Write docs").trigger("keydown", { key: "Enter" });
      expect(start).toHaveBeenCalledWith({ pathId: "path-1", description: "Write docs" });
      expect(wrapper.find(".card-editor").exists()).toBe(false);
      await wrapper.unmount();
    });

    it("explains why a card could not start a session", async () => {
      seedCustom();
      const timer = useTimerStore();
      const start = vi.spyOn(timer, "startSession");
      const wrapper = mountBoard();
      await flushPromises();

      start.mockRejectedValueOnce(Object.assign(new Error("A timer is already running"), { status: 409 }));
      await playFor(wrapper, "Write docs").trigger("click");
      await flushPromises();
      const notices = useNoticesStore();
      expect(notices.current?.text).toBe("A session is already running. Stop it before starting another.");
      expect(wrapper.find(".board-error").exists()).toBe(false);

      start.mockRejectedValueOnce(new TypeError("startSession is not a function"));
      await playFor(wrapper, "Write docs").trigger("click");
      await flushPromises();
      expect(notices.current?.text).toBe("Could not start a session. Try again.");
      await wrapper.unmount();
    });

    // CT-03
    it("puts the card play button before Close in the editor", async () => {
      seedCustom();
      const timer = useTimerStore();
      const start = vi.spyOn(timer, "startSession").mockResolvedValue(null as never);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.findAll(".board-card")[0].trigger("click");
      const header = wrapper.find(".card-editor-header");
      expect(header.findAll("button").map((button) => button.attributes("aria-label"))).toEqual(["Start a session for Write docs", "Close card"]);
      await header.find('button[aria-label="Start a session for Write docs"]').trigger("click");
      expect(start).toHaveBeenCalledWith({ pathId: "path-1", description: "Write docs" });
      expect(wrapper.find(".card-editor").exists()).toBe(true);
      await wrapper.unmount();

      const loose = mountBoard();
      await flushPromises();
      await loose.findAll(".board-card")[1].trigger("click");
      expect(loose.findAll(".card-editor-header button").map((button) => button.attributes("aria-label"))).toEqual(["Close card"]);
      await loose.unmount();
    });
  });

  it("asks to archive a card without the retention explanation", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    await wrapper.find('button[aria-label="Archive card"]').trigger("click");
    const confirm = wrapper.find('[role="alertdialog"]');
    expect(confirm.find("h2").text()).toBe("Archive card?");
    expect(confirm.text()).not.toContain("retained");
    expect(confirm.text()).not.toContain("Untitled card");
    await wrapper.unmount();
  });

  it("lists priorities from most to least pressing in the card editor", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    await wrapper.find(".board-card").trigger("click");
    const options = wrapper.findAll('select[name="priority"] option');
    expect(options.map((option) => option.text())).toEqual(["Urgent", "High", "Medium", "Low"]);
    expect(options.map((option) => option.attributes("value"))).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);
    await wrapper.unmount();
  });

  it("leaves an untitled card blank instead of showing an Untitled card placeholder", async () => {
    const store = seedBoard(["Backlog"]);
    store.cards = [{ id: "card-1", statusId: "status-1", title: "", body: "{}", priority: "MEDIUM", startDate: "2026-09-09", dueDate: "2026-09-10", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
    const wrapper = mountBoard();
    await flushPromises();
    const card = wrapper.find(".board-card");
    expect(card.find("h3").exists()).toBe(false);
    expect(card.attributes("aria-label")).toBe("Untitled card");
    expect(wrapper.text()).not.toContain("Untitled card");
    await card.trigger("click");
    expect(wrapper.find('textarea[name="title"]').attributes("placeholder")).toBeUndefined();
    await wrapper.unmount();
  });

  describe("column sort", () => {
    const card = (id: string, priority: string, position: number) => ({ id, statusId: "status-1", title: id, body: "{}", priority, position, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" });
    function seedSorted(cardSort: "MANUAL" | "PRIORITY") {
      const store = seedBoard(["Backlog", "Done"]);
      store.statuses = store.statuses.map((status) => ({ ...status, cardSort }));
      store.cards = [card("low", "LOW", 0), card("urgent", "URGENT", 1), card("medium", "MEDIUM", 2), card("high", "HIGH", 3)] as any;
      return store;
    }
    const headings = (wrapper: ReturnType<typeof mountBoard>) => wrapper.findAll(".kanban-column").at(0)!.findAll(".board-card h3").map((heading) => heading.text());

    // CS-04, AB-13
    it("cycles a column's sort through three states", async () => {
      const store = seedSorted("MANUAL");
      const setStatusSort = vi.spyOn(store, "setStatusSort").mockResolvedValue(undefined as never);
      const wrapper = mountBoard();
      await flushPromises();
      const toggle = () => wrapper.find(".kanban-column .column-sort");
      expect(toggle().attributes("aria-label")).toBe("Sort Backlog: unsorted");
      await toggle().trigger("click");
      expect(setStatusSort).toHaveBeenLastCalledWith(expect.objectContaining({ id: "status-1" }), "PRIORITY");

      store.statuses[0].cardSort = "PRIORITY";
      await flushPromises();
      expect(toggle().attributes("aria-label")).toBe("Sort Backlog: priority first");
      expect(toggle().classes()).toContain("active");
      await toggle().trigger("click");
      expect(setStatusSort).toHaveBeenLastCalledWith(expect.objectContaining({ id: "status-1" }), "PRIORITY_LAST");

      store.statuses[0].cardSort = "PRIORITY_LAST";
      await flushPromises();
      expect(toggle().attributes("aria-label")).toBe("Sort Backlog: priority last");
      expect(headings(wrapper)).toEqual(["low", "medium", "high", "urgent"]);
      await toggle().trigger("click");
      expect(setStatusSort).toHaveBeenLastCalledWith(expect.objectContaining({ id: "status-1" }), "MANUAL");
      await wrapper.unmount();
    });

    // CS-05
    it("shows a priority-sorted column in priority order", async () => {
      const store = seedSorted("MANUAL");
      const wrapper = mountBoard();
      await flushPromises();
      expect(headings(wrapper)).toEqual(["low", "urgent", "medium", "high"]);
      store.statuses[0].cardSort = "PRIORITY";
      await flushPromises();
      expect(headings(wrapper)).toEqual(["urgent", "high", "medium", "low"]);
      store.cards.find((item) => item.id === "low")!.priority = "URGENT";
      await flushPromises();
      expect(headings(wrapper)).toEqual(["low", "urgent", "high", "medium"]);
      await wrapper.unmount();
    });

    // CS-06
    it("does not reorder within a priority-sorted column", async () => {
      const store = seedSorted("PRIORITY");
      const moveCard = vi.spyOn(store, "moveCard").mockResolvedValue(undefined as never);
      const wrapper = mountBoard();
      await flushPromises();
      const vm = wrapper.vm as any;
      const [low, urgent] = [store.cards[0], store.cards[1]];
      await vm.reorderCard(urgent, 1);
      vm.dropCard({ stopPropagation: () => undefined, dataTransfer: { getData: () => "low" } }, urgent);
      expect(moveCard).not.toHaveBeenCalled();

      await wrapper.findAll(".kanban-column").at(1)!.trigger("drop", { dataTransfer: { getData: () => low.id } });
      expect(moveCard).toHaveBeenCalledWith(expect.objectContaining({ id: "low" }), "status-2", 0);
      await wrapper.unmount();
    });
  });

  it("keeps Kanban column headers free of status management controls", async () => {
    seedBoard(["Backlog", "Doing"]);
    const wrapper = mountBoard();
    await flushPromises();

    const header = wrapper.findAll(".kanban-column")[0].find("header");
    expect(header.find("h2").text()).toBe("Backlog");
    expect(header.findAll("button").map((button) => button.attributes("aria-label"))).toEqual(["Sort Backlog: unsorted", "Add card to Backlog"]);
    expect(wrapper.find('input[aria-label="New status name"]').exists()).toBe(false);
    await wrapper.unmount();
  });
  // UP-05
  it("toggles the Kanban between page width and full width and remembers it", async () => {
    seedBoard(["Backlog"]);
    const preferences = usePreferencesStore();
    const save = vi.spyOn(preferences, "setKanbanWide");
    const wrapper = mountBoard();
    await flushPromises();

    const toggle = () => wrapper.find(".kanban-area .kanban-width-toggle");
    expect(wrapper.find(".kanban-area").classes()).not.toContain("wide");
    expect(toggle().attributes("aria-pressed")).toBe("false");
    await toggle().trigger("click");
    expect(save).toHaveBeenCalledWith(true);
    expect(wrapper.find(".kanban-area").classes()).toContain("wide");
    expect(toggle().attributes("aria-label")).toBe("Collapse board to page width");
    await wrapper.unmount();

    const again = mountBoard();
    await flushPromises();
    expect(again.find(".kanban-area").classes()).toContain("wide");
    await again.unmount();
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

      // The next save carries the updatedAt returned by the previous one.
      await title.setValue("Drafted again");
      await vi.advanceTimersByTimeAsync(700);
      expect((store.updateCard as any).mock.calls[1][0].updatedAt).toBe("t2");
      await wrapper.unmount();
    });

    it("shows no saving or saved text in the editor", async () => {
      vi.useFakeTimers();
      const { store, wrapper } = await openCard();
      let finish: (value: unknown) => void = () => {};
      (store.updateCard as any) = vi.fn((card: any, input: any) => new Promise((resolve) => { finish = () => resolve({ ...card, ...input, updatedAt: "t2" }); }));
      await wrapper.find('textarea[name="title"]').setValue("Drafted");
      await vi.advanceTimersByTimeAsync(700);
      expect(store.updateCard).toHaveBeenCalledTimes(1);
      expect(wrapper.find(".card-editor").text()).not.toMatch(/Saving|Saved/);
      finish(undefined);
      await flushPromises();
      expect(wrapper.find(".card-editor").text()).not.toMatch(/Saving|Saved/);
      expect(wrapper.find(".card-editor .save-state").exists()).toBe(false);
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
    it("stays open when a text selection started inside the editor is released over the backdrop", async () => {
      const { wrapper } = await openCard();
      const title = wrapper.find('textarea[name="title"]');
      await title.trigger("pointerdown");
      await title.trigger("mousedown");
      // The browser dispatches the click on the closest common ancestor: the backdrop.
      await wrapper.find(".dialog-backdrop").trigger("pointerup");
      await wrapper.find(".dialog-backdrop").trigger("mouseup");
      await wrapper.find(".dialog-backdrop").trigger("click");
      await flushPromises();
      expect(wrapper.find(".card-editor").exists()).toBe(true);
      await wrapper.unmount();
    });

    it("closes when the backdrop itself is pressed and released", async () => {
      const { wrapper } = await openCard();
      const backdrop = wrapper.find(".dialog-backdrop");
      await backdrop.trigger("pointerdown");
      await backdrop.trigger("mousedown");
      await backdrop.trigger("pointerup");
      await backdrop.trigger("mouseup");
      await backdrop.trigger("click");
      await flushPromises();
      expect(wrapper.find(".card-editor").exists()).toBe(false);
      await wrapper.unmount();
    });
  });

  describe("board settings dialog", () => {
    async function openSettings() {
      const store = seedBoard(["Backlog", "Doing", "Done"]);
      const wrapper = mountBoard();
      await flushPromises();
      await openSettingsFor(wrapper, "Test Board");
      return { store, wrapper, dialog: () => wrapper.find('[role="dialog"][aria-labelledby="board-settings-title"]') };
    }

    it("opens from the boards dialog and closes with Done", async () => {
      const { wrapper, dialog } = await openSettings();
      expect(dialog().exists()).toBe(true);
      expect(dialog().find<HTMLInputElement>("#board-settings-name").element.value).toBe("Test Board");
      expect(dialog().find('label[for="board-settings-name"]').classes()).toContain("sr-only");
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

  describe("path boards", () => {
    const board = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, archived: false, createdAt: "", updatedAt: "", pathId: null, hidden: false, pinned: false, ...extra });
    function seedPathBoards() {
      const store = useBoardsStore();
      const pathsStore = usePathsStore();
      pathsStore.setAll([{ id: "path-1", name: "Writing", color: "#123456", status: "ACTIVE" }]);
      store.boards = [board("pinned", "Pinned", { pinned: true }), board("path-board", "Writing", { pathId: "path-1" }), board("custom-a", "Alpha"), board("custom-b", "Beta")] as any;
      store.selectedId = "path-board";
      store.statuses = [{ id: "status-1", name: "Backlog", archived: false, position: 0 }];
      store.cards = [];
      (store.pinBoard as any) = vi.fn(() => Promise.resolve(null));
      (store.reorderBoards as any) = vi.fn(() => Promise.resolve());
      (store.fetchStatuses as any) = vi.fn(() => Promise.resolve([]));
      return store;
    }

    // PB-20
    it("renders path boards with a colour dot in API order", async () => {
      seedPathBoards();
      const wrapper = mountBoard();
      await flushPromises();
      // The open board (Writing) takes the reserved first slot; the rest keep API order.
      expect(wrapper.findAll(".board-tab:not(.empty)").map((tab) => tab.text())).toEqual(["Writing", "Pinned", "Alpha", "Beta"]);
      const dots = wrapper.findAll(".board-tab-dot");
      expect(dots).toHaveLength(1);
      expect(dots[0].attributes("aria-hidden")).toBe("true");
      expect(dots[0].attributes("style")).toContain("background-color: rgb(18, 52, 86)");
      await wrapper.unmount();
    });

    it("keeps the open board in the reserved first slot without repeating it", async () => {
      const store = seedPathBoards();
      store.selectedId = "custom-b";
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.find(".board-tab-current .board-tab").text()).toBe("Beta");
      expect(wrapper.find(".board-tab-current .board-tab").classes()).toContain("selected");
      expect(wrapper.findAll(".board-tab-list .board-tab").map((tab) => tab.text())).toEqual(["Pinned", "Writing", "Alpha"]);
      // Everything fits in jsdom (no layout), so there is nothing to overflow.
      expect(wrapper.find('button[aria-label^="More boards"]').exists()).toBe(false);
      await wrapper.unmount();
    });

    // PB-21
    it("hides the path picker on path boards", async () => {
      const store = seedPathBoards();
      store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: ["path-1"], labelIds: [], createdAt: "", updatedAt: "t1" }];
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.find(".board-card").classes()).not.toContain("accented");
      expect(wrapper.find(".board-card").attributes("style") ?? "").not.toContain("--card-accent");
      await wrapper.find(".board-card").trigger("click");
      expect(wrapper.find(".card-editor").exists()).toBe(true);
      expect(wrapper.find(".card-editor").classes()).not.toContain("accented");
      expect(wrapper.find(".card-path-picker").exists()).toBe(false);
      await wrapper.unmount();

      store.selectedId = "custom-a";
      const custom = mountBoard();
      await flushPromises();
      expect(custom.find(".board-card").classes()).toContain("accented");
      expect(custom.find(".board-card").attributes("style")).toContain("--card-accent: #123456");
      await custom.find(".board-card").trigger("click");
      expect(custom.find(".card-path-picker").exists()).toBe(true);
      await custom.unmount();
    });

    it("formats the card body with the same rich-text rules as notes", async () => {
      const store = seedPathBoards();
      store.cards = [{ id: "card-1", statusId: "status-1", title: "Draft", body: JSON.stringify({ type: "doc", content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }] }] }] }), priority: "MEDIUM", position: 0, archived: false, pathIds: ["path-1"], labelIds: [], createdAt: "", updatedAt: "t1" }];
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find(".board-card").trigger("click");
      await flushPromises();
      expect(wrapper.find(".card-body-editor").classes()).toContain("rich-text");
      expect(wrapper.find('.card-body-editor ul[data-type="taskList"]').exists()).toBe(true);
      await wrapper.unmount();
    });

    // PB-22
    it("path board settings are read-only and leave visibility to the Paths page", async () => {
      seedPathBoards();
      const wrapper = mountBoard();
      await flushPromises();
      await openSettingsFor(wrapper, "Writing");
      const dialog = wrapper.find('[role="dialog"][aria-labelledby="board-settings-title"]');
      expect(dialog.find("#board-settings-name").exists()).toBe(false);
      expect(dialog.find(".settings-name-readonly").text()).toContain("Writing");
      expect(dialog.find('a[href="/paths"]').text()).toBe("Rename…");
      expect(dialog.find(".settings-name-readonly").text()).toBe("Writing Rename…");
      expect(dialog.findAll(".settings-label").map((label) => label.text())).not.toContain("Name");
      expect(dialog.findAll("button").map((button) => button.text())).not.toContain("Archive board");
      expect(dialog.find('input[name="boardVisible"]').exists()).toBe(false);
      expect(dialog.find('input[name="boardPinned"]').exists()).toBe(false);
      expect(dialog.findAll(".settings-statuses li")).toHaveLength(1);
      await wrapper.unmount();
    });

    // PB-23
    it("opens the boards dialog from the single gear and each name opens its settings", async () => {
      seedPathBoards();
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.findAll(".board-tab-settings")).toHaveLength(0);
      const gear = wrapper.find('button[aria-label="Manage boards"]');
      expect(gear.exists()).toBe(true);

      await gear.trigger("click");
      const manager = wrapper.find('[role="dialog"][aria-labelledby="boards-manager-title"]');
      expect(manager.findAll(".boards-manager-name").map((button) => button.text())).toEqual(["Pinned", "Writing", "Alpha", "Beta"]);

      await manager.findAll(".boards-manager-name").find((button) => button.text() === "Alpha")!.trigger("click");
      await flushPromises();
      expect(wrapper.find('[aria-labelledby="boards-manager-title"]').exists()).toBe(false);
      const settings = wrapper.find('[role="dialog"][aria-labelledby="board-settings-title"]');
      expect(settings.find<HTMLInputElement>("#board-settings-name").element.value).toBe("Alpha");
      expect(settings.find('input[name="boardPinned"]').exists()).toBe(false);
      await wrapper.unmount();
    });

    // PB-24, PB-32
    it("reorders path and custom boards together from the boards dialog", async () => {
      const store = seedPathBoards();
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find('button[aria-label="Manage boards"]').trigger("click");
      const manager = () => wrapper.find('[role="dialog"][aria-labelledby="boards-manager-title"]');
      expect(manager().findAll(".drag-handle")).toHaveLength(4);

      // Groups do not mix: the first unpinned board cannot move up into the pinned group.
      await manager().find('button[aria-label="Reorder Writing"]').trigger("keydown", { key: "ArrowUp" });
      expect(store.reorderBoards).not.toHaveBeenCalled();

      // A custom board can move above a path board; only the unpinned group is sent.
      await manager().find('button[aria-label="Reorder Alpha"]').trigger("keydown", { key: "ArrowUp" });
      await flushPromises();
      expect(store.reorderBoards).toHaveBeenCalledWith(["custom-a", "path-board", "custom-b"]);
      await wrapper.unmount();
    });

    // PB-31
    it("pins and unpins any board from the boards dialog", async () => {
      const store = seedPathBoards();
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find('button[aria-label="Manage boards"]').trigger("click");
      const manager = wrapper.find('[role="dialog"][aria-labelledby="boards-manager-title"]');
      const unpin = manager.find('button[aria-label="Unpin Pinned"]');
      expect(unpin.attributes("aria-pressed")).toBe("true");
      await unpin.trigger("click");
      await flushPromises();
      expect(store.pinBoard).toHaveBeenCalledWith("pinned", false);

      const pin = manager.find('button[aria-label="Pin Alpha"]');
      expect(pin.attributes("aria-pressed")).toBe("false");
      await pin.trigger("click");
      await flushPromises();
      expect(store.pinBoard).toHaveBeenCalledWith("custom-a", true);

      await manager.find('button[aria-label="Pin Writing"]').trigger("click");
      await flushPromises();
      expect(store.pinBoard).toHaveBeenCalledWith("path-board", true);
      await wrapper.unmount();
    });
  });

  describe("All boards view", () => {
    const board = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, archived: false, createdAt: "", updatedAt: "", ...extra });
    const status = (id: string, boardId: string, name: string, position: number) => ({ id, boardId, name, position, archived: false, cardSort: "MANUAL" as const });
    const card = (id: string, boardId: string, statusId: string, position: number, extra: Record<string, unknown> = {}) => ({ id, boardId, statusId, title: id, body: "{}", priority: "MEDIUM", position, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1", ...extra });

    function seedAll() {
      const store = useBoardsStore();
      store.selectedId = "all";
      store.viewKey = "all";
      store.boards = [board("work", "Work"), board("home", "A very long home improvement board name", { pathId: "path-1" })];
      store.statuses = [status("w-todo", "work", "To Do", 0), status("w-done", "work", "Done", 1), status("h-todo", "home", "To do", 0), status("h-wait", "home", "Waiting", 1)];
      store.allColumns = [{ name: "To Do", key: "to do", cardSort: "MANUAL", statusIds: ["w-todo", "h-todo"] }, { name: "Done", key: "done", cardSort: "MANUAL", statusIds: ["w-done"] }, { name: "Waiting", key: "waiting", cardSort: "MANUAL", statusIds: ["h-wait"] }];
      store.cards = [card("w0", "work", "w-todo", 0), card("w1", "work", "w-todo", 1), card("w2", "work", "w-todo", 2), card("h0", "home", "h-todo", 0), card("h1", "home", "h-todo", 1)] as any;
      mockRoute.query = { board: "all" };
      const paths = usePathsStore();
      paths.paths = [{ id: "path-1", name: "Home", color: "#2e7d32", status: "ACTIVE" }] as any;
      return store;
    }
    const columnTitles = (wrapper: ReturnType<typeof mountBoard>, index: number) => wrapper.findAll(".kanban-column").at(index)!.findAll(".board-card h3").map((heading) => heading.text());
    const drop = (id: string) => ({ stopPropagation: () => undefined, dataTransfer: { getData: () => id } });

    // AB-11
    it("selects the All boards view from the icon button", async () => {
      const store = seedBoard(["Backlog"]);
      const wrapper = mountBoard();
      await flushPromises();
      const all = wrapper.find('button[aria-label="All boards"]');
      expect(all.exists()).toBe(true);
      expect(all.text()).toBe("");
      expect(all.attributes("aria-current")).toBeUndefined();
      expect(all.element.compareDocumentPosition(wrapper.find(".board-tab.selected").element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await all.trigger("click");
      expect(store.selectedId).toBe("all");
      expect(mockRouter.replace).toHaveBeenCalledWith({ query: { board: "all" } });
      expect(store.loadBoard).toHaveBeenCalled();
      await flushPromises();
      expect(wrapper.find('button[aria-label="All boards"]').attributes("aria-current")).toBe("true");
      expect(wrapper.findAll(".board-tab-list .board-tab").map((tab) => tab.text())).toEqual(["Test Board"]);
      await wrapper.unmount();
    });

    // AB-12
    it("shows merged columns with a one-line board badge", async () => {
      seedAll();
      const wrapper = mountBoard();
      await flushPromises();
      expect(wrapper.findAll(".kanban-column h2").map((heading) => heading.text())).toEqual(["To Do", "Done", "Waiting"]);
      expect(columnTitles(wrapper, 0)).toEqual(["w0", "h0", "w1", "h1", "w2"]);
      const top = wrapper.find(".board-card .board-card-top");
      expect(top.find(".priority").exists()).toBe(true);
      expect(top.find(".board-card-board").text()).toBe("Work");
      const home = wrapper.findAll(".board-card").at(1)!.find(".board-card-board");
      expect(home.text()).toBe("A very long home improvement board name");
      expect(home.attributes("title")).toBe("A very long home improvement board name");
      expect(home.find(".board-tab-dot").exists()).toBe(true);
      await wrapper.unmount();
    });

    // AB-12: a merged column named with several words is labelled by its own heading.
    it("labels each merged column region by its own heading", async () => {
      const store = seedAll();
      store.statuses.push(status("w-todo-ready", "work", "To Do Ready", 2));
      store.allColumns.push({ name: "To Do Ready", key: "to do ready", cardSort: "MANUAL", statusIds: ["w-todo-ready"] });
      const wrapper = mountBoard({ attachTo: document.body });
      await flushPromises();
      const names = wrapper.findAll(".kanban-column").map((column) => {
        const ids = column.attributes("aria-labelledby")!.split(/\s+/);
        return ids.map((id) => document.getElementById(id)?.textContent).join(" ");
      });
      expect(names).toEqual(["To Do", "Done", "Waiting", "To Do Ready"]);
      await wrapper.unmount();
    });

    // AB-13
    it("cycles a merged column's sort", async () => {
      const store = seedAll();
      const setColumnSort = vi.spyOn(store, "setColumnSort").mockResolvedValue(undefined as never);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find('button[aria-label="Sort To Do: unsorted"]').trigger("click");
      expect(setColumnSort).toHaveBeenCalledWith("to do", "PRIORITY");
      store.allColumns[0].cardSort = "PRIORITY_LAST";
      store.cards.find((item) => item.id === "w1")!.priority = "LOW";
      await flushPromises();
      expect(columnTitles(wrapper, 0)[0]).toBe("w1");
      expect(wrapper.find('button[aria-label="Sort To Do: priority last"]').exists()).toBe(true);
      await wrapper.unmount();
    });

    // AB-14
    it("creates a missing column when a card is dropped on it", async () => {
      const store = seedAll();
      const moveCard = vi.spyOn(store, "moveCard").mockResolvedValue(undefined as never);
      const moveCardToColumn = vi.spyOn(store, "moveCardToColumn").mockResolvedValue({ card: {} as any, status: status("w-wait", "work", "Waiting", 2), statusCreated: true });
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.findAll(".kanban-column").at(2)!.trigger("drop", { dataTransfer: { getData: () => "w0" } });
      await flushPromises();
      expect(moveCardToColumn).toHaveBeenCalledWith(expect.objectContaining({ id: "w0" }), "Waiting", 0);
      expect(useNoticesStore().current?.text).toBe("Added “Waiting” to “Work”.");

      await wrapper.findAll(".kanban-column").at(1)!.trigger("drop", { dataTransfer: { getData: () => "w1" } });
      expect(moveCard).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }), "w-done", 0);
      await wrapper.unmount();
    });

    // AB-15
    it("reorders a card among other boards' cards", async () => {
      const store = seedAll();
      const moveCard = vi.spyOn(store, "moveCard").mockResolvedValue(undefined as never);
      const wrapper = mountBoard();
      await flushPromises();
      const vm = wrapper.vm as any;
      vm.dropCard(drop("w2"), store.cards.find((item) => item.id === "h0"));
      expect(moveCard).toHaveBeenCalledWith(expect.objectContaining({ id: "w2" }), "w-todo", 1);
      vm.dropCard(drop("w0"), store.cards.find((item) => item.id === "h1"));
      expect(moveCard).toHaveBeenLastCalledWith(expect.objectContaining({ id: "w0" }), "w-todo", 1);
      await wrapper.unmount();
    });

    // AB-16
    it("adds a card to the last chosen board", async () => {
      const store = seedAll();
      const preferences = usePreferencesStore();
      const created = card("new", "home", "h-todo", 2);
      const createCard = vi.spyOn(store, "createCard").mockResolvedValue(created as any);
      const createCardInColumn = vi.spyOn(store, "createCardInColumn").mockResolvedValue({ card: card("new-2", "home", "h-done", 0) as any, status: status("h-done", "home", "Done", 2), statusCreated: true });
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find('button[aria-label="Add card to To Do"]').trigger("click");
      await flushPromises();
      expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ statusId: "w-todo" }), "work");
      await wrapper.find('button[aria-label="Close card"]').trigger("click");
      await flushPromises();

      preferences.lastCardBoardId = "home";
      await wrapper.find('button[aria-label="Add card to Done"]').trigger("click");
      await flushPromises();
      expect(createCardInColumn).toHaveBeenCalledWith("home", "Done", expect.objectContaining({ title: "", priority: "MEDIUM" }));
      expect(useNoticesStore().current?.text).toBe("Added “Done” to “A very long home improvement board name”.");
      expect(wrapper.find('[aria-label="Edit card"]').exists()).toBe(true);
      await wrapper.unmount();
    });

    // AB-17
    it("moves a card to another board from the editor", async () => {
      const store = seedAll();
      const preferences = usePreferencesStore();
      const remember = vi.spyOn(preferences, "setLastCardBoard").mockResolvedValue(undefined);
      const transferCard = vi.spyOn(store, "transferCard").mockImplementation(async (moving) => { moving.boardId = "home"; moving.statusId = "h-todo"; return { card: moving, status: store.statuses[2], statusCreated: false }; });
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.findAll(".board-card").at(0)!.trigger("click");
      const select = wrapper.find('select[name="board"]');
      expect(select.findAll("option").map((option) => option.text())).toEqual(["Work", "A very long home improvement board name"]);
      expect((select.element as HTMLSelectElement).value).toBe("work");
      await select.setValue("home");
      await flushPromises();
      expect(transferCard).toHaveBeenCalledWith(expect.objectContaining({ id: "w0" }), "home");
      expect(remember).toHaveBeenCalledWith("home");
      expect(wrapper.find('select[name="board"]').exists()).toBe(true);
      await wrapper.unmount();
    });

    // AB-17
    it("groups the card's own columns first in the status select", async () => {
      const store = seedAll();
      const moveCardToColumn = vi.spyOn(store, "moveCardToColumn").mockResolvedValue({ card: {} as any, status: status("h-done", "home", "Done", 2), statusCreated: true });
      const moveCard = vi.spyOn(store, "moveCard").mockResolvedValue(undefined as never);
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.findAll(".board-card").at(1)!.trigger("click");
      const groups = wrapper.findAll('select[name="status"] optgroup');
      expect(groups.map((group) => group.attributes("label"))).toEqual(["A very long home improvement board name", "Other columns"]);
      expect(groups[0].findAll("option").map((option) => option.text())).toEqual(["To do", "Waiting"]);
      expect(groups[1].findAll("option").map((option) => option.text())).toEqual(["Done"]);
      await wrapper.find('select[name="status"]').setValue("h-wait");
      await flushPromises();
      expect(moveCard).toHaveBeenCalledWith(expect.objectContaining({ id: "h0" }), "h-wait", 0);
      await wrapper.find('select[name="status"]').setValue("column:done");
      await flushPromises();
      expect(moveCardToColumn).toHaveBeenCalledWith(expect.objectContaining({ id: "h0" }), "Done", 0);
      expect(useNoticesStore().current?.text).toBe("Added “Done” to “A very long home improvement board name”.");
      await wrapper.unmount();
    });

    it("keeps the single-board card editor free of the board select", async () => {
      const store = seedBoard(["Backlog"]);
      store.cards = [{ id: "card-1", statusId: "status-1", title: "Card", body: "{}", priority: "MEDIUM", position: 0, archived: false, pathIds: [], labelIds: [], createdAt: "", updatedAt: "t1" }] as any;
      const wrapper = mountBoard();
      await flushPromises();
      await wrapper.find(".board-card").trigger("click");
      expect(wrapper.find('select[name="board"]').exists()).toBe(false);
      expect(wrapper.find('select[name="status"] optgroup').exists()).toBe(false);
      await wrapper.unmount();
    });

    // AB-18
    it("uses the card's own board for path rules in the All view", async () => {
      const store = seedAll();
      // Card play buttons follow the card's own status name (CT-06).
      store.statuses = store.statuses.map((item) => item.id === "h-todo" ? { ...item, name: "In progress" } : item);
      const wrapper = mountBoard();
      await flushPromises();
      const cards = wrapper.findAll(".board-card");
      expect(cards.at(1)!.find(".board-card-play").exists()).toBe(true);
      expect(cards.at(0)!.find(".board-card-play").exists()).toBe(false);
      await cards.at(1)!.trigger("click");
      expect(wrapper.find(".card-path-picker").exists()).toBe(false);
      await wrapper.find('button[aria-label="Close card"]').trigger("click");
      await flushPromises();
      await wrapper.findAll(".board-card").at(0)!.trigger("click");
      expect(wrapper.find(".card-path-picker").exists()).toBe(true);
      await wrapper.unmount();
    });

    // AB-20
    it("links archived items without a board in the All view", async () => {
      seedAll();
      const wrapper = mountBoard();
      await flushPromises();
      const link = wrapper.find(".board-footer a");
      expect(link.attributes("href")).toBe("/board/archive");
      expect(link.attributes("data-query")).toBe("{}");
      await wrapper.unmount();
    });
  });
});
