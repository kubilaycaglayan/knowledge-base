# Gantt off-screen card arrows acceptance checklist

In the board Gantt view, a card that has dates but none of them in the part of
the timeline you are looking at gets a small arrow at the edge of the timeline,
on that card's row. The arrow points toward the card's dates. Clicking it moves
the timeline so it starts at the card's start date. Each item names the tests
that cover it. Tick an item only once those tests pass.

- [x] **GO-01** A dated card whose dates all fall before the first visible day
  (for example a card on 5 September while the timeline shows 6–16 September)
  shows a left-pointing arrow button at the left edge of the timeline, on that
  card's row.
  _Tests:_ `board-gantt.test.ts` "tells which side of the visible days a card's dates lie on";
  `BoardView.test.ts` "shows edge arrows for dated cards outside the visible timeline"
- [x] **GO-02** A dated card whose dates all fall after the last visible day
  shows a right-pointing arrow at the right edge of the timeline, on its row.
  _Tests:_ `board-gantt.test.ts` "tells which side of the visible days a card's dates lie on";
  `BoardView.test.ts` "shows edge arrows for dated cards outside the visible timeline"
- [x] **GO-03** Cards with any day in view (including a range that spans the
  whole view) and cards without dates show no arrow. Cards with only a start
  date or only a due date use that one date.
  _Tests:_ `board-gantt.test.ts` "tells which side of the visible days a card's dates lie on";
  `BoardView.test.ts` "shows edge arrows for dated cards outside the visible timeline"
- [x] **GO-04** Clicking an arrow sets the timeline start date to the card's
  start date (its due date when it has none), keeps the range length, puts the
  new range in the URL and loads it, and the card's bar is then in view with no
  arrow.
  _Tests:_ `BoardView.test.ts` "moves the timeline start to the card's start date from its edge arrow";
  `board.acceptance.test.mjs` "pins off-screen card arrows to the timeline edges and jumps to the card"
- [x] **GO-05** "Visible" means the scrolled viewport of the timeline: arrows
  appear and disappear as you scroll horizontally, and they stay pinned to the
  visible left and right edges, vertically centered on the card's row.
  _Tests:_ `board.acceptance.test.mjs` "pins off-screen card arrows to the timeline edges and jumps to the card"
- [x] **GO-06** Each arrow is a native button named "Show <title> on the
  timeline, starting <date>", with a hit target of at least 24px (44px on
  phones) and a visible focus ring.
  _Tests:_ `BoardView.test.ts` "shows edge arrows for dated cards outside the visible timeline";
  `board.acceptance.test.mjs` "pins off-screen card arrows to the timeline edges and jumps to the card"
