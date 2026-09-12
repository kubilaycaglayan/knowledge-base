import { config, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LogsView from "./LogsView.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const log = (id: string, body: string, occurredAt: string, version = 0) => ({
  id, body, occurredAt, version, createdAt: occurredAt, updatedAt: occurredAt,
});

describe("LogsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00"));
    vi.mocked(api).mockResolvedValue([log("new", "Recent thought", "2026-09-11T11:30:00Z"), log("old", "Older thought", "2026-09-09T11:00:00Z")]);
  });
  afterEach(() => { vi.useRealTimers(); config.global.stubs = {}; });

  it("groups newest logs and shows the requested timestamp format", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    expect(wrapper.findAll(".log-group-heading").map((item) => item.text())).toEqual(["Last hour", "This week"]);
    expect(wrapper.find("time").text()).toBe("11:30 11:09:26");
    expect(wrapper.find(".log-body").text()).toBe("Recent thought");
  });

  it("saves the browser timestamp and adds a new log to the store", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    const created = log("created", "New capture", "2026-09-11T12:00:00Z", 0);
    vi.mocked(api).mockResolvedValueOnce(created);
    await wrapper.get("#new-log-body").setValue("New capture");
    await wrapper.get("#new-log-body").trigger("keydown.enter");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/logs", expect.objectContaining({ method: "POST", body: expect.stringContaining('"body":"New capture"') }));
    expect(wrapper.text()).toContain("New capture");
  });

  it("edits text and timestamp in place without dropping the draft", async () => {
    const wrapper = mount(LogsView);
    await flushPromises();
    await wrapper.get('button[aria-label^="Edit log"]').trigger("click");
    await wrapper.get('textarea[aria-label^="Edit log"]').setValue("Changed thought");
    await wrapper.get('input[aria-label="Edit log timestamp"]').setValue("2026-09-11T10:15");
    vi.mocked(api).mockResolvedValueOnce(log("new", "Changed thought", "2026-09-11T10:15:00Z", 1));
    await wrapper.get(".log-entry .primary").trigger("click");
    await flushPromises();
    expect(vi.mocked(api)).toHaveBeenCalledWith("/logs/new", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"body":"Changed thought"') }));
    expect(wrapper.text()).toContain("Changed thought");
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
    expect(wrapper.find(".timestamp-drift").exists()).toBe(true);
    expect(wrapper.find(".timestamp-drift .hour.drift-part").exists()).toBe(false);
    expect(wrapper.find(".timestamp-drift .minute.drift-part").exists()).toBe(true);
    expect(wrapper.find(".timestamp-drift .date.drift-part").exists()).toBe(false);
    vi.advanceTimersByTime(61_000);
    await wrapper.vm.$nextTick();
    expect(timestamp.value).toBe("2026-09-11T12:00");
  });
});
