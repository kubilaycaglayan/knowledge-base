import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import PromptDialog from "./PromptDialog.vue";

describe("PromptDialog", () => {
  it("resolves entered values and supports cancellation", async () => {
    const wrapper = mount(PromptDialog);
    const prompt = wrapper.vm.open("Path name", "Research");
    await nextTick();

    const input = wrapper.get('input[aria-label="Path name"]');
    expect((input.element as HTMLInputElement).value).toBe("Research");
    await input.setValue("Algorithms");
    await wrapper.get("button.primary").trigger("click");
    expect(await prompt).toBe("Algorithms");

    const cancelled = wrapper.vm.open("Another name");
    await nextTick();
    await wrapper.get(".prompt-dialog .text-button").trigger("click");
    expect(await cancelled).toBeNull();
  });

  it("renders multiline prompts", async () => {
    const wrapper = mount(PromptDialog);
    const prompt = wrapper.vm.open("Note content", "Existing", {
      multiline: true,
    });
    await nextTick();

    expect(wrapper.find('textarea[aria-label="Note content"]').exists()).toBe(
      true,
    );
    await wrapper.get("button.primary").trigger("click");
    expect(await prompt).toBe("Existing");
  });

  it("supports confirmation prompts without a text field", async () => {
    const wrapper = mount(PromptDialog);
    const prompt = wrapper.vm.open("Remove this path?", "", { confirmation: true });
    await nextTick();

    expect(wrapper.find("input, textarea").exists()).toBe(false);
    expect(wrapper.get("button.primary").text()).toBe("Confirm");
    await wrapper.get("button.primary").trigger("click");
    expect(await prompt).toBe("");
  });

  it("submits a single-line prompt when a mobile keyboard emits a line-break input", async () => {
    const wrapper = mount(PromptDialog);
    const prompt = wrapper.vm.open("Path name", "Mobile path");
    await nextTick();

    await wrapper.get('input[aria-label="Path name"]').trigger("beforeinput", { inputType: "insertLineBreak" });
    expect(await prompt).toBe("Mobile path");
  });

  it("resolves keyboard shortcuts and escape cancellation", async () => {
    const wrapper = mount(PromptDialog);
    const submitted = wrapper.vm.open("Quick value", "draft");
    await nextTick();
    await wrapper.get('input[aria-label="Quick value"]').trigger("keydown", { key: "Enter" });
    expect(await submitted).toBe("draft");

    const multiline = wrapper.vm.open("Long value", "draft", { multiline: true });
    await nextTick();
    await wrapper.get('textarea[aria-label="Long value"]').trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(await multiline).toBe("draft");

    const cancelled = wrapper.vm.open("Cancel me");
    await nextTick();
    await wrapper.get(".prompt-dialog").trigger("keydown", { key: "Escape" });
    expect(await cancelled).toBeNull();
  });

  it("cancels a pending prompt when a newer prompt opens or the component unmounts", async () => {
    const wrapper = mount(PromptDialog);
    const first = wrapper.vm.open("First");
    await nextTick();
    const second = wrapper.vm.open("Second");
    expect(await first).toBeNull();
    await nextTick();
    await wrapper.get(".prompt-dialog .text-button").trigger("click");
    expect(await second).toBeNull();

    const pending = wrapper.vm.open("Unmounted");
    wrapper.unmount();
    expect(await pending).toBeNull();
  });
});
