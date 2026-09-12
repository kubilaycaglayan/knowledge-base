import { mount } from "@vue/test-utils";
import ReportTabs from "./ReportTabs.vue";

describe("ReportTabs", () => {
  it("renders all periods and selects the current period", () => {
    const wrapper = mount(ReportTabs, { props: { modelValue: "MONTH" } });
    const select = wrapper.get("select");
    const tabs = select.findAll("option");

    expect(tabs.map((tab) => tab.text())).toEqual([
      "Daily",
      "Weekly",
      "Monthly",
      "Quarterly",
      "Yearly",
    ]);
    expect(select.element.value).toBe("MONTH");
  });

  it("emits the selected report period", async () => {
    const wrapper = mount(ReportTabs, { props: { modelValue: "WEEK" } });

    await wrapper.get("select").setValue("YEAR");

    expect(wrapper.emitted("update:modelValue")).toEqual([["YEAR"]]);
  });
});
