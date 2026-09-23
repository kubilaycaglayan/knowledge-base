# Board card timer acceptance checklist

A card tied to a path can start a time-tracking session straight from the
board. The play button is the time tracker's own button, shared as the
`TimerRunButton` component. Timer state stays server-owned: the board only asks
the server to start a timer and follows the shared timer store for whether one
is running. Each item names the tests that cover it. Tick an item only once
those tests pass.

- [ ] **CT-01** `TimerRunButton` renders the tracker's play icon (or its stop icon while running), takes an accessible label, and is disabled while busy. The floating tracker uses it for Start/Stop.
  _Tests:_ `TimerRunButton.test.ts`, `FloatingTimeTracker.test.ts`
- [ ] **CT-02** A card shows a play button at its top right when its board belongs to a path or the card has a path, and only while no timer is running. Cards on a custom board without a path have none.
  _Tests:_ `BoardView.test.ts` "shows a card play button only for path cards while no timer runs"
- [ ] **CT-03** The card editor shows the same play button in its top row, just before Close, under the same conditions.
  _Tests:_ `BoardView.test.ts` "puts the card play button before Close in the editor"
- [ ] **CT-04** Pressing play starts a timer for the board's path (or the card's first path on a custom board) with the card title as its description. It does not open or close the card editor, and every play button hides once the timer runs.
  _Tests:_ `timer.test.ts` "starts a session for a given path and description", `BoardView.test.ts` "starts a session from a card without opening it", `board.acceptance.test.mjs` "starts a session from a card and hides every play button", `board.real-stack.acceptance.test.mjs` "starts and stops a session from a path board card"
- [ ] **CT-05** A timer started or stopped anywhere else (the tracker, another tab) hides or shows the play buttons without a reload.
  _Tests:_ `BoardView.test.ts` "shows a card play button only for path cards while no timer runs", `board.real-stack.acceptance.test.mjs` "starts and stops a session from a path board card"
