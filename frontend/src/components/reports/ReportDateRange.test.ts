import { mount } from "@vue/test-utils";
import ReportDateRange from "./ReportDateRange.vue";
import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subWeeks,
  subYears,
} from "date-fns";

vi.mock("@vuepic/vue-datepicker", () => ({
  VueDatePicker: {
    name: "VueDatePicker",
    props: ["modelValue", "presetDates", "multiCalendars", "formats", "range"],
    emits: ["update:modelValue"],
    template: `<button class="provider-picker" @click="$emit('update:modelValue', [new Date(2026, 7, 10), new Date(2026, 7, 20)])">Select range</button>`,
  },
}));

describe("ReportDateRange", () => {
  it("configures one calendar and emits a complete ISO date range", async () => {
    const wrapper = mount(ReportDateRange, {
      props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } },
    });
    const provider = wrapper.findComponent({ name: "VueDatePicker" });

    expect(provider.props("multiCalendars")).toBe(false);
    expect(provider.props("presetDates")).toHaveLength(11);
    expect(
      (provider.props("presetDates") as Array<{ label: string }>).map(
        (preset) => preset.label,
      ),
    ).toEqual([
      "Today",
      "Yesterday",
      "Week",
      "Last week",
      "Past two weeks",
      "Month",
      "Last month",
      "Quarter",
      "Last quarter",
      "Year",
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

  it("uses complete inclusive boundaries for all named range presets", () => {
    const wrapper = mount(ReportDateRange, {
      props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } },
    });
    const presets = wrapper
      .findComponent({ name: "VueDatePicker" })
      .props("presetDates") as Array<{ label: string; value: Date[] }>;
    const today = new Date();
    const currentWeek = startOfWeek(today, { weekStartsOn: 1 });
    const previousWeek = subWeeks(today, 1);
    const previousMonth = subMonths(today, 1);
    const previousQuarter = subQuarters(today, 1);
    const previousYear = subYears(today, 1);
    const expected = [
      [today, today],
      [subDays(today, 1), subDays(today, 1)],
      [currentWeek, endOfWeek(today, { weekStartsOn: 1 })],
      [startOfWeek(previousWeek, { weekStartsOn: 1 }), endOfWeek(previousWeek, { weekStartsOn: 1 })],
      [subDays(today, 13), today],
      [startOfMonth(today), endOfMonth(today)],
      [startOfMonth(previousMonth), endOfMonth(previousMonth)],
      [startOfQuarter(today), endOfQuarter(today)],
      [startOfQuarter(previousQuarter), endOfQuarter(previousQuarter)],
      [startOfYear(today), endOfYear(today)],
      [startOfYear(previousYear), endOfYear(previousYear)],
    ];

    expect(presets.map(({ value }) => value.map((date) => format(date, "yyyy-MM-dd")))).toEqual(
      expected.map((range) => range.map((date) => format(date, "yyyy-MM-dd"))),
    );
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
