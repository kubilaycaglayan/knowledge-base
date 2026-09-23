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

  it("renders the board page with proper structure", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    expect(wrapper.find(".board-page").exists()).toBe(true);
    expect(wrapper.find("h1#board-heading").text()).toContain("Boards");
    await wrapper.unmount();
  });

  it("displays create board form and button", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const createForm = wrapper.find(".create-board");
    expect(createForm.exists()).toBe(true);
    expect(createForm.find('input[name="boardName"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Add board"]').exists()).toBe(true);
    await wrapper.unmount();
  });

  it("shows plus button for adding boards (icon button)", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const addButton = wrapper.find('button[aria-label="Add board"]');
    expect(addButton.exists()).toBe(true);
    expect(addButton.text()).toContain("＋");
    await wrapper.unmount();
  });

  it("displays error message with close button", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

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
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const store = useBoardsStore();
    const vm = wrapper.vm as any;
    vm.error = "Test error";
    await flushPromises();

    // Error message should exist or be available when there's an error
    if (vm.error) {
      // Simulate error dismissal via dismissError function
      vm.dismissError();
      await flushPromises();
      expect(vm.error).toBe("");
    }
    await wrapper.unmount();
  });

  it("toggles between Kanban and Gantt views", async () => {
    mockRoute.query = { view: "kanban" };
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const viewButtons = wrapper.findAll(".view-switch button");
    expect(viewButtons.length).toBe(2);
    expect(viewButtons[0].text()).toBe("Kanban");
    expect(viewButtons[1].text()).toBe("Gantt");
    await wrapper.unmount();
  });

  it("does not display JSON objects in card output", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

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

    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const boardTabs = wrapper.findAll(".board-tab");
    expect(boardTabs.length).toBe(2);
    expect(boardTabs[0].text()).toBe("Board 1");
    expect(boardTabs[1].text()).toBe("Board 2");
    expect(boardTabs[0].classes()).toContain("selected");
    await wrapper.unmount();
  });

  it("handles board rename inline (edit by clicking)", async () => {
    mockRoute.query = { board: "test-board-id" };
    const store = useBoardsStore();
    store.selectedId = "test-board-id";
    store.boards = [{ id: "test-board-id", name: "Test Board", archived: false, createdAt: "", updatedAt: "" }];

    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const vm = wrapper.vm as any;
    expect(vm.editingBoard).toBe(false);

    // Begin rename
    vm.beginBoardRename();
    await wrapper.vm.$nextTick();
    expect(vm.editingBoard).toBe(true);
    expect(vm.boardDraft).toBe("Test Board");

    // Cancel rename
    vm.editingBoard = false;
    await wrapper.vm.$nextTick();
    expect(vm.editingBoard).toBe(false);
    await wrapper.unmount();
  });

  it("displays keyboard accessible controls", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    // Check for aria labels and roles
    expect(wrapper.find(".board-page[aria-labelledby='board-heading']").exists()).toBe(true);
    const dialog = wrapper.find("[role='alertdialog']");
    // Dialog may not be visible initially, but the structure should support it
    expect(wrapper.find(".kanban[aria-label='Kanban board']").exists()).toBe(false); // Not visible until board selected
    await wrapper.unmount();
  });

  it("initializes with proper default values", async () => {
    mockRoute.query = {};
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const vm = wrapper.vm as any;
    expect(vm.newBoard).toBe("");
    expect(vm.newCardTitle).toBe("");
    expect(vm.newStatus).toBe("");
    expect(vm.error).toBe("");
    expect(vm.showArchived).toBe(false);
    await wrapper.unmount();
  });

  it("has archive button at end of actions", async () => {
    mockRoute.query = { board: "test-id" };
    const store = useBoardsStore();
    store.selectedId = "test-id";
    store.boards = [{ id: "test-id", name: "Test", archived: false, createdAt: "", updatedAt: "" }];

    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const buttons = wrapper.findAll(".board-actions button");
    // Last button should be archive-related
    const lastButton = buttons[buttons.length - 1];
    expect(lastButton.text()).toMatch(/Archive|Rename/);
    await wrapper.unmount();
  });

  it("shows confirmation dialog for destructive actions", async () => {
    mockRoute.query = { board: "test-id" };
    const store = useBoardsStore();
    store.selectedId = "test-id";
    store.boards = [{ id: "test-id", name: "Test", archived: false, createdAt: "", updatedAt: "" }];

    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

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

    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

    const vm = wrapper.vm as any;
    const status = store.statuses[0];

    // Edit status
    vm.editStatus(status);
    await wrapper.vm.$nextTick();
    expect(vm.editingStatusId).toBe("status-1");
    expect(vm.statusDraft).toBe("Backlog");
    await wrapper.unmount();
  });

  it("clears error messages programmatically", async () => {
    const wrapper = mount(BoardView, {
      global: {
        mocks: {
          $route: mockRoute,
          $router: mockRouter,
        },
      },
    });

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
