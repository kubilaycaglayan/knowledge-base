# Gantt changed-card highlight acceptance checklist

In the board Gantt view, a card you change is highlighted for four seconds so
you can see where it landed. This covers every change: creating a card,
setting, moving, resizing or clearing its dates, and editing any other property
(title, body, priority, labels, path, status, board). Each item names the tests
that cover it. Tick an item only once those tests pass.

- [ ] **GH-01** The boards store marks a card as changed for four seconds after
  a successful create (`createCard`, `createCardInColumn`), edit (`updateCard`),
  move (`moveCard`, `moveCardToColumn`), board transfer (`transferCard`) or
  restore (`archiveCard` with restore). Several cards can be marked at once,
  each for its own four seconds. Changing a marked card again restarts its four
  seconds.
  _Tests:_ `boards.test.ts` "marks a card as changed for four seconds after each successful card change";
  `boards.test.ts` "keeps each changed card marked for its own four seconds"
- [ ] **GH-02** A failed or superseded change does not mark the card. Signing
  out (resetting the store) clears every mark.
  _Tests:_ `boards.test.ts` "does not mark a card whose change failed"
- [ ] **GH-03** A marked card's Gantt row is highlighted: the card-list label
  and the timeline row (its bar, or its empty unscheduled track) carry
  `last-changed`, and lose it after four seconds.
  _Tests:_ `BoardView.test.ts` "highlights the last changed Gantt card for four seconds";
  `BoardView.test.ts` "highlights a changed card's label and timeline row"
- [ ] **GH-04** Creating a card with the Gantt "Add card" button highlights the
  new card's row.
  _Tests:_ `BoardView.test.ts` "highlights a card created from the Gantt view"
- [ ] **GH-05** Dragging a bar to new dates, resizing either end, and setting
  dates on an unscheduled card (click or drag) highlight the card's row.
  _Tests:_ `board.acceptance.test.mjs` "highlights a Gantt card after its dates change on the timeline";
  `board.acceptance.test.mjs` "highlights an unscheduled Gantt card after it gets a date"
- [ ] **GH-06** Editing the card in the dialog highlights it on every save:
  changing or clearing its dates, and changing its title, priority, labels,
  status or board.
  _Tests:_ `BoardView.test.ts` "highlights the last changed Gantt card for four seconds";
  `BoardView.test.ts` "highlights a Gantt card after its dates are cleared in the editor"
- [ ] **GH-07** The highlight is a tint on the label and row plus a ring on the
  bar, so it shows on any card color, and it does not animate when the user
  prefers reduced motion.
  _Tests:_ `board.acceptance.test.mjs` "highlights a Gantt card after its dates change on the timeline"
