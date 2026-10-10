import { flushPromises, mount } from "@vue/test-utils";
import LabelHistoryRecords from "./LabelHistoryRecords.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));
const record = { id: "s1", date: "2026-05-02T09:00:00Z", title: "Reading session", preview: "" };
const setup = () => mount(LabelHistoryRecords, { props: {
  labelId: "study", uses: { sessions: 11, calendarDays: 1, notes: 1, logs: 1 },
} });
beforeEach(() => vi.resetAllMocks());

it("pages records and resets pagination when changing type", async () => {
  vi.mocked(api).mockResolvedValue({ items: [record], hasMore: true });
  const wrapper = setup();
  await flushPromises();
  expect(wrapper.text()).toContain("Reading session");
  await wrapper.findAll("nav button")[1].trigger("click");
  await flushPromises();
  expect(api).toHaveBeenLastCalledWith("/labels/study/history/records?kind=sessions&page=1");
  await wrapper.findAll(".record-filters button")[2].trigger("click");
  await flushPromises();
  expect(api).toHaveBeenLastCalledWith("/labels/study/history/records?kind=notes&page=0");
});

it("ignores late responses after switching categories and renders text safely", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(api).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const wrapper = setup();
  vi.mocked(api).mockResolvedValue({ items: [{ ...record, title: "<img src=x>", preview: "Note excerpt" }], hasMore: false });
  await wrapper.findAll(".record-filters button")[2].trigger("click");
  await flushPromises();
  resolve({ items: [record], hasMore: false });
  await flushPromises();
  expect(wrapper.text()).toContain("Note excerpt");
  expect(wrapper.text()).toContain("<img src=x>");
  expect(wrapper.find("img").exists()).toBe(false);
  expect(wrapper.text()).not.toContain("Reading session");
});

it("retries failures and shows an empty state", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ items: [], hasMore: false });
  const wrapper = setup();
  await flushPromises();
  await wrapper.get('[role="alert"] button').trigger("click");
  await flushPromises();
  expect(wrapper.get('[role="status"]').text()).toContain("No sessions");
});

it.each([
  [0, "/sessions/s1"],
  [1, "/calendar?date=2026-05-02"],
  [2, "/notes/s1"],
  [3, "/logs/s1"],
])("links a related record kind to its route", async (buttonIndex, href) => {
  vi.mocked(api).mockResolvedValue({ items: [record], hasMore: false });
  const wrapper = setup();
  await flushPromises();
  await wrapper.findAll(".record-filters button")[buttonIndex].trigger("click");
  await flushPromises();

  expect(wrapper.get(`a[href="${href}"]`).text()).toContain("Reading session");
});

it("moves between history pages without repeating or reordering records", async () => {
  const first = record;
  const second = { ...record, id: "s2", date: "2026-05-01T09:00:00Z", title: "Earlier session" };
  vi.mocked(api).mockImplementation(async (path: string) =>
    path.endsWith("page=0")
      ? { items: [first], hasMore: true }
      : { items: [second], hasMore: false },
  );
  const wrapper = setup();
  await flushPromises();
  expect(wrapper.findAll(".record-title").map((node) => node.text())).toEqual([
    "Reading session",
  ]);

  await wrapper.get(".record-pagination button:last-child").trigger("click");
  await flushPromises();
  expect(wrapper.findAll(".record-title").map((node) => node.text())).toEqual([
    "Earlier session",
  ]);

  await wrapper.get(".record-pagination button:first-child").trigger("click");
  await flushPromises();
  expect(wrapper.findAll(".record-title").map((node) => node.text())).toEqual([
    "Reading session",
  ]);
});

it("retries a failed related-record page without duplicating rows", async () => {
  const second = { ...record, id: "s2", title: "Earlier session" };
  let pageOneAttempts = 0;
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path.endsWith("page=0")) return { items: [record], hasMore: true };
    pageOneAttempts += 1;
    if (pageOneAttempts === 1) throw new Error("offline");
    return { items: [second], hasMore: false };
  });
  const wrapper = setup();
  await flushPromises();
  await wrapper.get(".record-pagination button:last-child").trigger("click");
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain("Could not load related records.");

  await wrapper.get('[role="alert"] button').trigger("click");
  await flushPromises();
  expect(pageOneAttempts).toBe(2);
  expect(wrapper.findAll(".record-title").map((node) => node.text())).toEqual([
    "Earlier session",
  ]);
});
