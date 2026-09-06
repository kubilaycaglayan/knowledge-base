import { mount } from "@vue/test-utils";
import ProjectDurationTable from "./ProjectDurationTable.vue";

describe("ProjectDurationTable", () => {
  const global = { stubs: { VTable: { template: "<table><slot /></table>" } } };

  it("renders category durations, hours, and color markers", () => {
    const wrapper = mount(ProjectDurationTable, {
      global,
      props: {
        categories: [
          { id: "path-1", label: "Learning", seconds: 3661 },
          { label: "Planning", seconds: 1800 },
        ],
        totalSeconds: 5461,
      },
    });

    expect(wrapper.text()).toContain("Learning");
    expect(wrapper.text()).toContain("01:01:01");
    expect(wrapper.text()).toContain("1.02");
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.find(".category-dot").attributes("style")).toContain("background");
  });

  it("shows an explicit empty state when no categories exist", () => {
    const wrapper = mount(ProjectDurationTable, { global, props: { categories: [], totalSeconds: 0 } });

    expect(wrapper.text()).toContain("No tracked time in this period.");
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });
});
