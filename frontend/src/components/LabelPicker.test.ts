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

  it("places pinned labels above selected labels and exposes an isolated pin mode", async () => {
    const wrapper = mount(LabelPicker, {
      props: {
        modelValue: ["selected"],
        labels: [
          { id: "alpha", name: "Alpha" },
          { id: "pinned", name: "Zulu" },
          { id: "selected", name: "Beta" },
        ],
        pinningEnabled: true,
        pinnedLabelIds: ["pinned"],
      },
      global: { plugins: [createPinia()] },
    });

    await wrapper.get('button[aria-label="Open label picker"]').trigger("click");
    await nextTick();
    expect([...document.querySelectorAll<HTMLElement>('.label-picker-options [role="option"] .option-name')]
      .map((option) => option.textContent))
      .toEqual(["Zulu", "Beta", "Alpha"]);
    expect(document.querySelector('.label-picker-options [role="option"] .option-pin-state')?.textContent).toBe("Pinned");

    document.querySelector<HTMLButtonElement>(".picker-pin-toggle")?.click();
    await nextTick();
    expect(document.querySelector(".picker-pin-description")?.textContent).toContain("keep at the top");
    const alpha = document.querySelector<HTMLButtonElement>('.label-picker-options [role="option"]:last-child')!;
    expect(alpha.getAttribute("aria-selected")).toBe("false");
    alpha.click();
    await nextTick();
    expect(wrapper.emitted("toggle-pin")).toEqual([["alpha"]]);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });
});
