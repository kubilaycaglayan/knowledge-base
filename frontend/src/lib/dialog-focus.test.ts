import { mount } from "@vue/test-utils";
import { defineComponent, h, withDirectives } from "vue";
import { vDialogFocus } from "./dialog-focus";

// jsdom does no layout, so report a box for every element the trap considers.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
    () => [{}] as unknown as DOMRectList,
  );
});
afterAll(() => vi.restoreAllMocks());

const Dialog = defineComponent({
  setup: () => () =>
    withDirectives(
      h("div", { role: "dialog", tabindex: "-1" }, [
        h("input", { class: "first" }),
        h("button", { disabled: true }, "Disabled"),
        h("button", { class: "last" }, "Save"),
      ]),
      [[vDialogFocus]],
    ),
});

const flush = () => new Promise((resolve) => setTimeout(resolve));
const tab = (target: Element, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));

// TH-18 (docs/test-hardening-plan.md)
describe("vDialogFocus", () => {
  it("focuses the first control, wraps Tab both ways, and returns focus on close", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mount(Dialog, { attachTo: document.body });
    await flush();
    const first = wrapper.get(".first").element as HTMLElement;
    const last = wrapper.get(".last").element as HTMLElement;
    expect(document.activeElement).toBe(first);

    tab(first, true);
    expect(document.activeElement).toBe(last);
    tab(last);
    expect(document.activeElement).toBe(first);

    const inner = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    first.dispatchEvent(inner);
    expect(document.activeElement).toBe(first);
    expect(inner.defaultPrevented).toBe(false);

    wrapper.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("does not steal focus back to a trigger that has left the page", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const wrapper = mount(Dialog, { attachTo: document.body });
    await flush();
    trigger.remove();
    wrapper.unmount();
    expect(document.activeElement).not.toBe(trigger);
  });
});
