import type { Slice } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

// Note bodies and board card bodies share one schema and one look: build their
// editors from these extensions and put RICH_TEXT_CLASS (styled in
// src/rich-text.css) on the element that hosts the editor.
export const RICH_TEXT_CLASS = "rich-text";

export const richTextExtensions = () => [StarterKit, TaskList, TaskItem.configure({ nested: true })];

export const richTextEditorProps = {
  clipboardTextSerializer: (slice: Slice) => slice.content.textBetween(0, slice.content.size, "\n", "\n"),
};
