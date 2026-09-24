# Card dialog layout acceptance checklist

Tidies the board card dialog, most visible in the All boards view. The path
picker moves into the header as a Vuetify select. Label chips show their
names. The autosave "Saved" text goes away. Every control in the header and
footer rows gets a slot of its own, so none of them pushes or overlaps
another, on desktop or on a phone. Each item names the tests that cover it.
Tick an item only once those tests pass.

## Labels

- [ ] **CD-01** Each selected label chip in the card editor shows the label's
  name, and its close button removes that label. Vuetify 4 passes the raw
  item to the `selection` slot, so the chip reads `name`/`id` from the label.
  _Tests:_ `BoardView > card labels > shows each selected label's name on its chip and removes it from the chip`,
  `board.acceptance > keeps every card editor control in its own slot on desktop and phone`
- [ ] **CD-02** The Reports path and label filter chips show the selected
  names, and their close buttons remove them (same Vuetify 4 slot change).
  _Tests:_ `ReportsView > shows each selected path and label name on its filter chip`

## Autosave indicator

- [ ] **CD-03** The card editor shows no "Saving…"/"Saved" text. Save failures
  still show inline with Retry.
  _Tests:_ `BoardView > card editor > shows no saving or saved text in the editor`,
  `BoardView > puts dates, priority, status, labels, and an icon-only archive button in the editor footer`

## Path picker

- [ ] **CD-04** On boards that are not path boards, the card's path picker is a
  Vuetify select in the header, after the title and before the play and
  close buttons, and not a native `<select>`. Its menu opens directly under
  the field and stays inside the viewport on desktop and on a phone. Picking a
  path, or "No path", updates the card.
  _Tests:_ `BoardView > puts the title, the path picker, and the close button on the editor's first row`,
  `BoardView > sets and clears the card path from the header picker`,
  `board.acceptance > opens the card path menu under its field on desktop and phone`

## Row layout

- [ ] **CD-05** The header row (title, path, play, close) and the footer row
  (dates, priority, status, labels, archive) give each control a reserved
  slot. Nothing overlaps or leaves the dialog, and the archive button stays on
  the labels' row at 1280px and 390px wide, with labels selected.
  _Tests:_ `board.acceptance > keeps every card editor control in its own slot on desktop and phone`
