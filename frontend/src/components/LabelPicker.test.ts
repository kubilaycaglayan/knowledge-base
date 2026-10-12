import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia } from "pinia";
import LabelPicker from "./LabelPicker.vue";

describe("LabelPicker", () => {
  it("opens when any non-chevron part of the control is clicked", async () => {
    const wrapper = mount(LabelPicker, {
      props: { modelValue: [], labels: [], label: "Labels" },
      global: { plugins: [createPinia()] },
    });

    await wrapper.get(".empty-picker").trigger("click");
    expect(document.querySelector(".label-picker-menu")).not.toBeNull();

    await wrapper.get('button[aria-label="Close label picker"]').trigger("click");
    expect(document.querySelector(".label-picker-menu")).toBeNull();

    await wrapper.get(".label-picker-control").trigger("click");
    expect(document.querySelector(".label-picker-menu")).not.toBeNull();

    await wrapper.get('button[aria-label="Close label picker"]').trigger("click");
    const trigger = wrapper.get('button[aria-label="Open label picker"]');
    expect(trigger.element.tagName).toBe("BUTTON");
    await trigger.trigger("click");
    expect(document.querySelector(".label-picker-menu")).not.toBeNull();
    wrapper.unmount();
  });

  it("moves focus into the search field and returns it to the trigger on Escape", async () => {
    const wrapper = mount(LabelPicker, {
      props: { modelValue: [], labels: [], label: "Labels" },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    const trigger = wrapper.get('button[aria-label="Open label picker"]');
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await nextTick();
    await nextTick();
    const search = document.querySelector<HTMLElement>('[role="combobox"][aria-label="Labels"]');
    expect(search).not.toBeNull();
    expect(document.activeElement).toBe(search);

    search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(document.querySelector(".label-picker-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });
});
