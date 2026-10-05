import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { RICH_TEXT_CLASS, richTextEditorProps, richTextExtensions } from "./rich-text";
import "../rich-text.css";

describe("shared rich-text body", () => {
  it("gives notes and board cards the same editor schema, including task lists", () => {
    const names = richTextExtensions().map((extension) => extension.name);
    expect(names).toEqual(expect.arrayContaining(["starterKit", "taskList", "taskItem"]));
    expect(RICH_TEXT_CLASS).toBe("rich-text");
  });

  // RT-06
  it("keeps paragraphs gapless with a 1.35 line height", () => {
    document.body.innerHTML = `<div class="${RICH_TEXT_CLASS}"><div class="ProseMirror"><p>One</p><p>Two</p></div></div>`;
    const [body, first] = [document.querySelector<HTMLElement>(".ProseMirror")!, document.querySelector<HTMLElement>("p")!];
    expect(getComputedStyle(body).lineHeight).toBe("1.35");
    expect(getComputedStyle(first).marginBottom).toBe("0px");
    expect(getComputedStyle(first).marginTop).toBe("0px");
    document.body.innerHTML = "";
  });

  // RT-07
  it("starts the first block at the shared top padding", () => {
    document.body.innerHTML = `<style>h2 { margin-top: 20px; }</style><div class="${RICH_TEXT_CLASS}"><div class="ProseMirror"><h2>Heading</h2><p>Text</p></div></div>`;
    const [body, first] = [document.querySelector<HTMLElement>(".ProseMirror")!, document.querySelector<HTMLElement>("h2")!];
    expect(getComputedStyle(body).paddingTop).toBe("6px");
    expect(getComputedStyle(first).marginTop).toBe("0px");
    document.body.innerHTML = "";
  });

  it("centers each checklist checkbox on the first line of its text", () => {
    document.body.innerHTML = `<div class="${RICH_TEXT_CLASS}"><div class="ProseMirror"><ul data-type="taskList"><li><label><input type="checkbox"><span></span></label><div><p>Task</p></div></li></ul></div></div>`;
    const [label, box] = [document.querySelector<HTMLElement>("li > label")!, document.querySelector<HTMLElement>("input")!];
    expect(parseFloat(getComputedStyle(label).marginTop)).toBe(0);
    expect(getComputedStyle(label).display).toBe("flex");
    expect(getComputedStyle(label).alignItems).toBe("center");
    const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]) as CSSStyleRule[];
    expect(rules.find((rule) => rule.selectorText === '.rich-text ul[data-type="taskList"] li > label')?.style.height).toBe("1lh");
    expect(parseFloat(getComputedStyle(box).marginTop)).toBe(0);
    expect(parseFloat(getComputedStyle(box).marginBottom)).toBe(0);
    document.body.innerHTML = "";
  });

  it("lets each checklist row's text fill the row so an empty row shows the caret", () => {
    document.body.innerHTML = `<div class="${RICH_TEXT_CLASS}"><div class="ProseMirror"><ul data-type="taskList"><li><label><input type="checkbox"><span></span></label><div><p><br></p></div></li></ul></div></div>`;
    const text = getComputedStyle(document.querySelector<HTMLElement>("li > div")!);
    expect(text.flexGrow).toBe("1");
    expect(parseFloat(text.minWidth)).toBe(0);
    document.body.innerHTML = "";
  });

  it("copies blocks as plain lines", () => {
    const editor = new Editor({ extensions: richTextExtensions(), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }, { type: "paragraph", content: [{ type: "text", text: "Two" }] }] } });
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
    expect(richTextEditorProps.clipboardTextSerializer(slice)).toBe("One\nTwo");
    editor.destroy();
  });
});
