import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

export const NOTE_BODY_MAX_CHARACTERS = 20_000;

// Keep typing, paste, and toolbar edits within the same plain-text limit enforced by the API.
export const NoteBodyLimit = Extension.create({
  name: "noteBodyLimit",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction(transaction) {
          if (!transaction.docChanged) return true;
          const text = transaction.doc.textBetween(
            0,
            transaction.doc.content.size,
            "\n",
            "\n",
          );
          return text.length <= NOTE_BODY_MAX_CHARACTERS;
        },
      }),
    ];
  },
});
