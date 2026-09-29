import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, withDirectives } from "vue";
import { vBackdropClose } from "./backdrop-close";

function mountBackdrop(close: (event: MouseEvent) => void) {
  const handler = ref(close);
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        withDirectives(
          h("div", { class: "backdrop" }, [h("div", { class: "dialog" }, "Dialog")]),
          [[vBackdropClose, handler.value]],
        ),
    }),
    { attachTo: document.body },
  );
  return { wrapper, handler };
}

function pressAndClick(down: Element, up: Element) {
  down.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  up.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

// TH-17 (docs/test-hardening-plan.md)
describe("vBackdropClose", () => {
  it("closes only when the press and the click both land on the backdrop", () => {
    const close = vi.fn();
    const { wrapper } = mountBackdrop(close);
    const backdrop = wrapper.get(".backdrop").element;
    const dialog = wrapper.get(".dialog").element;

    pressAndClick(dialog, backdrop);
    pressAndClick(backdrop, dialog);
    pressAndClick(dialog, dialog);
    expect(close).not.toHaveBeenCalled();

    pressAndClick(backdrop, backdrop);
    expect(close).toHaveBeenCalledTimes(1);

    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(close).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("calls the latest handler and stops listening once unmounted", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { wrapper, handler } = mountBackdrop(first);
    const backdrop = wrapper.get(".backdrop").element;
    handler.value = second;
    await wrapper.vm.$nextTick();
    pressAndClick(backdrop, backdrop);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    pressAndClick(backdrop, backdrop);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
