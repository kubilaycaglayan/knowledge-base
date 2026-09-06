import { mount } from "@vue/test-utils";
import ProgressBar from "./ProgressBar.vue";

describe("ProgressBar", () => {
  it("exposes the current value through accessible progressbar attributes", () => {
    const wrapper = mount(ProgressBar, { props: { value: 37 } });
    const progress = wrapper.get('[role="progressbar"]');

    expect(progress.attributes("aria-label")).toBe("Item progress");
    expect(progress.attributes("aria-valuenow")).toBe("37");
    expect(progress.attributes("aria-valuemin")).toBe("0");
    expect(progress.attributes("aria-valuemax")).toBe("100");
    expect(progress.get("span").attributes("style")).toContain("width: 37%");
  });

  it("reacts when the item progress changes", async () => {
    const wrapper = mount(ProgressBar, { props: { value: 0 } });

    await wrapper.setProps({ value: 100 });

    expect(wrapper.get('[role="progressbar"]').attributes("aria-valuenow")).toBe("100");
    expect(wrapper.get("span").attributes("style")).toContain("width: 100%");
  });
});
