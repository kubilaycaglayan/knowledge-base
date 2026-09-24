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

  it("copies blocks as plain lines", () => {
    const editor = new Editor({ extensions: richTextExtensions(), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }, { type: "paragraph", content: [{ type: "text", text: "Two" }] }] } });
    const slice = editor.state.doc.slice(0, editor.state.doc.content.size);
    expect(richTextEditorProps.clipboardTextSerializer(slice)).toBe("One\nTwo");
    editor.destroy();
  });
});
