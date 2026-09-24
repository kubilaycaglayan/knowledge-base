# All boards view acceptance checklist

The Boards page gets an icon-only **All boards** button (`mdiAllInclusive`) to
the left of the board tabs. Selecting it (`/board?board=all`) shows every card
of every tab board (active boards, excluding hidden path boards) in columns
merged by name (trimmed, case-insensitive), in the order the names first appear
across the tabs. Cards stay fully editable. Board data is cached in Pinia: a
view that was loaded once is not requested again when the user switches tabs
or navigates away and back, and every change is reflected in every cached view.
Each item names the tests that cover it. Tick an item only once those tests
pass.

## API

- [x] **AB-01** Card and status views include `boardId`.
  _Tests:_ `AllBoardsIntegrationTest.cardsAndStatusesCarryBoardId`
- [x] **AB-02** `GET /boards/all/columns` returns the merged columns `[{ name, cardSort, statuses[] }]` of the user's tab boards only: another user's boards, archived boards, hidden path boards, and archived statuses are left out. Names merge trimmed and case-insensitively, in first-seen tab order.
  _Tests:_ `AllBoardsIntegrationTest.columnsMergeByNameInTabOrder`, `AllBoardsIntegrationTest.columnsCoverOnlyTheUsersTabBoards`
- [x] **AB-03** `GET /boards/all/columns/cards/page?name&cursor&limit` pages a merged column's active cards mixed across boards. `MANUAL`: position, then tab order. `PRIORITY`: Urgent→Low, then the manual order. `PRIORITY_LAST`: Low→Urgent, then the manual order. Following `nextCursor` returns each card once. An unknown column returns an empty page.
  _Tests:_ `AllBoardsIntegrationTest.columnPagesInterleaveBoardsByPosition`, `AllBoardsIntegrationTest.columnPagesFollowTheColumnSort`
- [x] **AB-04** `PUT /boards/all/columns/sort {name, cardSort}` stores the merged column's sort for the user only. The boards' own statuses stay unchanged.
  _Tests:_ `AllBoardsIntegrationTest.mergedColumnSortIsStoredPerUserWithoutTouchingBoards`
- [x] **AB-05** `GET /boards/all/gantt?from&to` returns the dated active cards of every tab board.
  _Tests:_ `AllBoardsIntegrationTest.ganttCoversEveryTabBoard`
- [x] **AB-06** `POST /boards/{id}/cards/in-column {columnName, …}` creates a card in that column. If the board has no column with that name, it is created at the end. The response is `{ card, status, statusCreated }`.
  _Tests:_ `AllBoardsIntegrationTest.createInColumnCreatesAMissingColumn`
- [x] **AB-07** `POST /boards/{id}/cards/{cardId}/move-to-column {columnName, position}` moves a card within its board, creating the column if missing, and returns `{ card, status, statusCreated }`.
  _Tests:_ `AllBoardsIntegrationTest.moveToColumnCreatesAMissingColumn`
- [x] **AB-08** `POST /boards/{id}/cards/{cardId}/transfer {boardId}` moves a card to the end of the same-named column on another owned, active board, creating the column if missing. Moving into a path board sets the card's path to that path. Foreign or archived boards are rejected.
  _Tests:_ `AllBoardsIntegrationTest.transferMovesACardToAnotherBoard`, `AllBoardsIntegrationTest.transferRejectsForeignAndArchivedBoards`
- [x] **AB-09** Columns can also sort `PRIORITY_LAST` on a single board. Migration `V49__board_column_sorts.sql` allows it.
  _Tests:_ `BoardColumnSortIntegrationTest.priorityLastPagesOrderLowFirst`, smoke `run-smoke-tests.sh` (Flyway on PostgreSQL)
- [x] **AB-10** Preferences store `lastCardBoardId`. The board must be the user's own board, and it is cleared when that board is deleted.
  _Tests:_ `UserPreferencesIntegrationTest.lastCardBoardIsStoredAndValidated`

