# Path boards acceptance checklist

Every path owns exactly one board from birth. Path boards sit next to the
custom boards a user creates on `/board`. Each item names the tests that
cover it. Tick an item only once those tests pass.

## Creation and backfill

- [ ] **PB-01** Creating a path through `POST /api/v1/paths` creates one board for it. The board takes the path's name and gets the default statuses Backlog, Pending, In Progress and Done, in that order.
  _Tests:_ `PathBoardIntegrationTest.creatingAPathCreatesItsBoardWithDefaultStatuses`
- [ ] **PB-02** Creating the board is idempotent: a path never gets a second board, whether it is restored, imported again, or created again through the service.
  _Tests:_ `PathBoardIntegrationTest.restoringAPathReusesItsBoard`, `PathBoardIntegrationTest.createForPathIsIdempotent`
- [ ] **PB-03** Paths created by the Clockify import and the Knowledge Base CSV import get a board too.
  _Tests:_ `PathBoardIntegrationTest.importedPathsGetBoards`
- [ ] **PB-04** Migration `V45__path_boards.sql` creates one board, with the default statuses, for every non-deleted path that exists before the migration runs.
  _Tests:_ smoke `run-smoke-tests.sh` (Flyway on PostgreSQL), plus manual verification on the dev database

## Naming

- [ ] **PB-05** Renaming a path renames its board.
  _Tests:_ `PathBoardIntegrationTest.renamingAPathRenamesItsBoard`
- [ ] **PB-06** `PUT /boards/{id}` on a path board returns 409 and leaves the name unchanged.
  _Tests:_ `PathBoardIntegrationTest.pathBoardsCannotBeRenamedOrArchivedDirectly`

## Visibility

- [ ] **PB-07** A new path's board is shown by default (`hidden=false`).
  _Tests:_ `PathBoardIntegrationTest.creatingAPathCreatesItsBoardWithDefaultStatuses`
- [ ] **PB-08** `POST /boards/{id}/visibility {"hidden":true}` hides a path board: `GET /boards` leaves it out, and `GET /boards?includeHidden=true` includes it. Setting `hidden:false` shows it again with its cards intact.
  _Tests:_ `PathBoardIntegrationTest.hidingAPathBoardKeepsItsCards`
- [ ] **PB-09** Visibility can only be changed on a path board; on a custom board the request returns 409.
  _Tests:_ `PathBoardIntegrationTest.visibilityOnlyAppliesToPathBoards`
- [ ] **PB-10** Path responses include `boardId` and `boardHidden`.
  _Tests:_ `PathBoardIntegrationTest.pathResponsesExposeTheirBoard`

## Path lifecycle

- [ ] **PB-11** A path board is listed only while its path is ACTIVE and not deleted. After the path is deleted the board is gone from `GET /boards`; after the path is restored it comes back.
  _Tests:_ `PathBoardIntegrationTest.deletingAPathHidesItsBoardUntilRestored`
- [ ] **PB-12** `POST /boards/{id}/archive` on a path board returns 409.
  _Tests:_ `PathBoardIntegrationTest.pathBoardsCannotBeRenamedOrArchivedDirectly`
- [ ] **PB-13** Merging path A into path B moves every card on A's board to B's board. Each card goes to the status with the same name (case-insensitive), or to the first active status if there is no match. Archived cards stay archived, the moved cards belong to path B, and A's board is archived.
  _Tests:_ `PathBoardIntegrationTest.mergingPathsMovesCardsByStatusName`

## Cards

- [ ] **PB-14** A card created or updated on a path board always belongs to exactly that board's path. Any `pathIds` in the request are ignored.
  _Tests:_ `PathBoardIntegrationTest.pathBoardCardsAlwaysBelongToTheirPath`
- [ ] **PB-15** Cards on custom boards keep their current path validation: paths are optional and must belong to the user.
  _Tests:_ the existing `KnowIntegrationTest.boardCardsAcceptMultiplePathsAndBoardScopedLabels`

