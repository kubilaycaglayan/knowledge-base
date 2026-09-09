import { mount } from "@vue/test-utils";
import ReportTabs from "./ReportTabs.vue";

describe("ReportTabs", () => {
  it("renders all periods and marks only the selected period active", () => {
    const wrapper = mount(ReportTabs, { props: { modelValue: "MONTH" } });
    const tabs = wrapper.get('[role="tablist"]').findAll('[role="tab"]');

    expect(tabs.map((tab) => tab.text())).toEqual([
      "Daily",
      "Weekly",
      "Monthly",
      "Quarterly",
      "Yearly",
    ]);
    expect(tabs.map((tab) => tab.attributes("aria-selected"))).toEqual([
      "false",
      "false",
      "true",
      "false",
      "false",
    ]);
    expect(tabs.filter((tab) => tab.classes().includes("active"))).toHaveLength(
      1,
    );
    expect(tabs[2].classes()).toContain("active");
  });

  it("emits the selected report period", async () => {
    const wrapper = mount(ReportTabs, { props: { modelValue: "WEEK" } });

    await wrapper.get("button:nth-child(5)").trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["YEAR"]]);
  });

  it("supports arrow, Home, and End key navigation", async () => {
    const wrapper = mount(ReportTabs, {
      props: { modelValue: "WEEK" },
      attachTo: document.body,
    });

    await wrapper
      .get('[data-report-tab="WEEK"]')
      .trigger("keydown", { key: "ArrowRight" });
    await wrapper
      .get('[data-report-tab="WEEK"]')
      .trigger("keydown", { key: "Home" });
    await wrapper
      .get('[data-report-tab="WEEK"]')
      .trigger("keydown", { key: "End" });

    expect(wrapper.emitted("update:modelValue")).toEqual([
      ["MONTH"],
      ["DAY"],
      ["YEAR"],
    ]);
    wrapper.unmount();
  });
});