## Web

- [x] **AB-11** An icon-only "All boards" button sits left of the tabs, is `aria-current` when selected, and selects `?board=all`. Every board is then listed as a tab.
  _Tests:_ `BoardView.test.ts` "selects the All boards view from the icon button", `board.acceptance.test.mjs` "shows every board's cards in the All boards view"
- [x] **AB-12** The All view shows merged columns. Each card shows its board name on the priority row, on one line.
  _Tests:_ `BoardView.test.ts` "shows merged columns with a one-line board badge", `BoardView.test.ts` "labels each merged column region by its own heading", `board.acceptance.test.mjs` "keeps the board badge on the priority row on a phone"
- [x] **AB-13** Column sort cycles Unsorted → Priority first → Priority last, on single boards (saved on the status) and in the All view (saved per merged column).
  _Tests:_ `BoardView.test.ts` "cycles a column's sort through three states", `BoardView.test.ts` "cycles a merged column's sort", `board-merge.test.ts`, `board.acceptance.test.mjs` "cycles a column's sort from its header", `boards.test.ts` "pages a merged column and saves its sort"
- [x] **AB-14** Dragging a card to a merged column moves it within its own board. If its board lacks that column, the column is created and a snackbar says so.
  _Tests:_ `BoardView.test.ts` "creates a missing column when a card is dropped on it", `boards.test.ts` "adds a created column to the board and the merged columns", `board.real-stack.acceptance.test.mjs` "shows every board in the All boards view, creates missing columns, and moves cards across boards"
- [x] **AB-15** Dropping a card among cards of other boards places it after the nearest card of its own board and column above the drop point.
  _Tests:_ `board-merge.test.ts` "dropPosition", `BoardView.test.ts` "reorders a card among other boards' cards"
- [x] **AB-16** "+" on a merged column creates the card on the last chosen board, falling back to the first tab. If that board lacks the column, it is created with a snackbar.
  _Tests:_ `BoardView.test.ts` "adds a card to the last chosen board", `board.acceptance.test.mjs` "adds and moves cards across boards from the All boards view"
- [x] **AB-17** In the All view the card editor has a Board select. Changing it transfers the card and remembers the board. The Status select lists the card's own board's columns first, in a group named after the board, then the other columns. Picking another column creates it on the card's board.
  _Tests:_ `BoardView.test.ts` "moves a card to another board from the editor", `BoardView.test.ts` "groups the card's own columns first in the status select", `BoardView.test.ts` "keeps the single-board card editor free of the board select", `boards.test.ts` "moves a transferred card between cached board views"
- [x] **AB-18** The path picker, accent, and session path follow the card's own board.
  _Tests:_ `BoardView.test.ts` "uses the card's own board for path rules in the All view"
- [x] **AB-19** Pinia caching: going back to an already loaded board, the All view, or the Boards page makes no board requests. A card edited, moved, created, archived, or transferred in one view is shown correctly in every cached view.
  _Tests:_ `boards.test.ts` "serves a loaded view from the cache", `boards.test.ts` "shares card changes across cached views", `boards.test.ts` "sends card changes to the card's own board", `boards.test.ts` "forgets cached views when boards change elsewhere", `board.acceptance.test.mjs` "shows every board's cards in the All boards view", `board.real-stack.acceptance.test.mjs` (the All boards scenario)
- [x] **AB-20** The All view's Gantt shows every tab board's dated cards, and its Archived items link has no board filter.
  _Tests:_ `BoardView.test.ts` "links archived items without a board in the All view", `boards.test.ts` "loads the All boards timeline"
- [x] **AB-21** `docs/api.md`, `docs/roadmap.md`, and the smoke tests cover the new endpoints.
  _Tests:_ smoke `run-smoke-tests.sh` (merged columns, `in-column`, column sort, and column pages on PostgreSQL)
