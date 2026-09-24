import { Editor } from "@tiptap/core";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import vuetify from "../plugins/vuetify";
import { richTextExtensions } from "../lib/rich-text";
import RichTextToolbar from "./RichTextToolbar.vue";

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("RichTextToolbar", () => {
  let editor: Editor;
  function mountToolbar(content: object = { type: "doc", content: [paragraph("Hello world")] }) {
    editor = new Editor({ extensions: richTextExtensions(), content });
    return mount(RichTextToolbar, { props: { editor }, attachTo: document.body, global: { plugins: [vuetify] } });
  }
  const button = (wrapper: ReturnType<typeof mountToolbar>, name: string) => wrapper.get(`button[aria-label="${name}"]`);
  afterEach(() => { editor?.destroy(); document.body.innerHTML = ""; });

  // RT-01
  it("is a named toolbar", () => {
    const wrapper = mountToolbar();
    expect(wrapper.get('[role="toolbar"]').attributes("aria-label")).toBe("Formatting");
    wrapper.unmount();
  });

  // RT-02
  it("shows and changes the text style of the current block", async () => {
    const wrapper = mountToolbar();
    const style = button(wrapper, "Text style: Normal text");
    await style.trigger("click");
    await flushPromises();
    const options = [...document.querySelectorAll<HTMLElement>(".rich-text-style-menu [role='menuitemradio']")];
    expect(options.map((option) => option.textContent?.trim())).toEqual(["Normal text", "Heading 1", "Heading 2", "Heading 3"]);
    options[2].click();
    await flushPromises();
    expect(editor.isActive("heading", { level: 2 })).toBe(true);
    expect(wrapper.find('button[aria-label="Text style: Heading 2"]').exists()).toBe(true);
    wrapper.unmount();
  });

  // RT-03
  it("toggles marks and blocks and reflects the selection", async () => {
    const wrapper = mountToolbar();
    const names = ["Bold", "Italic", "Underline", "Strikethrough", "Bullet list", "Numbered list", "Checklist", "Quote", "Code block"];
    for (const name of names) expect(button(wrapper, name).attributes("aria-pressed")).toBe("false");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    await button(wrapper, "Bold").trigger("click");
    expect(editor.getHTML()).toContain("<strong>Hello</strong>");
    expect(button(wrapper, "Bold").attributes("aria-pressed")).toBe("true");
    await button(wrapper, "Italic").trigger("click");
    await button(wrapper, "Underline").trigger("click");
    await button(wrapper, "Strikethrough").trigger("click");
    expect(["Italic", "Underline", "Strikethrough"].map((name) => button(wrapper, name).attributes("aria-pressed"))).toEqual(["true", "true", "true"]);
    await button(wrapper, "Bullet list").trigger("click");
    expect(editor.isActive("bulletList")).toBe(true);
    await button(wrapper, "Numbered list").trigger("click");
    expect(editor.isActive("orderedList")).toBe(true);
    expect(button(wrapper, "Bullet list").attributes("aria-pressed")).toBe("false");
    await button(wrapper, "Checklist").trigger("click");
    expect(editor.isActive("taskList")).toBe(true);
    await button(wrapper, "Checklist").trigger("click");
    await button(wrapper, "Quote").trigger("click");
    expect(editor.isActive("blockquote")).toBe(true);
    await button(wrapper, "Quote").trigger("click");
    await button(wrapper, "Code block").trigger("click");
    expect(editor.isActive("codeBlock")).toBe(true);
    // Moving the selection elsewhere updates the pressed states.
    editor.commands.setContent({ type: "doc", content: [paragraph("Plain")] });
    await flushPromises();
    expect(button(wrapper, "Bold").attributes("aria-pressed")).toBe("false");
    expect(button(wrapper, "Code block").attributes("aria-pressed")).toBe("false");
    wrapper.unmount();
  });

  it("keeps the editor selection when a button is pressed with the pointer", async () => {
    const wrapper = mountToolbar();
    const pressed = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button(wrapper, "Bold").element.dispatchEvent(pressed);
    expect(pressed.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  // RT-04
  it("is one tab stop with arrow-key navigation", async () => {
    const wrapper = mountToolbar();
    const controls = wrapper.findAll("[role='toolbar'] button");
    expect(controls.map((control) => control.attributes("tabindex"))).toEqual(["0", ...controls.slice(1).map(() => "-1")]);
    (controls[0].element as HTMLElement).focus();
    await wrapper.get("[role='toolbar']").trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(controls[1].element);
    expect(controls[1].attributes("tabindex")).toBe("0");
    expect(controls[0].attributes("tabindex")).toBe("-1");
    await wrapper.get("[role='toolbar']").trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(controls.at(-1)!.element);
    await wrapper.get("[role='toolbar']").trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(controls[0].element);
    await wrapper.get("[role='toolbar']").trigger("keydown", { key: "ArrowLeft" });
    expect(document.activeElement).toBe(controls.at(-1)!.element);
    await wrapper.get("[role='toolbar']").trigger("keydown", { key: "Home" });
    expect(document.activeElement).toBe(controls[0].element);
    wrapper.unmount();
  });
});
