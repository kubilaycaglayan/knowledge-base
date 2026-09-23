# Path boards acceptance checklist

Every path owns exactly one board from birth. Path boards sit next to the
custom boards a user creates on `/board`. Each item names the tests that
cover it. Tick an item only once those tests pass.

## Creation and backfill

- [x] **PB-01** Creating a path through `POST /api/v1/paths` creates one board for it. The board takes the path's name and gets the default statuses Backlog, Pending, In Progress and Done, in that order.
  _Tests:_ `PathBoardIntegrationTest.creatingAPathCreatesItsBoardWithDefaultStatuses`
- [x] **PB-02** Creating the board is idempotent: a path never gets a second board, whether it is restored, imported again, or created again through the service.
  _Tests:_ `PathBoardIntegrationTest.restoringAPathReusesItsBoard`, `PathBoardIntegrationTest.createForPathIsIdempotent`
- [x] **PB-03** Paths created by the Clockify import and the Knowledge Base CSV import get a board too.
  _Tests:_ `PathBoardIntegrationTest.importedPathsGetBoards`
- [x] **PB-04** Migration `V45__path_boards.sql` creates one board, with the default statuses, for every non-deleted path that exists before the migration runs.
  _Tests:_ smoke `run-smoke-tests.sh` (Flyway on PostgreSQL), plus manual verification on the dev database

## Naming

- [x] **PB-05** Renaming a path renames its board.
  _Tests:_ `PathBoardIntegrationTest.renamingAPathRenamesItsBoard`
- [x] **PB-06** `PUT /boards/{id}` on a path board returns 409 and leaves the name unchanged.
  _Tests:_ `PathBoardIntegrationTest.pathBoardsCannotBeRenamedOrArchivedDirectly`

## Visibility

- [x] **PB-07** A new path's board is shown by default (`hidden=false`).
  _Tests:_ `PathBoardIntegrationTest.creatingAPathCreatesItsBoardWithDefaultStatuses`
- [x] **PB-08** `POST /boards/{id}/visibility {"hidden":true}` hides a path board: `GET /boards` leaves it out, and `GET /boards?includeHidden=true` includes it. Setting `hidden:false` shows it again with its cards intact.
  _Tests:_ `PathBoardIntegrationTest.hidingAPathBoardKeepsItsCards`
- [x] **PB-09** Visibility can only be changed on a path board; on a custom board the request returns 409.
  _Tests:_ `PathBoardIntegrationTest.visibilityOnlyAppliesToPathBoards`
- [x] **PB-10** Path responses include `boardId` and `boardHidden`.
  _Tests:_ `PathBoardIntegrationTest.pathResponsesExposeTheirBoard`

## Path lifecycle

- [x] **PB-11** A path board is listed only while its path is ACTIVE and not deleted. After the path is deleted the board is gone from `GET /boards`; after the path is restored it comes back.
  _Tests:_ `PathBoardIntegrationTest.deletingAPathHidesItsBoardUntilRestored`
- [x] **PB-12** `POST /boards/{id}/archive` on a path board returns 409.
  _Tests:_ `PathBoardIntegrationTest.pathBoardsCannotBeRenamedOrArchivedDirectly`
- [x] **PB-13** Merging path A into path B moves every card on A's board to B's board. Each card goes to the status with the same name (case-insensitive), or to the first active status if there is no match. Archived cards stay archived, the moved cards belong to path B, and A's board is archived.
  _Tests:_ `PathBoardIntegrationTest.mergingPathsMovesCardsByStatusName`

## Cards

- [x] **PB-14** A card created or updated on a path board always belongs to exactly that board's path. Any `pathIds` in the request are ignored.
  _Tests:_ `PathBoardIntegrationTest.pathBoardCardsAlwaysBelongToTheirPath`
- [x] **PB-15** Cards on custom boards keep their current path validation: paths are optional and must belong to the user.
  _Tests:_ the existing `KnowIntegrationTest.boardCardsAcceptMultiplePathsAndBoardScopedLabels`

## Tab order, pinning and reordering

- [x] **PB-16** `GET /boards` returns pinned boards first, then unpinned boards. Within each group:
  1. boards follow their manual order (`PUT /boards/order`), whether they are path or custom boards
  2. boards never placed by hand come after the ordered ones: path boards in Paths page order, then custom boards in creation order, so a new board lands last
  3. until a path board in the group has been placed by hand, the group keeps the earlier layout: path boards (Paths page order) before custom boards (manual order)

  _Tests:_ `PathBoardIntegrationTest.boardListFollowsTabOrder`, `PathBoardIntegrationTest.customBoardsCanSitBetweenPathBoards`
