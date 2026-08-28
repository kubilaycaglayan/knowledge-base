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
});
