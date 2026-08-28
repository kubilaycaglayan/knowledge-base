import { mount } from "@vue/test-utils";
import ReportDateRange from "./ReportDateRange.vue";

vi.mock("@vuepic/vue-datepicker", () => ({
  VueDatePicker: {
    name: "VueDatePicker",
    props: ["modelValue", "presetDates", "multiCalendars"],
    emits: ["update:modelValue"],
    template: `<button class="provider-picker" @click="$emit('update:modelValue', [new Date(2026, 7, 10), new Date(2026, 7, 20)])">Select range</button>`,
  },
}));

describe("ReportDateRange", () => {
  it("configures two calendars and emits a complete ISO date range", async () => {
    const wrapper = mount(ReportDateRange, { props: { modelValue: { startDate: "2026-08-24", endDate: "2026-08-30" } } });
    const provider = wrapper.findComponent({ name: "VueDatePicker" });

    expect(provider.props("multiCalendars")).toEqual({ count: 2, static: true });
    expect(provider.props("presetDates")).toHaveLength(9);
    await wrapper.find(".provider-picker").trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([{ startDate: "2026-08-10", endDate: "2026-08-20" }]);
  });
});
