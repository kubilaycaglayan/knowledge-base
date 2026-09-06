import { mount } from "@vue/test-utils";
import ReportTabs from "./ReportTabs.vue";

describe("ReportTabs", () => {
  it("renders all periods and marks only the selected period active", () => {
    const wrapper = mount(ReportTabs, { props: { modelValue: "MONTH" } });
    const tabs = wrapper.get('[role="tablist"]').findAll('[role="tab"]');

    expect(tabs.map((tab) => tab.text())).toEqual(["Weekly", "Monthly", "Yearly"]);
    expect(tabs.map((tab) => tab.attributes("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(tabs.filter((tab) => tab.classes().includes("active"))).toHaveLength(1);
    expect(tabs[1].classes()).toContain("active");
  });

  it("emits the selected report period", async () => {
    const wrapper = mount(ReportTabs, { props: { modelValue: "WEEK" } });

    await wrapper.get("button:nth-child(3)").trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["YEAR"]]);
  });
});
