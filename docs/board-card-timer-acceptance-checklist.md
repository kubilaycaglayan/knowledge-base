# Board card timer acceptance checklist

A card tied to a path can start a time-tracking session straight from the
board. The play button is the time tracker's own button, shared as the
`TimerRunButton` component. Timer state stays server-owned: the board only asks
the server to start a timer and follows the shared timer store for whether one
is running. Each item names the tests that cover it. Tick an item only once
those tests pass.

- [x] **CT-01** `TimerRunButton` renders the tracker's play icon (or its stop icon while running), takes an accessible label, and is disabled while busy. The floating tracker uses it for Start/Stop.
  _Tests:_ `TimerRunButton.test.ts`, `FloatingTimeTracker.test.ts`
- [x] **CT-02** A card shows a play button at its top right when its board belongs to a path or the card has a path, and only while no timer is running (and only in the In Progress column, see CT-06). Cards on a custom board without a path have none.
  _Tests:_ `BoardView.test.ts` "shows a card play button only for path cards while no timer runs"
- [x] **CT-03** The card editor shows the same play button in its top row, just before Close, under the same conditions.
  _Tests:_ `BoardView.test.ts` "puts the card play button before Close in the editor"
- [x] **CT-04** Pressing play starts a timer for the board's path (or the card's first path on a custom board) with the card title as its description. It does not open or close the card editor, and every play button hides once the timer runs.
  _Tests:_ `timer.test.ts` "starts a session for a given path and description", `BoardView.test.ts` "starts a session from a card without opening it", `board.acceptance.test.mjs` "starts a session from a card and hides every play button", `board.real-stack.acceptance.test.mjs` "starts and stops a session from a path board card"
- [x] **CT-05** A timer started or stopped anywhere else (the tracker, another tab) hides or shows the play buttons without a reload.
  _Tests:_ `BoardView.test.ts` "shows a card play button only for path cards while no timer runs", `board.real-stack.acceptance.test.mjs` "starts and stops a session from a path board card"
- [x] **CT-06** Card play buttons appear only on cards in the "In Progress" column (matched by name, ignoring case, spaces, hyphens, and underscores, so "in-progress" counts; in the All boards view, by the card's own status name). A path card moved into In Progress gains the button while no timer runs, and one moved out loses it. The card editor's play button (CT-03) is unaffected.
  _Tests:_ `BoardView.test.ts` "shows card play buttons only in the In Progress column", "uses the card's own board for path rules in the All view", `board.acceptance.test.mjs` "starts a session from a card and hides every play button"
- [x] **CT-07** Starting or stopping a timer does not shift cards. An In Progress path card keeps an invisible, unfocusable play slot while a timer runs, so the card keeps its size.
  _Tests:_ `BoardView.test.ts` "keeps an invisible play slot on In Progress cards while a timer runs", `board.acceptance.test.mjs` "keeps every card in place when a timer starts and stops"
- [x] **CT-08** The card editor's play button stays available in every column. When pressed on a card outside In Progress, it starts the session and then moves the card to the end of its own board's In Progress column, if that board has one. If the session fails to start, or the board has no In Progress column, the card stays where it is.
  _Tests:_ `BoardView.test.ts` "moves the card to In Progress when its session starts from the editor", "leaves the card in place when the editor's session cannot start or there is no In Progress column", `board.acceptance.test.mjs` "moves a card to In Progress when a session starts from its editor"
