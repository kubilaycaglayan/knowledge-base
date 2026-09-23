import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TimerRunButton from "./TimerRunButton.vue";

describe("TimerRunButton", () => {
  it("shows the play icon with an accessible label and emits clicks", async () => {
    const wrapper = mount(TimerRunButton, { props: { label: "Start a session" } });
    const button = wrapper.get("button");
    expect(button.attributes("aria-label")).toBe("Start a session");
    expect(button.attributes("title")).toBe("Start a session");
    expect(button.find(".timer-action-icon").classes()).not.toContain("stop");
    expect(button.classes()).not.toContain("is-running");
    await button.trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(1);
  });

  it("shows the stop icon while running and is disabled while busy", () => {
    const wrapper = mount(TimerRunButton, { props: { label: "Stop timer", running: true, busy: true } });
    const button = wrapper.get("button");
    expect(button.find(".timer-action-icon").classes()).toContain("stop");
    expect(button.classes()).toContain("is-running");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.attributes("aria-busy")).toBe("true");
  });
});
