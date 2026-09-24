# Card close highlight acceptance checklist

When a card's dialog closes, the card on the board gets a highlight ring, so
you can find it again even if it moved to another column. The ring fades out
over 3 seconds. Each item names the tests that cover it. Tick an item only
once those tests pass.

- [x] **CH-01** Closing the card editor (Close, Escape, Ctrl/Cmd+Enter, or the
  backdrop) marks that card as just closed for 3 seconds. Closing another card
  moves the mark to that card. Archiving the card from the editor leaves
  nothing marked.
  _Tests:_ `BoardView.test.ts` "marks the card just closed for three seconds"
- [x] **CH-02** The mark is an accent ring outside the card's border that
  fades out by animating only `opacity` over 3 seconds. The card's size and
  position do not change, and the ring does not block clicks.
  _Tests:_ `board.acceptance.test.mjs` "rings the card just closed and fades the ring out"
- [x] **CH-03** With reduced motion, the ring shows without animation and is
  removed after the same 3 seconds.
  _Tests:_ `board.acceptance.test.mjs` "rings the card just closed and fades the ring out"
