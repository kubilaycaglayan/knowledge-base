# Gantt card list toggle acceptance checklist

In the board Gantt view, a small round button on the timeline's top-left edge
hides the card list on the left so the timeline gets the full width, and shows
it again. The button changes nothing else. Each item names the tests that cover
it. Tick an item only once those tests pass.

- [ ] **GL-01** The Gantt view shows a "Hide card list" button, absolutely
  positioned on the top-left edge of the timeline (just right of the card list),
  inside the timeline's header row, with `aria-expanded="true"` and
  `aria-controls` naming the card list.
  _Tests:_ `BoardView.test.ts` "hides and shows the Gantt card list from the timeline's top-left toggle";
  `board.acceptance.test.mjs` "hides the Gantt card list from the timeline's top-left edge"
- [ ] **GL-02** Clicking it hides the card list; the timeline then fills the
  whole Gantt width, and the button stays on the timeline's top-left edge,
  now labelled "Show card list" with `aria-expanded="false"`.
  _Tests:_ `BoardView.test.ts` "hides and shows the Gantt card list from the timeline's top-left toggle";
  `board.acceptance.test.mjs` "hides the Gantt card list from the timeline's top-left edge"
- [ ] **GL-03** Clicking it again shows the card list, scrolled to the same rows
  as the timeline.
  _Tests:_ `board.acceptance.test.mjs` "hides the Gantt card list from the timeline's top-left edge"
- [ ] **GL-04** The toggle changes nothing else: the URL, the saved board
  state, the width toggle, the date range, and the timeline cards stay as they
  were. The choice is a per-browser convenience kept in local storage, so it
  survives a reload and still works when storage is unavailable.
  _Tests:_ `BoardView.test.ts` "hides and shows the Gantt card list from the timeline's top-left toggle";
  `BoardView.test.ts` "remembers the hidden Gantt card list in this browser"
- [ ] **GL-05** The whole button is visible and clickable at desktop and phone
  widths, in page and full width, and has a touch target of at least 44px on
  phones. The page passes the axe check with the list hidden.
  _Tests:_ `board.acceptance.test.mjs` "hides the Gantt card list from the timeline's top-left edge"
