# Rich-text toolbar acceptance checklist

Note bodies and board card bodies share a formatting toolbar pinned to the
bottom of the text box, and a tighter line rhythm. Each item names the tests
that cover it. Tick an item only once those tests pass.

## Toolbar

- [x] **RT-01** One shared `RichTextToolbar` component (`role="toolbar"`,
  named "Formatting") sits at the bottom of the card body editor and of the
  note body editor.
  _Tests:_ `BoardView.test.ts` "puts the formatting toolbar under the card body",
  `NotesView.test.ts` "puts the formatting toolbar under the note body"
- [x] **RT-02** A text style menu offers Normal text, Heading 1, Heading 2,
  and Heading 3, shows the current block's style, and applies the chosen one.
  _Tests:_ `RichTextToolbar.test.ts` "shows and changes the text style of the current block"
- [x] **RT-03** Icon buttons toggle bold, italic, underline, strikethrough,
  bullet list, numbered list, checklist, quote, and code block. Each has an
  accessible name, and `aria-pressed` follows the selection. Pressing a button
  with the pointer keeps the editor's selection.
  _Tests:_ `RichTextToolbar.test.ts` "toggles marks and blocks and reflects the selection",
  "keeps the editor selection when a button is pressed with the pointer",
  `board.acceptance.test.mjs` "formats a card body from the toolbar on desktop and phone"
- [x] **RT-04** The toolbar is a single Tab stop. Arrow Left/Right, Home, and
  End move between its controls, following the WAI-ARIA toolbar pattern.
  _Tests:_ `RichTextToolbar.test.ts` "is one tab stop with arrow-key navigation"
- [x] **RT-05** The toolbar stays on one row. At 390px it scrolls sideways
  inside itself without widening the page or the dialog, and its buttons are
  44px targets on touch screens. In notes it stays visible above the
  floating tracker while a long note scrolls.
  _Tests:_ `board.acceptance.test.mjs` "formats a card body from the toolbar on desktop and phone"

## Line spacing

- [x] **RT-06** Paragraphs have no gap between them, so a new line from Enter
  looks like one from Shift+Enter, and the body line height is 1.35 (was
  1.45 with an 8px paragraph gap) in both cards and notes.
  _Tests:_ `board.acceptance.test.mjs` "uses the note body line height and paragraph spacing in the card body",
  `rich-text.test.ts` "keeps paragraphs gapless with a 1.35 line height"
