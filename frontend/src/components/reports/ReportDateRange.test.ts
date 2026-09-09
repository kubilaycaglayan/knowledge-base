import { mount } from "@vue/test-utils";
import ReportDateRange from "./ReportDateRange.vue";

vi.mock("@vuepic/vue-datepicker", () => ({
  VueDatePicker: {
    name: "VueDatePicker",
    props: ["modelValue", "presetDates", "multiCalendars", "formats", "range"],
    emits: ["update:modelValue"],
    template: `<button class="provider-picker" @click="$emit('update:modelValue', [new Date(2026, 7, 10), new Date(2026, 7, 20)])">Select range</button>`,
  },
}));

describe("ReportDateRange", () => {
  it("configures two calendars and emits a complete ISO date range", async () => {
    const wrapper = mount(ReportDateRange, {
      props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } },
    });
    const provider = wrapper.findComponent({ name: "VueDatePicker" });

    expect(provider.props("multiCalendars")).toEqual({
      count: 2,
      static: true,
    });
    expect(provider.props("presetDates")).toHaveLength(11);
    expect(
      (provider.props("presetDates") as Array<{ label: string }>).map(
        (preset) => preset.label,
      ),
    ).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "Last week",
      "Past two weeks",
      "This month",
      "Last month",
      "This quarter",
      "Last quarter",
      "This year",
      "Last year",
    ]);
    expect(provider.props("range")).toEqual({
      partialRange: false,
      maxRange: 732,
    });
    await wrapper.find(".provider-picker").trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      { startDate: "2026-08-10", endDate: "2026-08-20" },
    ]);
  });

  it("emits navigation events for adjacent ranges", async () => {
    const wrapper = mount(ReportDateRange, {
      props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } },
    });

    await wrapper.get('[aria-label="Previous date range"]').trigger("click");
    await wrapper.get('[aria-label="Next date range"]').trigger("click");

    expect(wrapper.emitted("previous")).toHaveLength(1);
    expect(wrapper.emitted("next")).toHaveLength(1);
  });

  it("ignores incomplete or unchanged date-picker values", async () => {
    const wrapper = mount(ReportDateRange, {
      props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } },
    });
    const provider = wrapper.findComponent({ name: "VueDatePicker" });
    await provider.vm.$emit("update:modelValue", [new Date(2026, 7, 24)]);
    await provider.vm.$emit("update:modelValue", [
      new Date(2026, 7, 24),
      new Date(2026, 7, 30),
    ]);

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("syncs externally changed ranges and formats partial picker values safely", async () => {
    const wrapper = mount(ReportDateRange, {
      props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } },
    });
    const provider = wrapper.findComponent({ name: "VueDatePicker" });
    const formats = provider.props("formats") as {
      input(value: Date[]): string;
    };
    expect(formats.input([new Date(2026, 7, 24)])).toBe("Select a range");
    await wrapper.setProps({
      modelValue: { startDate: "2026-09-01", endDate: "2026-09-07" },
    });
    expect(
      (provider.props("modelValue") as Date[]).map((date) =>
        date.toISOString().slice(0, 10),
      ),
    ).toEqual(["2026-09-01", "2026-09-07"]);
  });
});
