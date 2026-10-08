// The app tsconfig carries browser types only; Vitest runs these tests under Node.
// @ts-expect-error node:fs has no type declarations in this project
import { readFileSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { alignTimes, contentLines, documentLines, formatLineTime, setLineHistory } from "./line-history";
import { richTextExtensions } from "./rich-text";

// The same cases drive backend LineAttributionTest, keeping both extractors identical.
// Vitest runs from frontend/, so the path is relative to it.
const fixture = readFileSync("../backend/src/test/resources/line-history-cases.json", "utf8") as string;
const cases = JSON.parse(fixture) as { name: string; content: string; lines: string[] }[];

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
    expect(stamps[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-10-08T13:34:00Z");
    expect(stamps[1].textContent).toBe("Unsaved");
    expect(editor.getText()).toBe("Kept\n\nTyped");
    expect(editor.can().undo()).toBe(false);

    editor.commands.setContent(JSON.parse(content).content.concat({ type: "paragraph" }));
    setLineHistory(editor, { content: saved, times: ["2026-10-08T13:34:00Z"] });
    expect([...editor.view.dom.querySelectorAll(".line-history-stamp")].map((stamp) => stamp.textContent)[2]).toBe("");

    setLineHistory(editor, null);
    expect(editor.view.dom.querySelectorAll(".line-history-stamp")).toHaveLength(0);
  });
});