- [x] **PB-17** `POST /boards/{id}/pin {"pinned":bool}` pins or unpins any active board, path or custom.
  _Tests:_ `PathBoardIntegrationTest.anyBoardCanBePinned`
- [x] **PB-18** `PUT /boards/order {"ids":[…]}` sets the manual order of the listed boards, which may mix path and custom boards. It returns 400 if the list includes another user's board.
  _Tests:_ `PathBoardIntegrationTest.reorderingBoards`, `PathBoardIntegrationTest.pathBoardMutationsRejectForeignBoards`
- [x] **PB-32** A custom board can sit between two path boards. Reordering board tabs never changes the Paths page order.
  _Tests:_ `PathBoardIntegrationTest.customBoardsCanSitBetweenPathBoards`, `BoardView.test.ts` "reorders path and custom boards together from the boards dialog"

## Ownership

- [x] **PB-19** Changing visibility, pinning or ordering on another user's board returns 404 or 400 and changes nothing.
  _Tests:_ `PathBoardIntegrationTest.pathBoardMutationsRejectForeignBoards`

## Web: board page

- [x] **PB-20** Board tabs appear in the order the API returns. A path board tab shows its path colour as a decorative dot.
  _Tests:_ `BoardView.test.ts` "renders path boards with a colour dot in API order"
- [x] **PB-21** The card editor on a path board has no path `<select>`, and neither cards nor the card editor show a path-colour accent border (the tab dot already identifies the path). The card editor on a custom board still has the path `<select>`, and custom-board cards keep their path accent.
  _Tests:_ `BoardView.test.ts` "hides the path picker on path boards"
- [x] **PB-22** Board settings for a path board show the name as read-only text followed by a "Rename…" link to Paths (no "Name" label), and have no Archive board button, pin switch or visibility switch. A board is shown or hidden only from the path edit form on /paths.
  _Tests:_ `BoardView.test.ts` "path board settings are read-only and leave visibility to the Paths page"
- [x] **PB-23** Board tabs have no gear of their own. A single "Manage boards" gear button (the only board-management control on the page) opens a "Boards" dialog listing every active board in tab order. Clicking a board name opens that board's settings. Board settings have no pin switch. The Boards dialog header has an "Add board" button that opens the New board dialog; cancelling returns to the Boards dialog.
  _Tests:_ `BoardView.test.ts` "opens the boards dialog from the single gear and each name opens its settings"
- [x] **PB-24** In the Boards dialog, every board row (path or custom) has a drag handle. Dragging it up or down, or pressing ArrowUp or ArrowDown on the focused handle, reorders the board within its group (pinned or unpinned) and sends that group's full order to `PUT /boards/order`. Path board rows keep their colour dot.
  _Tests:_ `BoardView.test.ts` "reorders path and custom boards together from the boards dialog", `boards.test.ts` "reorderBoards"
- [x] **PB-31** Every board row in the Boards dialog has a pin button (`aria-pressed`) that pins or unpins the board and moves it between the pinned and unpinned groups.
  _Tests:_ `BoardView.test.ts` "pins and unpins any board from the boards dialog"

## Web: Paths page

- [x] **PB-25** The path edit dialog has a "Show on board" switch that reflects `boardHidden`.
  _Tests:_ `PathsView.test.ts` "shows the board visibility switch"
- [x] **PB-26** Turning the switch on calls the visibility endpoint right away.
  _Tests:_ `PathsView.test.ts` "turning the board switch on saves immediately"
- [x] **PB-27** Turning the switch off opens an in-app confirmation dialog, never `window.confirm` or `window.prompt`:
  - Cancel keeps the switch on and makes no request.
  - Confirm hides the board.
  - The result is announced in a polite live region.

  _Tests:_ `PathsView.test.ts` "turning the board switch off asks for confirmation", "labels the hide confirmation button Hide board", "cancelling the hide confirmation keeps the board visible"

## Acceptance and smoke

- [x] **PB-28** In the mocked acceptance run, creating a path adds its tab, hiding the path's board from the Paths page removes the tab, and a card on the path board has no path picker.
  _Tests:_ `scripts/board.acceptance.test.mjs` "path boards"
- [x] **PB-29** The same flow passes against the real stack.
  _Tests:_ `scripts/board.real-stack.acceptance.test.mjs` "path boards"
- [x] **PB-30** The smoke test confirms that `GET /boards` includes a board with the new path's `pathId` right after the path is created.
  _Tests:_ `scripts/run-smoke-tests.sh`