## Tab order, pinning and reordering

- [ ] **PB-16** `GET /boards` returns boards in this order:
  1. pinned custom boards, in manual order
  2. path boards, in Paths page order (pinned, then manual order, then most recent activity)
  3. unpinned custom boards, in manual order, with never-ordered boards falling back to most recently updated first

  _Tests:_ `PathBoardIntegrationTest.boardListFollowsTabOrder`
- [ ] **PB-17** `POST /boards/{id}/pin {"pinned":bool}` pins or unpins a custom board. On a path board it returns 409.
  _Tests:_ `PathBoardIntegrationTest.pinningOnlyAppliesToCustomBoards`
- [ ] **PB-18** `PUT /boards/order {"ids":[…]}` sets the manual order of custom boards. It returns 400 if the list includes another user's board or a path board.
  _Tests:_ `PathBoardIntegrationTest.reorderingCustomBoards`, `PathBoardIntegrationTest.pathBoardMutationsRejectForeignBoards`

## Ownership

- [ ] **PB-19** Changing visibility, pinning or ordering on another user's board returns 404 or 400 and changes nothing.
  _Tests:_ `PathBoardIntegrationTest.pathBoardMutationsRejectForeignBoards`

## Web: board page

- [ ] **PB-20** Board tabs appear in the order the API returns. A path board tab shows its path colour as a decorative dot.
  _Tests:_ `BoardView.test.ts` "renders path boards with a colour dot in API order"
- [ ] **PB-21** The card editor on a path board has no path `<select>`, and cards use the path colour as their accent. The card editor on a custom board still has the path `<select>`.
  _Tests:_ `BoardView.test.ts` "hides the path picker on path boards"
- [ ] **PB-22** Board settings for a path board show the name as read-only text rather than an input, and a "Show on board" switch in place of "Archive board". Turning the switch off asks for confirmation in an in-app dialog.
  _Tests:_ `BoardView.test.ts` "path board settings use a visibility switch"
- [ ] **PB-23** Board settings for a custom board include a "Pin board" switch that calls the pin endpoint.
  _Tests:_ `BoardView.test.ts` "pins a custom board from settings"
- [ ] **PB-24** Custom board tabs can be reordered within their group by dragging the tab, or by pressing Alt+Left or Alt+Right on the focused tab. The new order is sent to `PUT /boards/order`.
  _Tests:_ `BoardView.test.ts` "reorders custom board tabs with the keyboard", `boards.test.ts` "reorderBoards"

## Web: Paths page

- [ ] **PB-25** The path edit dialog has a "Show on board" switch that reflects `boardHidden`.
  _Tests:_ `PathsView.test.ts` "shows the board visibility switch"
- [ ] **PB-26** Turning the switch on calls the visibility endpoint right away.
  _Tests:_ `PathsView.test.ts` "turning the board switch on saves immediately"
- [ ] **PB-27** Turning the switch off opens an in-app confirmation dialog, never `window.confirm` or `window.prompt`:
  - Cancel keeps the switch on and makes no request.
  - Confirm hides the board.
  - The result is announced in a polite live region.

  _Tests:_ `PathsView.test.ts` "turning the board switch off asks for confirmation", "labels the hide confirmation button Hide board", "cancelling the hide confirmation keeps the board visible"

## Acceptance and smoke

- [ ] **PB-28** In the mocked acceptance run, creating a path adds its tab, hiding the path's board from the Paths page removes the tab, and a card on the path board has no path picker.
  _Tests:_ `scripts/board.acceptance.test.mjs` "path boards"
- [ ] **PB-29** The same flow passes against the real stack.
  _Tests:_ `scripts/board.real-stack.acceptance.test.mjs` "path boards"
- [ ] **PB-30** The smoke test confirms that `GET /boards` includes a board with the new path's `pathId` right after the path is created.
  _Tests:_ `scripts/run-smoke-tests.sh`
