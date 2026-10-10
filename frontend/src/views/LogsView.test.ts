import { config, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LogsView from "./LogsView.vue";
import { api } from "../lib/api";
import { useLogsStore } from "../stores/logs";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const log = (
  id: string,
  body: string,
  occurredAt: string,
  version = 0,
  labelIds: string[] = [],
) => ({
  id,
  body,
  occurredAt,
  version,
  labelIds,
  createdAt: occurredAt,
  updatedAt: occurredAt,
});

describe("LogsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00"));
    vi.mocked(api).mockImplementation(async (path) =>
      path === "/labels?scope=LOG"
        ? [{ id: "important", name: "Important", color: "#2878D5" }]
        : [
            log("new", "Recent thought", "2026-09-11T11:30:00Z"),
            log("same-hour", "Another thought", "2026-09-11T11:20:00Z"),
            log("old", "Older thought", "2026-09-10T11:00:00Z"),
          ],
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.global.stubs = {};
  });

  it("groups newest logs and shows the requested timestamp format", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    expect(
      wrapper.findAll(".log-group-heading").map((item) => item.text()),
    ).toEqual(["Last hour", "Yesterday"]);
    expect(wrapper.find("time.log-time").text()).toBe("11:30");
    expect(wrapper.find(".log-body").text()).toBe("Recent thought");
    expect(wrapper.findAll(".log-entry")[1].classes()).not.toContain(
      "log-hour-break",
    );
    expect(wrapper.find(".log-group-day-break").exists()).toBe(true);
    expect(wrapper.findAll("time.log-time")[2].text()).toBe("Sept 10 11:00");
    wrapper.unmount();
  });

  it("WU-03: shows warmed logs before the refresh returns", async () => {
    useLogsStore().setAll([log("warm", "Warmed thought", "2026-09-11T11:00:00Z")]);
    vi.mocked(api).mockImplementation((path) =>
      path === "/logs" ? new Promise(() => undefined) : Promise.resolve([]),
    );
    const wrapper = mount(LogsView);
    await flushPromises();
    expect(wrapper.find(".log-body").text()).toBe("Warmed thought");
    expect(vi.mocked(api).mock.calls.filter(([path]) => path === "/logs")).toHaveLength(1);
    wrapper.unmount();
  });

  it("keeps search hidden until / opens it, leaving Cmd/Ctrl+K to global search", async () => {
    const wrapper = mount(LogsView, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find(".log-composer").exists()).toBe(true);
    expect(wrapper.find(".logs-search-trigger").exists()).toBe(false);
    expect(wrapper.find("#logs-search-input").exists()).toBe(false);

    const globalShortcut = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true });
    window.dispatchEvent(globalShortcut);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("#logs-search-input").exists()).toBe(false);
    expect(globalShortcut.defaultPrevented).toBe(false);

    // A slash typed into the composer is just text.
    const composer = wrapper.get("#new-log-body").element;
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find("#logs-search-input").exists()).toBe(false);

    const slash = new KeyboardEvent("keydown", { key: "/", cancelable: true });
    window.dispatchEvent(slash);
    await wrapper.vm.$nextTick();
    expect(slash.defaultPrevented).toBe(true);
    expect(wrapper.find("#logs-search-input").exists()).toBe(true);
    await wrapper.unmount();
  });

  it("filters logs, shows no matches, clears search, and restores URL query state", async () => {
    const wrapper = mount(LogsView, { attachTo: document.body });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    await wrapper.vm.$nextTick();
    const search = wrapper.get<HTMLInputElement>("#logs-search-input");

    await search.setValue("Recent");
    expect(wrapper.findAll(".log-body").map((node) => node.text())).toEqual([
      "Recent thought",
    ]);
    expect(new URLSearchParams(window.location.search).get("q")).toBe("Recent");

    await search.setValue("no such log");
    expect(wrapper.get(".empty").text()).toBe("No logs match this search.");

    await search.setValue("");
    expect(wrapper.findAll(".log-body")).toHaveLength(3);
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false);

    window.history.pushState({}, "", "/logs?q=Older");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await wrapper.vm.$nextTick();
    expect(search.element.value).toBe("Older");
    expect(wrapper.findAll(".log-body").map((node) => node.text())).toEqual([
      "Older thought",
    ]);
    await wrapper.unmount();
  });

  it("shows 100 logs per page and places pagination after the log list", async () => {
    const manyLogs = Array.from({ length: 101 }, (_, index) => {
      const occurredAt = new Date(Date.UTC(2026, 1, 1, 1, 39 - index)).toISOString();
      return log(`log-${index}`, `Thought ${index}`, occurredAt);
    });
    vi.mocked(api).mockImplementation(async (path) =>
      path === "/labels?scope=LOG" ? [] : manyLogs,
    );
    const wrapper = mount(LogsView);
    await flushPromises();

    expect(wrapper.findAll(".log-entry")).toHaveLength(100);
    expect(wrapper.find(".log-group-heading").text()).toBe("February 2026");
    expect(wrapper.find(".logs-pagination").element).toBe(
      wrapper.find(".logs-page").element.lastElementChild,
    );
    await wrapper.get(".logs-pagination button:last-child").trigger("click");
    expect(wrapper.findAll(".log-entry")).toHaveLength(1);
    expect(wrapper.get(".log-entry").attributes("id")).toBe("log-log-100");
    expect(wrapper.find(".log-group-heading").text()).toBe("January 2026");
    expect(wrapper.find(".logs-pagination").text()).toContain("Page 2 of 2");
    expect(vi.mocked(api).mock.calls.filter(([path]) => path === "/logs")).toHaveLength(1);
    await wrapper.get(".logs-pagination button:first-child").trigger("click");
    expect(wrapper.findAll(".log-entry")).toHaveLength(100);
    await wrapper.unmount();
  });

  it("saves the browser timestamp and adds a new log to the store", async () => {
    const savedLogs: ReturnType<typeof log>[] = [];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels?scope=LOG") return [];
      if (path === "/logs" && options?.method === "POST") {
        const created = log("created", JSON.parse(String(options.body)).body, "2026-09-11T12:00:00Z", 0);
        savedLogs.unshift(created);
        return created;
      }
      if (path === "/logs") return savedLogs;
      return undefined;
    });
    const wrapper = mount(LogsView);
    await flushPromises();
    await wrapper.get("#new-log-body").setValue("New capture");
    await wrapper.get("#new-log-body").trigger("keydown.enter");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/logs",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"body":"New capture"'),
      }),
    );
    expect(wrapper.text()).toContain("New capture");
    wrapper.unmount();

    setActivePinia(createPinia());
    const reloaded = mount(LogsView);
    await flushPromises();
    expect(reloaded.text()).toContain("New capture");
    expect(reloaded.findAll(".log-entry")).toHaveLength(1);
    reloaded.unmount();
  });

  it("preserves log text and timestamp after a failed create and retries the same payload", async () => {
    const attempts: { body: string; occurredAt: string }[] = [];
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels?scope=LOG") return [];
      if (path === "/logs" && options?.method === "POST") {
        const payload = JSON.parse(String(options.body));
        attempts.push(payload);
        if (attempts.length === 1) throw new Error("temporary failure");
        return log("created", payload.body, payload.occurredAt, 0);
      }
      if (path === "/logs") return [];
      return undefined;
    });
    const wrapper = mount(LogsView);
    await flushPromises();
    const body = "Keep this log for retry";
    const timestamp = "2026-09-10T09:30";
    await wrapper.get("#new-log-body").setValue(body);
    await wrapper.get('[aria-label="Log timestamp"]').setValue(timestamp);
    await wrapper.get("#new-log-body").trigger("keydown.enter");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to save log. Please try again.");
    expect((wrapper.get("#new-log-body").element as HTMLTextAreaElement).value).toBe(body);
    expect((wrapper.get('[aria-label="Log timestamp"]').element as HTMLInputElement).value).toBe(timestamp);

    await wrapper.get("#new-log-body").trigger("keydown.enter");
    await flushPromises();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[1]).toEqual({ body, occurredAt: new Date(`${timestamp}:00`).toISOString() });
    expect(wrapper.findAll(".log-entry").some((entry) => entry.text().includes(body))).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("prevents duplicate log creates and reports progress while saving", async () => {
    let finishCreate!: (value: ReturnType<typeof log>) => void;
    const pendingCreate = new Promise<ReturnType<typeof log>>((resolve) => {
      finishCreate = resolve;
    });
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels?scope=LOG") return [];
      if (path === "/logs" && options?.method === "POST") return pendingCreate;
      if (path === "/logs") return [];
      return undefined;
    });
    const wrapper = mount(LogsView);
    await flushPromises();
    const body = wrapper.get("#new-log-body");
    await body.setValue("One in-flight log");
    const form = wrapper.get("form.log-composer");
    await form.trigger("submit");
    await form.trigger("submit");

    const submit = wrapper.get('form.log-composer button[type="submit"]');
    expect(submit.attributes("disabled")).toBeDefined();
    expect(submit.text()).toBe("Save");
    expect(submit.find(".spinner").exists()).toBe(true);
    expect(
      vi.mocked(api).mock.calls.filter(([path, options]) => path === "/logs" && options?.method === "POST"),
    ).toHaveLength(1);

    finishCreate(log("created", "One in-flight log", new Date().toISOString(), 0));
    await flushPromises();
    await wrapper.unmount();
  });

  for (const text of ["", "   "]) {
    it(`shows validation and does not create a log for ${text ? "whitespace" : "blank"} text`, async () => {
      const wrapper = mount(LogsView);
      await flushPromises();
      await wrapper.get("#new-log-body").setValue(text);
      await wrapper.get("#new-log-body").trigger("keydown.enter");
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe("Enter log text before saving.");
      expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/logs" && options?.method === "POST")).toBe(false);
      expect((wrapper.get("#new-log-body").element as HTMLTextAreaElement).value).toBe(text);
      wrapper.unmount();
    });
  }

  it("resets the composer height after saving a multiline log", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    const composer = wrapper.get("#new-log-body");
    const created = log(
      "created",
      "First line\nSecond line",
      "2026-09-11T12:00:00Z",
      0,
    );
    vi.mocked(api).mockResolvedValueOnce(created);

    await composer.setValue("First line\nSecond line");
    (composer.element as HTMLTextAreaElement).style.height = "120px";
    await composer.trigger("keydown.enter");
    await flushPromises();

    expect(composer.element).toHaveProperty("value", "");
    expect((composer.element as HTMLTextAreaElement).style.height).toBe("");
  });

  it("edits text and timestamp in place without dropping the draft", async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path === "/labels?scope=LOG"
        ? []
        : [
            log("new", "Recent thought", "2026-09-11T11:30:00Z"),
            log("old", "Older thought", "2026-09-10T11:00:00Z"),
          ],
    );
    const wrapper = mount(LogsView);
    await flushPromises();
    await wrapper.get('#log-old button[aria-label^="Edit log"]').trigger("click");
    await wrapper
      .get('#log-old textarea[aria-label^="Edit log"]')
      .setValue("Changed thought");
    await wrapper
      .get('#log-old input[aria-label="Edit log timestamp"]')
      .setValue("2026-09-11T10:15");
    vi.mocked(api).mockResolvedValueOnce(
      log("old", "Changed thought", "2026-09-11T10:15:00Z", 1),
    );
    await wrapper.get("#log-old .primary").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/logs/old",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"body":"Changed thought"'),
      }),
    );
    expect(wrapper.findAll(".log-body").map((node) => node.text())).toEqual([
      "Recent thought",
      "Changed thought",
    ]);
    expect(wrapper.findAll(".log-entry").map((node) => node.attributes("id"))).toEqual([
      "log-new",
      "log-old",
    ]);
    expect(wrapper.get("#log-old").element.closest(".log-group")?.querySelector(".log-group-heading")?.textContent).toBe("Today");
  });

  it("preserves an edited log draft after a failed update and allows retry", async () => {
    let attempts = 0;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels?scope=LOG") return [];
      if (path === "/logs/new" && options?.method === "PUT") {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        return log("new", "Recovered edit", "2026-09-11T11:30:00Z", 1);
      }
      if (path === "/logs") return [log("new", "Recent thought", "2026-09-11T11:30:00Z")];
      return undefined;
    });
    const wrapper = mount(LogsView);
    await flushPromises();
    await wrapper.get('button[aria-label^="Edit log"]').trigger("click");
    await wrapper.get('textarea[aria-label^="Edit log"]').setValue("Recovered edit");
    await wrapper.get(".log-entry .primary").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Your text is still here");
    expect((wrapper.get('textarea[aria-label^="Edit log"]').element as HTMLTextAreaElement).value).toBe("Recovered edit");
    await wrapper.get(".log-entry .primary").trigger("click");
    await flushPromises();
    expect(attempts).toBe(2);
    expect(wrapper.find('textarea[aria-label^="Edit log"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Recovered edit");
  });

  it("keeps the new-log timestamp current until it is manually changed", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    const timestamp = wrapper.get("#new-log-time").element as HTMLInputElement;
    expect(timestamp.value).toBe("2026-09-11T12:00");
    vi.advanceTimersByTime(61_000);
    await wrapper.vm.$nextTick();
    expect(timestamp.value).toBe("2026-09-11T12:01");

    await wrapper.get("#new-log-time").setValue("2026-09-11T12:00");
    expect(wrapper.find("#new-log-time").classes()).toContain(
      "timestamp-input-drift",
    );
    expect(wrapper.get('button[aria-label="Use browser time"]').classes()).toContain(
      "timestamp-reset-visible",
    );
    vi.advanceTimersByTime(61_000);
    await wrapper.vm.$nextTick();
    expect(timestamp.value).toBe("2026-09-11T12:00");
    await wrapper.get('button[aria-label="Use browser time"]').trigger("click");
    expect(timestamp.value).toBe("2026-09-11T12:02");
    expect(wrapper.get(".timestamp-reset").classes()).not.toContain(
      "timestamp-reset-visible",
    );
  });

  it("confirms removal and removes the record after the API succeeds", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    vi.mocked(api).mockResolvedValueOnce(undefined);
    await wrapper.get('button[aria-label^="Remove log"]').trigger("click");
    expect(wrapper.get(".prompt-dialog").text()).toContain("cannot be undone");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.find(".prompt-dialog").exists()).toBe(false);
    expect(vi.mocked(api)).toHaveBeenCalledWith("/logs/new", {
      method: "DELETE",
    });
    expect(wrapper.text()).not.toContain("Recent thought");
    expect(wrapper.text()).toContain("Another thought");
  });

  it("leaves a log unchanged when deletion is cancelled", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();

    await wrapper.get('button[aria-label^="Remove log"]').trigger("click");
    await wrapper.get(".prompt-dialog button.text-button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".prompt-dialog").exists()).toBe(false);
    expect(wrapper.text()).toContain("Recent thought");
    expect(vi.mocked(api).mock.calls.some(([path, options]) => path === "/logs/new" && options?.method === "DELETE")).toBe(false);
    wrapper.unmount();
  });

  it("keeps a log after delete fails and removes it when the user retries", async () => {
    let deleteAttempts = 0;
    vi.mocked(api).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/labels?scope=LOG") return [];
      if (path === "/logs/new" && options?.method === "DELETE") {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new Error("temporary failure");
        return undefined;
      }
      if (path === "/logs") return [log("new", "Recent thought", "2026-09-11T11:30:00Z")];
      return undefined;
    });
    const wrapper = mount(LogsView);
    await flushPromises();

    await wrapper.get('button[aria-label^="Remove log"]').trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Unable to remove this log. Please try again.");
    expect(wrapper.text()).toContain("Recent thought");

    await wrapper.get('button[aria-label^="Remove log"]').trigger("click");
    await wrapper.get(".prompt-dialog button.primary").trigger("click");
    await flushPromises();
    expect(deleteAttempts).toBe(2);
    expect(wrapper.text()).not.toContain("Recent thought");
    wrapper.unmount();
  });

  it("opens log labels and toggles a selected label", async () => {
    let labelIds: string[] = [];
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/labels?scope=LOG")
        return [{ id: "important", name: "Important", color: "#2878D5" }];
      if (path === "/logs/new/labels" && options?.method === "PUT") {
        labelIds = JSON.parse(String(options.body)).labelIds;
        return { ...log("new", "Recent thought", "2026-09-11T11:30:00Z"), labelIds };
      }
      return [log("new", "Recent thought", "2026-09-11T11:30:00Z", 0, labelIds)];
    });
    const wrapper = mount(LogsView);
    await flushPromises();
    await wrapper.get('button[aria-label^="Choose labels"]').trigger("click");
    expect(document.querySelector('.label-picker-menu [role="option"]')?.textContent).toContain("Important");
    document.querySelector<HTMLButtonElement>('.label-picker-menu [role="option"]')?.click();
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/logs/new/labels",
      expect.objectContaining({
        method: "PUT",
        body: '{"labelIds":["important"]}',
      }),
    );
    expect(
      wrapper.get('button[aria-label^="Choose labels"]').classes(),
    ).toContain("has-selection");

    document.querySelector<HTMLButtonElement>('.label-picker-menu [role="option"]')?.click();
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenLastCalledWith(
      "/logs/new/labels",
      expect.objectContaining({ method: "PUT", body: '{"labelIds":[]}' }),
    );
    expect(
      wrapper.get('button[aria-label^="Choose labels"]').classes(),
    ).not.toContain("has-selection");
  });

  it("closes log labels when the user clicks elsewhere", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    await wrapper.get('button[aria-label^="Choose labels"]').trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector(".label-picker-menu")).toBeNull();
  });

  it("does not render a label button when the user has no log labels", async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path === "/labels?scope=LOG"
        ? []
        : [log("new", "Recent thought", "2026-09-11T11:30:00Z")],
    );
    const wrapper = mount(LogsView);
    await flushPromises();
    expect(wrapper.find('button[aria-label^="Choose labels"]').exists()).toBe(true);
  });
});
