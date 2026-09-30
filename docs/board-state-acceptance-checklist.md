# Board state persistence acceptance checklist

The Boards page keeps its state wherever the user goes: the selected board
(or All boards), the Kanban/Gantt view, the Gantt date range, and the card
search. The state is stored with the user's server-side preferences, so it
survives page changes, reloads, new sign-ins, and other browsers. Column card
sorts were already stored on the server per status (and per All boards
column) and stay that way.

- [x] **BS-01** A user with no stored board state opens `/board` on the All
  boards view, the general board showing every tab board's cards. A stored
  board that is no longer in the tab list (archived, hidden, or deleted) and
  archiving the open board also fall back to All boards.
  Tests: `boards.test.ts` "falls back to All boards…", `BoardView.test.ts`
  "opens All boards by default", `UserPreferencesIntegrationTest.boardStateDefaultsAndIsValidated`.
- [x] **BS-02** `GET /preferences` returns `board: { boardId, view, ganttFrom,
  ganttTo, ganttSorts, search }` (`boardId` `null` means All boards); `PUT /preferences
  {"board": …}` replaces it. Another user's board returns `404`; an unknown
  view, an inverted range, or a search over 200 characters returns `400`.
  The stored board references `boards(id)` with `on delete set null`.
  Tests: `UserPreferencesIntegrationTest.boardStateDefaultsAndIsValidated`,
  `UserPreferencesIntegrationTest.boardStateIsStoredPerUser`.
- [x] **BS-03** Choosing a board, switching view, changing the Gantt range, or
  typing a search saves the state (search is debounced).
  Tests: `preferences.test.ts` "saves the board state…", `BoardView.test.ts`
  "remembers the board, view, range, and search".
- [x] **BS-04** Opening `/board` without query parameters restores the stored
  state and writes it into the URL; explicit query parameters (`board`,
  `view`, `from`, `to`, `q`) win over the stored state. A restored search
  opens the search field with its text.
  Tests: `BoardView.test.ts` "restores the stored state…", "lets the URL
  override…"; `board.acceptance.test.mjs` "keeps the board state across pages
  and reloads".
- [x] **BS-05** On the real stack the state follows the account into a new
  browser session.
  Tests: `board.real-stack.acceptance.test.mjs` "restores the board state in a
  new session".
- [x] **BS-06** Gantt priority and date rules can be enabled together, their
  activation order controls precedence, and the setup is remembered with board
  state. Date order is earlier first and cards without dates sort last.
  Tests: `BoardView.test.ts`, `preferences.test.ts`, and
  `UserPreferencesIntegrationTest`.
- [x] **BS-07** In Gantt view, board and path selection is available from the
  All boards dropdown, and the date range controls use the toolbar row so the
  timeline starts directly below it.
  Tests: `BoardView.test.ts` "moves the Gantt date controls into the toolbar…".
