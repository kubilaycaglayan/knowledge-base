// The app tsconfig carries browser types only; Vitest runs these tests under Node.
// @ts-expect-error node:fs has no type declarations in this project
import { readFileSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { alignTimes, contentLines, documentLines, formatLineTime, plainText, sameLine, setLineHistory } from "./line-history";
import { RICH_TEXT_CLASS, richTextExtensions } from "./rich-text";
import "../rich-text.css";

// The same cases drive backend LineAttributionTest, keeping both extractors identical.
// Vitest runs from frontend/, so the path is relative to it.
const fixture = readFileSync("../backend/src/test/resources/line-history-cases.json", "utf8") as string;
const cases = JSON.parse(fixture) as { name: string; content: string; lines: string[] }[];
const matchCases = JSON.parse(readFileSync("../backend/src/test/resources/line-match-cases.json", "utf8") as string) as { a: string; b: string; same: boolean }[];

const editors: Editor[] = [];
function editorFor(content: string) {
  const editor = new Editor({ extensions: richTextExtensions(), content: JSON.parse(content) });
  editors.push(editor);
  return editor;
}
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe("line history", () => {
  it.each(cases)("reads the stored lines of $name", ({ content, lines }) => {
    expect(contentLines(content)).toEqual(lines);
  });

  it.each(cases.filter((value) => value.content.includes('"doc"')))("reads the same lines from the live editor for $name", ({ content, lines }) => {
    expect(documentLines(editorFor(content).state.doc).map((line) => line.text)).toEqual(lines);
  });

  it("starts each line where the editor shows it", () => {
    const editor = editorFor(cases.find((value) => value.name === "hard breaks split a paragraph")!.content);
    const [first, second] = documentLines(editor.state.doc);
    expect(editor.state.doc.textBetween(first.pos, first.pos + 5)).toBe("First");
    expect(editor.state.doc.textBetween(second.pos, second.pos + 6)).toBe("Second");
  });

  it.each(matchCases)("matches $a and $b by the shared rules", ({ a, b, same }) => {
    expect(sameLine(a, b)).toBe(same);
    expect(sameLine(b, a)).toBe(same);
  });

  it("keeps a task line's time when a plain-text client dropped its checkbox", () => {
    expect(alignTimes(["[x] Done", "Open"], ["t1", "t2"], ["Done", "[ ] Open"])).toEqual(["t1", "t2"]);
    expect(alignTimes(["[ ] Ship"], ["t1"], ["[x] Ship"])).toEqual([null]);
  });

  it("keeps saved times for matching lines and marks the rest unsaved", () => {
    expect(alignTimes(["A", "B", "C"], ["t1", "t2", "t3"], ["A", "New", "B", "C!"])).toEqual(["t1", null, "t2", null]);
    expect(alignTimes(["A"], [], ["A"])).toEqual([null]);
  });

  it("formats a line time as clock time and numeric date", () => {
    const { time, date } = formatLineTime("2026-10-08T13:34:00");
    expect(time).toBe("13:34");
    expect(date).toMatch(/2026/);
    expect(date).toMatch(/10/);
    expect(date).toMatch(/08/);
  });

  it("draws a stamp per line only while line history is on", () => {
    const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Kept" }] }, { type: "paragraph", content: [{ type: "text", text: "Typed" }] }] });
    const saved = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Kept" }] }] });
    const editor = editorFor(content);
    expect(editor.view.dom.querySelectorAll(".line-history-stamp")).toHaveLength(0);

    setLineHistory(editor, { content: saved, times: ["2026-10-08T13:34:00Z"] });
    const stamps = [...editor.view.dom.querySelectorAll<HTMLElement>(".line-history-stamp")];
    expect(editor.view.dom.classList.contains("line-history-on")).toBe(true);
    expect(stamps.map((stamp) => stamp.getAttribute("aria-hidden"))).toEqual(["true", "true"]);
    expect(stamps[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-10-08T13:34:00.000Z");
    expect(stamps[1].textContent).toBe("Unsaved");
    expect(editor.getText()).toBe("Kept\n\nTyped");
    expect(editor.can().undo()).toBe(false);

    editor.commands.setContent(JSON.parse(content).content.concat({ type: "paragraph" }));
    setLineHistory(editor, { content: saved, times: ["2026-10-08T13:34:00Z"] });
    expect([...editor.view.dom.querySelectorAll(".line-history-stamp")].map((stamp) => stamp.textContent)[2]).toBe("");

    setLineHistory(editor, null);
    expect(editor.view.dom.querySelectorAll(".line-history-stamp")).toHaveLength(0);
  });

  describe("while typing", () => {
    const paragraphs = (...texts: string[]) => ({ type: "doc", content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });
    const labels = (editor: Editor) => [...editor.view.dom.querySelectorAll<HTMLElement>(".line-history-stamp")].map((stamp) => stamp.querySelector("time")?.getAttribute("datetime") ?? stamp.textContent);

    it("re-aligns the gutter on every edit without a new history", () => {
      const editor = editorFor(JSON.stringify(paragraphs("One", "Two")));
      setLineHistory(editor, { content: JSON.stringify(paragraphs("One", "Two")), times: ["2026-10-08T10:00:00Z", "2026-10-08T11:00:00Z"] });
      expect(labels(editor)).toEqual(["2026-10-08T10:00:00.000Z", "2026-10-08T11:00:00.000Z"]);

      editor.commands.insertContentAt(editor.state.doc.content.size - 1, "!");
      expect(labels(editor)).toEqual(["2026-10-08T10:00:00.000Z", "Unsaved"]);
      editor.commands.insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "Zero" }] });
      expect(labels(editor)).toEqual(["Unsaved", "2026-10-08T10:00:00.000Z", "Unsaved"]);
      // Undo walks back to the saved text, and the saved times come back with it.
      editor.commands.undo();
      editor.commands.undo();
      expect(editor.getText()).toBe("One\n\nTwo");
      expect(labels(editor)).toEqual(["2026-10-08T10:00:00.000Z", "2026-10-08T11:00:00.000Z"]);
    });

    it("treats unreadable or missing times as unsaved", () => {
      const editor = editorFor(JSON.stringify(paragraphs("One", "Two")));
      setLineHistory(editor, { content: JSON.stringify(paragraphs("One", "Two")), times: ["not a time", "2026-10-08T11:00:00.123456Z"] });
      expect(labels(editor)).toEqual(["Unsaved", "2026-10-08T11:00:00.123Z"]);
      setLineHistory(editor, { content: JSON.stringify(paragraphs("One", "Two")), times: ["2026-10-08T11:00:00Z"] });
      expect(labels(editor)).toEqual(["Unsaved", "Unsaved"]);
    });

    it("keeps the gutter off until a history is set, even while typing", () => {
      const editor = editorFor(JSON.stringify(paragraphs("One")));
      editor.commands.insertContentAt(1, "x");
      expect(editor.view.dom.querySelectorAll(".line-history-stamp")).toHaveLength(0);
      expect(editor.view.dom.classList.contains("line-history-on")).toBe(false);
    });

    it("gives every stamp a full title and the short date for narrow screens", () => {
      const editor = editorFor(JSON.stringify(paragraphs("One")));
      setLineHistory(editor, { content: JSON.stringify(paragraphs("One")), times: ["2026-10-08T10:00:00Z"] });
      const time = editor.view.dom.querySelector("time")!;
      expect(time.title).toMatch(/^Edited .*2026/);
      expect(time.querySelector(".line-history-short-date")?.textContent).not.toMatch(/2026/);
    });
  });

  // jsdom lacks the editor's injected stylesheet; the real-stack suite checks white-space against it.
  it("sets stamps in the UI font, absolutely positioned, even inside code blocks", () => {
    const host = document.body.appendChild(document.createElement("div"));
    host.className = RICH_TEXT_CLASS;
    const content = { type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "a = 1" }] }] };
    const editor = new Editor({ element: host, extensions: richTextExtensions(), content });
    editors.push(editor);
    setLineHistory(editor, { content: JSON.stringify(content), times: ["2026-10-08T10:00:00Z"] });
    const stamp = host.querySelector<HTMLElement>(".line-history-stamp")!;
    expect(getComputedStyle(stamp).fontFamily).toMatch(/^Inter/);
    expect(getComputedStyle(stamp).position).toBe("absolute");
    host.remove();
  });

  describe("screen reader announcements", () => {
    const status = (editor: Editor) => editor.view.dom.parentElement!.querySelector<HTMLElement>('.line-history-status[role="status"]')!;

    it("announces the caret line's edit time only while line history is on", () => {
      const host = document.body.appendChild(document.createElement("div"));
      const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Kept" }] }, { type: "paragraph", content: [{ type: "text", text: "Typed" }] }] };
      const editor = new Editor({ element: host, extensions: richTextExtensions(), content });
      editors.push(editor);
      expect(status(editor).textContent).toBe("");

      setLineHistory(editor, { content: JSON.stringify({ type: "doc", content: [content.content[0]] }), times: ["2026-10-08T10:00:00Z"] });
      expect(status(editor).textContent).toBe(`Line 1, edited ${formatLineTime("2026-10-08T10:00:00Z").full}`);

      editor.commands.setTextSelection(8);
      expect(status(editor).textContent).toBe("Line 2, not saved yet");
      // Moving within the same line does not repeat the announcement.
      status(editor).textContent = "read";
      editor.commands.setTextSelection(9);
      expect(status(editor).textContent).toBe("read");

      setLineHistory(editor, null);
      expect(status(editor).textContent).toBe("");
      host.remove();
    });

    it("keeps the live region out of the editor's own text", () => {
      const host = document.body.appendChild(document.createElement("div"));
      const editor = new Editor({ element: host, extensions: richTextExtensions(), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] } });
      editors.push(editor);
      setLineHistory(editor, { content: JSON.stringify(editor.getJSON()), times: ["2026-10-08T10:00:00Z"] });
      expect(editor.view.dom.contains(status(editor))).toBe(false);
      expect(editor.getText()).toBe("One");
      editor.destroy();
      expect(host.querySelector(".line-history-status")).toBeNull();
      host.remove();
    });
  });

  describe("plain-text copy", () => {
    it("has one line per body line, with no blank lines between blocks and no checkboxes", () => {
      const editor = editorFor(JSON.stringify({ type: "doc", content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
        { type: "paragraph", content: [{ type: "text", text: "Alpha" }] },
        { type: "paragraph" },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }] }] },
        { type: "paragraph", content: [{ type: "text", text: "Last" }, { type: "hardBreak" }, { type: "text", text: "line" }] },
      ] }));
      expect(plainText(editor.state.doc)).toBe("Plan\nAlpha\n\nItem\nDone\nLast\nline");
    });

    it("rebuilds through the extension's paragraphs with every line time kept", () => {
      const rich = JSON.stringify({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }] }, { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Open" }] }] }] }] });
      const text = plainText(editorFor(rich).state.doc);
      const paragraphs = JSON.stringify({ type: "doc", content: text.split("\n").map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })) });
      expect(alignTimes(contentLines(rich), ["t1", "t2"], contentLines(paragraphs))).toEqual(["t1", "t2"]);
    });
  });
});
