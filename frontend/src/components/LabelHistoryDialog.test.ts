import { flushPromises, mount } from "@vue/test-utils";
import LabelHistoryDialog from "./LabelHistoryDialog.vue";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const emptyHours = () =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    uses: 0,
    trackedSeconds: 0,
  }));

const history = (overrides: Record<string, unknown> = {}) => ({
  labelId: "one",
  name: "Study",
  color: "#2878D5",
  firstUsedAt: "2026-01-20T00:00:00Z",
  lastUsedAt: "2026-05-02T14:00:00Z",
  totalUses: 6,
  trackedSeconds: 9000,
  uses: { sessions: 2, logs: 1, notes: 1, calendarDays: 1, cards: 1 },
  timeline: [
    { month: "2026-03", uses: 2, trackedSeconds: 5400 },
    { month: "2026-04", uses: 0, trackedSeconds: 0 },
    { month: "2026-05", uses: 1, trackedSeconds: 3600 },
  ],
  hours: emptyHours().map((hour) =>
    hour.hour === 9 ? { hour: 9, uses: 2, trackedSeconds: 3600 } : hour,
  ),
  related: [
    { id: "two", name: "Reading", color: "#E05D44", together: 3, trackedSeconds: 5400 },
  ],
  ...overrides,
});

const mountDialog = () =>
  mount(LabelHistoryDialog, {
    props: { labelId: "one" },
    attachTo: document.body,
  });

describe("LabelHistoryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // LH-06, LH-07
  it("shows first use, totals, the timeline, and hours", async () => {
    vi.mocked(api).mockResolvedValue(history());
    const wrapper = mountDialog();
    await flushPromises();

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(api).toHaveBeenCalledWith(
      `/labels/one/history?zone=${encodeURIComponent(zone)}`,
    );
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes("aria-labelledby")).toBeTruthy();
    expect(dialog.text()).toContain("Study");
    const firstUsed = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date("2026-01-20T00:00:00Z"));
    expect(wrapper.get('[data-test="first-used"]').text()).toContain(firstUsed);
    expect(wrapper.get('[data-test="total-uses"]').text()).toContain("6");
    expect(wrapper.get('[data-test="tracked-hours"]').text()).toContain("2.5");
    expect(dialog.text()).toContain("2 sessions");
    expect(dialog.text()).toContain("1 calendar day");
    expect(wrapper.findAll(".history-timeline .history-bar")).toHaveLength(3);
    expect(wrapper.findAll(".history-hours .history-bar")).toHaveLength(24);
    const timelineRows = wrapper.findAll(".history-timeline table tbody tr");
    expect(timelineRows).toHaveLength(3);
    expect(timelineRows[0].text()).toContain("1.5");
    expect(wrapper.find(".history-hours table").exists()).toBe(true);
  });

  // LH-08
  it("lists related labels and switches to one", async () => {
    vi.mocked(api).mockImplementation(async (path: string) =>
      path.startsWith("/labels/two/")
        ? history({ labelId: "two", name: "Reading", related: [] })
        : history(),
    );
    const wrapper = mountDialog();
    await flushPromises();

    const related = wrapper.get(".history-related");
    expect(related.text()).toContain("Reading");
    expect(related.text()).toContain("3");
    await related.get("button").trigger("click");
    await flushPromises();

    expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toMatch(
      /^\/labels\/two\/history/,
    );
    expect(wrapper.get('[role="dialog"] h2').text()).toContain("Reading");
  });

  // LH-08
  it("shows an empty state for an unused label", async () => {
    vi.mocked(api).mockResolvedValue(
      history({
        firstUsedAt: null,
        lastUsedAt: null,
        totalUses: 0,
        trackedSeconds: 0,
        uses: { sessions: 0, logs: 0, notes: 0, calendarDays: 0, cards: 0 },
        timeline: [],
        hours: emptyHours(),
        related: [],
      }),
    );
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("Not used yet");
    expect(wrapper.find(".history-timeline").exists()).toBe(false);
  });

  // LH-09
  it("closes with Escape and the close button", async () => {
    vi.mocked(api).mockResolvedValue(history());
    const wrapper = mountDialog();
    await flushPromises();

    await wrapper.get('[role="dialog"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
    await wrapper.get('button[aria-label="Close history"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(2);
  });

  // LH-09
  it("retries after a failed load", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(history());
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Could not load this label’s history.",
    );
    await wrapper.get("button.history-retry").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="total-uses"]').text()).toContain("6");
  });
});
